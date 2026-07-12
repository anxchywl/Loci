import logging
import uuid
import warnings
from io import BytesIO

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from PIL.Image import DecompressionBombError, DecompressionBombWarning
from pillow_heif import register_heif_opener
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.observability import counter, log_event, observe
from app.db.repositories import photos as photos_repo
from app.db.repositories import stories as stories_repo
from app.integrations import storage
from app.modules.stories.schemas import PhotoUploadResponse
from app.modules.stories.service import StoryNotFound

logger = logging.getLogger(__name__)

_UPLOAD_TOTAL_HELP = "Story photo uploads finalized, by transport path and outcome."
_UPLOAD_DURATION_HELP = "Client-observed story photo upload duration in seconds, by path."
_FALLBACK_HELP = "Story photo uploads that fell back to the backend proxy path."
_PROXY_TOTAL_HELP = "Proxy-path photo byte uploads received by the backend, by outcome."


def _record_upload(path: str | None, outcome: str, duration_ms: int | None) -> None:
    """Emit metrics/logs for a finalized upload, whichever path delivered it.

    Both the direct and proxy paths converge on ``complete_upload``, so this is
    the single place upload outcomes are counted — guaranteeing the two paths
    are measured identically.
    """
    labelled = path or "unknown"
    counter("photo_upload_total", help=_UPLOAD_TOTAL_HELP, labels={"path": labelled, "outcome": outcome})
    if path == "proxy":
        counter("photo_upload_fallback_total", help=_FALLBACK_HELP)
    if duration_ms is not None:
        observe(
            "photo_upload_duration_seconds",
            duration_ms / 1000,
            help=_UPLOAD_DURATION_HELP,
            labels={"path": labelled},
        )
    log_event(
        logger,
        "photo_upload_complete",
        level=logging.INFO if outcome == "ready" else logging.WARNING,
        path=labelled,
        outcome=outcome,
        duration_ms=duration_ms,
    )

_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}
_FORMATS = {
    "image/jpeg": {"JPEG"},
    "image/png": {"PNG"},
    "image/webp": {"WEBP"},
    "image/heic": {"HEIF", "HEIC"},
}
_MAX_SOURCE_EDGE = 20_000
_MAX_SOURCE_PIXELS = 40_000_000

register_heif_opener()


def _validate_image_bytes(raw: bytes, content_type: str) -> None:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                width, height = image.size
                if max(width, height) > _MAX_SOURCE_EDGE or width * height > _MAX_SOURCE_PIXELS:
                    raise ValueError("image dimensions are too large")
                if image.format not in _FORMATS[content_type]:
                    raise ValueError("image content does not match its declared type")
                image.verify()
    except (DecompressionBombError, DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid supported image",
        ) from error


async def create_upload_url(
    db: AsyncSession,
    story_id: uuid.UUID,
    author_id: int,
    content_type: str,
    settings: Settings,
) -> PhotoUploadResponse:
    story = await stories_repo.get_owned(db, story_id, author_id)
    if story is None:
        raise StoryNotFound()

    if await photos_repo.count_for_story(db, story_id) >= settings.max_photos_per_story:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"a story can have at most {settings.max_photos_per_story} photos",
        )

    photo_id = uuid.uuid4()
    extension = _EXTENSIONS[content_type]
    object_key = f"stories/{story_id}/{photo_id}/original.{extension}"

    position = await photos_repo.count_for_story(db, story_id)
    photo = await photos_repo.create(
        db,
        photo_id=photo_id,
        story_id=story_id,
        object_key=object_key,
        content_type=content_type,
        position=position,
    )
    await db.commit()

    ttl = settings.s3_presigned_url_expires_seconds
    upload_url = storage.presigned_put_url(object_key, ttl)
    return PhotoUploadResponse(photo_id=photo.id, upload_url=upload_url, expires_in=ttl)


async def complete_upload(
    db: AsyncSession,
    story_id: uuid.UUID,
    photo_id: uuid.UUID,
    author_id: int,
    settings: Settings,
    *,
    upload_path: str | None = None,
    duration_ms: int | None = None,
    fallback_reason: str | None = None,
) -> None:
    """Finalize an uploaded photo: size-check, validate, and queue optimization.

    This is the single processing pipeline for BOTH transports. The direct
    (presigned) and proxy paths only differ in how bytes land in the bucket; from
    here on the size limit, content validation, optimization, metadata extraction
    and any future content checks are identical because they all run here.
    """
    # optimization is queued only after the client confirms the bytes are in the bucket
    story = await stories_repo.get_owned(db, story_id, author_id)
    if story is None:
        raise StoryNotFound()

    photo = await photos_repo.get(db, photo_id)
    if photo is None or photo.story_id != story_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    if fallback_reason:
        log_event(
            logger,
            "photo_upload_fallback",
            level=logging.WARNING,
            photo_id=str(photo_id),
            reason=fallback_reason,
        )

    object_size = storage.get_object_size(photo.object_key)
    if object_size is None:
        _record_upload(upload_path, "missing", duration_ms)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Photo upload not found")

    max_upload_bytes = settings.max_upload_size_mb * 1024 * 1024
    if object_size > max_upload_bytes:
        storage.delete_object(photo.object_key)
        await photos_repo.mark_failed(db, photo.id)
        await db.commit()
        _record_upload(upload_path, "too_large", duration_ms)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Photo must not exceed {settings.max_upload_size_mb} MB",
        )

    try:
        raw = storage.get_object_bytes(photo.object_key)
        _validate_image_bytes(raw, photo.content_type)
    except HTTPException:
        storage.delete_object(photo.object_key)
        await photos_repo.mark_failed(db, photo.id)
        await db.commit()
        _record_upload(upload_path, "invalid", duration_ms)
        raise

    from app.workers.tasks import optimize_photo

    optimize_photo.delay(str(photo.id))
    _record_upload(upload_path, "ready", duration_ms)


async def upload_bytes(
    db: AsyncSession,
    story_id: uuid.UUID,
    photo_id: uuid.UUID,
    author_id: int,
    raw: bytes,
    settings: Settings,
) -> None:
    """Proxy transport: store raw bytes in the bucket on the client's behalf.

    Deliberately minimal — it only gets bytes into storage, exactly like a
    successful direct presigned PUT would. All validation and processing happen
    later in ``complete_upload`` so both transports share one pipeline.
    """
    story = await stories_repo.get_owned(db, story_id, author_id)
    if story is None:
        counter("photo_proxy_upload_total", help=_PROXY_TOTAL_HELP, labels={"outcome": "not_found"})
        raise StoryNotFound()
    photo = await photos_repo.get(db, photo_id)
    if photo is None or photo.story_id != story_id:
        counter("photo_proxy_upload_total", help=_PROXY_TOTAL_HELP, labels={"outcome": "not_found"})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    if len(raw) > settings.max_upload_size_mb * 1024 * 1024:
        counter("photo_proxy_upload_total", help=_PROXY_TOTAL_HELP, labels={"outcome": "too_large"})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Photo is too large")
    storage.put_object_bytes(photo.object_key, raw, photo.content_type)
    counter("photo_proxy_upload_total", help=_PROXY_TOTAL_HELP, labels={"outcome": "stored"})
    log_event(logger, "photo_proxy_stored", photo_id=str(photo_id), bytes=len(raw))

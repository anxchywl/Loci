import asyncio
import logging
import time
import uuid
from datetime import UTC, datetime, timedelta
from io import BytesIO

from PIL import Image
from pillow_heif import register_heif_opener
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.observability import counter, observe
from app.core.operational_metrics import record_worker_task
from app.db.models import PhotoStatus
from app.db.models.story import ModerationStatus, StoryVisibility
from app.db.repositories import photos as photos_repo
from app.db.repositories import stories as stories_repo
from app.db.repositories import users as users_repo
from app.modules import notifications
from app.db.repositories import media_deletion_jobs as media_deletion_jobs_repo
from app.db.repositories import refresh_tokens as refresh_tokens_repo
from app.integrations import storage
from app.modules.stories.image_validation import InvalidImageError, decode_image
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_EDGE = 2048
THUMB_EDGE = 400
WEBP_QUALITY = 82
STALE_PHOTO_RETENTION = timedelta(hours=24)
CLEANUP_BATCH_SIZE = 100
PHOTO_MAX_RETRIES = 3
Image.MAX_IMAGE_PIXELS = 40_000_000

register_heif_opener()


def _encode_webp(image: Image.Image, max_edge: int) -> tuple[bytes, int, int]:
    converted = image.convert("RGB")
    converted.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buffer = BytesIO()
    converted.save(buffer, format="WEBP", quality=WEBP_QUALITY)
    return buffer.getvalue(), converted.width, converted.height


async def _optimize(photo_id: uuid.UUID) -> str:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    try:
        return await _optimize_with_engine(engine, photo_id)
    finally:
        # dispose connections after every task outcome
        await engine.dispose()


async def _optimize_with_engine(engine, photo_id: uuid.UUID) -> str:
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as db:
        photo = await photos_repo.get(db, photo_id)
        if photo is None or photo.status == PhotoStatus.ready:
            return "success"
        source_key = photo.object_key
        started = time.perf_counter()

        try:
            raw = storage.get_object_bytes(source_key)
            max_bytes = get_settings().max_upload_size_mb * 1024 * 1024
            if len(raw) > max_bytes:
                raise InvalidImageError("image is too large")
            image = decode_image(raw, photo.content_type)

            try:
                full_bytes, width, height = _encode_webp(image, MAX_EDGE)
                thumb_bytes, _, _ = _encode_webp(image, THUMB_EDGE)
            finally:
                image.close()

            base = source_key.rsplit("/", 1)[0]
            full_key = f"{base}/full.webp"
            thumb_key = f"{base}/thumb.webp"

            storage.put_object_bytes(full_key, full_bytes, "image/webp")
            storage.put_object_bytes(thumb_key, thumb_bytes, "image/webp")

            photo_exists = await photos_repo.mark_ready(
                db,
                photo_id,
                object_key=full_key,
                thumb_key=thumb_key,
                width=width,
                height=height,
                content_type="image/webp",
            )
            if not photo_exists:
                storage.delete_object(full_key)
                storage.delete_object(thumb_key)
                storage.delete_object(source_key)
                await db.rollback()
                return "success"
            await db.commit()
            try:
                storage.delete_object(source_key)
            except Exception:
                logger.warning("optimized photo source cleanup failed", exc_info=True)
                counter(
                    "photo_source_cleanup_failures_total",
                    help="Optimized photo source objects that could not be deleted.",
                )
            counter(
                "photo_processing_total",
                help="Photo processing outcomes.",
                labels={"outcome": "ready"},
            )
            observe(
                "photo_processing_duration_seconds",
                time.perf_counter() - started,
                help="Photo processing duration in seconds.",
            )
            return "success"
        except InvalidImageError:
            try:
                storage.delete_object(source_key)
            except Exception:
                logger.warning("invalid photo source cleanup failed", exc_info=True)
            await photos_repo.mark_failed(db, photo_id)
            await db.commit()
            counter(
                "photo_processing_total",
                help="Photo processing outcomes.",
                labels={"outcome": "invalid"},
            )
            logger.info("photo validation rejected uploaded bytes", extra={"photo_id": str(photo_id)})
            return "invalid"


async def _mark_photo_failed(photo_id: uuid.UUID) -> None:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            await photos_repo.mark_failed(db, photo_id)
            await db.commit()
    finally:
        await engine.dispose()


@celery_app.task(
    bind=True,
    name="photos.optimize",
    max_retries=PHOTO_MAX_RETRIES,
    soft_time_limit=240,
    time_limit=300,
)
def optimize_photo(self, photo_id: str) -> None:
    parsed_id = uuid.UUID(photo_id)
    started = time.perf_counter()
    try:
        outcome = asyncio.run(_optimize(parsed_id))
        record_worker_task("photos.optimize", outcome, time.perf_counter() - started)
    except Exception as error:
        if self.request.retries >= PHOTO_MAX_RETRIES:
            asyncio.run(_mark_photo_failed(parsed_id))
            counter(
                "photo_processing_total",
                help="Photo processing outcomes.",
                labels={"outcome": "failed"},
            )
            record_worker_task("photos.optimize", "failed", time.perf_counter() - started)
            raise
        countdown = min(30 * (2**self.request.retries), 300)
        raise self.retry(exc=error, countdown=countdown) from error


async def _send_telegram(telegram_id: int, text: str) -> None:
    from aiogram import Bot

    settings = get_settings()
    if not settings.telegram_bot_token:
        return
    bot = Bot(token=settings.telegram_bot_token)
    try:
        await bot.send_message(chat_id=telegram_id, text=text)
    finally:
        await bot.session.close()


@celery_app.task(
    bind=True,
    name="notifications.telegram",
    max_retries=3,
)
def send_telegram_message(self, telegram_id: int, text: str) -> None:
    started = time.perf_counter()
    try:
        asyncio.run(_send_telegram(telegram_id, text))
        record_worker_task(
            "notifications.telegram", "success", time.perf_counter() - started
        )
    except Exception as error:
        if self.request.retries >= 3:
            record_worker_task(
                "notifications.telegram", "failed", time.perf_counter() - started
            )
            raise
        raise self.retry(exc=error, countdown=min(30 * (2**self.request.retries), 300))


PENDING_REVIEW_UPLOAD_GRACE = timedelta(minutes=15)
PENDING_REVIEW_RECHECK_SECONDS = 30
PENDING_REVIEW_MAX_RECHECKS = 20


async def pending_review_message(
    db, story_id: uuid.UUID, now: datetime, *, wait_for_uploads: bool = True
) -> tuple[str, str | None]:
    """decide whether the admin ping for a story is due

    returns ("skip", None) when the story no longer needs review, ("wait", None)
    while its photos are still uploading, or ("send", text) when it is ready"""
    story = await stories_repo.get_owned_any(db, story_id)
    if (
        story is None
        or story.moderation_status != ModerationStatus.pending
        or story.visibility != StoryVisibility.public
    ):
        return "skip", None
    if wait_for_uploads and await photos_repo.has_inflight_uploads(
        db, story_id, now - PENDING_REVIEW_UPLOAD_GRACE
    ):
        return "wait", None
    author = await users_repo.get_by_id(db, story.author_id) if story.author_id else None
    label = notifications.author_label(author, anonymous=story.is_anonymous)
    return "send", notifications.render_admin_pending_review(story.title, label)


async def _notify_admins_pending_review(story_id: uuid.UUID, *, force: bool) -> str:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            # on the last recheck stop waiting for a stuck upload and send anyway
            outcome, text = await pending_review_message(
                db, story_id, datetime.now(UTC), wait_for_uploads=not force
            )
    finally:
        await engine.dispose()
    if outcome == "send" and text:
        for admin_id in settings.admin_ids:
            await _send_telegram(admin_id, text)
    return outcome


@celery_app.task(
    bind=True,
    name="notifications.admin_pending_review",
    max_retries=PENDING_REVIEW_MAX_RECHECKS,
)
def notify_admins_pending_review(self, story_id: str) -> None:
    started = time.perf_counter()
    force = self.request.retries >= PENDING_REVIEW_MAX_RECHECKS
    try:
        outcome = asyncio.run(_notify_admins_pending_review(uuid.UUID(story_id), force=force))
    except Exception as error:
        if force:
            record_worker_task(
                "notifications.admin_pending_review", "failed", time.perf_counter() - started
            )
            raise
        raise self.retry(exc=error, countdown=PENDING_REVIEW_RECHECK_SECONDS) from error
    if outcome == "wait":
        raise self.retry(countdown=PENDING_REVIEW_RECHECK_SECONDS)
    record_worker_task(
        "notifications.admin_pending_review", outcome, time.perf_counter() - started
    )


async def _cleanup_refresh_tokens() -> int:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            cutoff = datetime.now(UTC) - timedelta(days=settings.refresh_token_expire_days)
            deleted = await refresh_tokens_repo.delete_stale(db, cutoff)
            await db.commit()
            return deleted
    finally:
        await engine.dispose()


@celery_app.task(
    name="maintenance.cleanup_refresh_tokens",
    soft_time_limit=120,
    time_limit=180,
)
def cleanup_refresh_tokens() -> int:
    started = time.perf_counter()
    try:
        result = asyncio.run(_cleanup_refresh_tokens())
        record_worker_task(
            "maintenance.cleanup_refresh_tokens",
            "success",
            time.perf_counter() - started,
        )
        return result
    except Exception:
        record_worker_task(
            "maintenance.cleanup_refresh_tokens",
            "failed",
            time.perf_counter() - started,
        )
        raise


async def _cleanup_stale_photos() -> int:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            cutoff = datetime.now(UTC) - STALE_PHOTO_RETENTION
            photos = await photos_repo.list_stale_uploads_for_update(
                db, cutoff, CLEANUP_BATCH_SIZE
            )
            for photo in photos:
                storage.delete_object(photo.object_key)
            deleted = await photos_repo.delete_by_ids(db, [photo.id for photo in photos])
            await db.commit()
            return deleted
    finally:
        await engine.dispose()


@celery_app.task(
    name="maintenance.cleanup_stale_photos",
    soft_time_limit=120,
    time_limit=180,
)
def cleanup_stale_photos() -> int:
    started = time.perf_counter()
    try:
        result = asyncio.run(_cleanup_stale_photos())
        record_worker_task(
            "maintenance.cleanup_stale_photos",
            "success",
            time.perf_counter() - started,
        )
        return result
    except Exception:
        record_worker_task(
            "maintenance.cleanup_stale_photos",
            "failed",
            time.perf_counter() - started,
        )
        raise


async def _cleanup_deleted_media() -> int:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    deleted = 0
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        for _ in range(CLEANUP_BATCH_SIZE):
            async with maker() as db:
                job = await media_deletion_jobs_repo.claim_due(db)
                if job is None:
                    await db.rollback()
                    break
                try:
                    storage.delete_object(job.object_key)
                    await storage.invalidate_presigned_get_url(job.object_key)
                    await media_deletion_jobs_repo.complete(db, job)
                    await db.commit()
                    deleted += 1
                except Exception as error:
                    media_deletion_jobs_repo.retry(job, error)
                    await db.commit()
        return deleted
    finally:
        await engine.dispose()


@celery_app.task(
    name="maintenance.cleanup_deleted_media",
    soft_time_limit=120,
    time_limit=180,
)
def cleanup_deleted_media() -> int:
    started = time.perf_counter()
    try:
        result = asyncio.run(_cleanup_deleted_media())
        record_worker_task(
            "maintenance.cleanup_deleted_media",
            "success",
            time.perf_counter() - started,
        )
        return result
    except Exception:
        record_worker_task(
            "maintenance.cleanup_deleted_media",
            "failed",
            time.perf_counter() - started,
        )
        raise

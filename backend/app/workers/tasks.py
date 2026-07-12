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
from app.db.repositories import photos as photos_repo
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

            await photos_repo.mark_ready(
                db,
                photo_id,
                object_key=full_key,
                thumb_key=thumb_key,
                width=width,
                height=height,
                content_type="image/webp",
            )
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

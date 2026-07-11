import asyncio
import logging
import uuid
from io import BytesIO

from PIL import Image
from pillow_heif import register_heif_opener
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.repositories import photos as photos_repo
from app.integrations import storage
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_EDGE = 2048
THUMB_EDGE = 400
WEBP_QUALITY = 82

register_heif_opener()


def _encode_webp(image: Image.Image, max_edge: int) -> tuple[bytes, int, int]:
    converted = image.convert("RGB")
    converted.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buffer = BytesIO()
    converted.save(buffer, format="WEBP", quality=WEBP_QUALITY)
    return buffer.getvalue(), converted.width, converted.height


async def _optimize(photo_id: uuid.UUID) -> None:
    settings = get_settings()
    engine = create_async_engine(settings.sqlalchemy_database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as db:
        photo = await photos_repo.get(db, photo_id)
        if photo is None:
            return
        source_key = photo.object_key

        try:
            raw = storage.get_object_bytes(source_key)
            image = Image.open(BytesIO(raw))

            full_bytes, width, height = _encode_webp(image, MAX_EDGE)
            thumb_bytes, _, _ = _encode_webp(image, THUMB_EDGE)

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
            # originals are never served; drop them once the webp pair exists
            storage.delete_object(source_key)
        except Exception:
            logger.exception("photo optimization failed for %s", photo_id)
            await photos_repo.mark_failed(db, photo_id)
            await db.commit()
            raise

    await engine.dispose()


@celery_app.task(name="photos.optimize")
def optimize_photo(photo_id: str) -> None:
    asyncio.run(_optimize(uuid.UUID(photo_id)))


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
    name="notifications.telegram",
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_telegram_message(telegram_id: int, text: str) -> None:
    asyncio.run(_send_telegram(telegram_id, text))

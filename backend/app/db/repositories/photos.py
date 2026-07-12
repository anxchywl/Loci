import uuid
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PhotoStatus, StoryPhoto


async def create(
    db: AsyncSession,
    *,
    photo_id: uuid.UUID,
    story_id: uuid.UUID,
    object_key: str,
    content_type: str,
    position: int,
) -> StoryPhoto:
    # id is chosen by the caller because the object key embeds it before insert
    photo = StoryPhoto(
        id=photo_id,
        story_id=story_id,
        object_key=object_key,
        content_type=content_type,
        position=position,
    )
    db.add(photo)
    await db.flush()
    return photo


async def get(db: AsyncSession, photo_id: uuid.UUID) -> StoryPhoto | None:
    return await db.get(StoryPhoto, photo_id)


async def get_for_update(db: AsyncSession, photo_id: uuid.UUID) -> StoryPhoto | None:
    result = await db.execute(
        select(StoryPhoto).where(StoryPhoto.id == photo_id).with_for_update()
    )
    return result.scalar_one_or_none()


async def list_stale_uploads_for_update(
    db: AsyncSession, cutoff: datetime, limit: int
) -> list[StoryPhoto]:
    result = await db.execute(
        select(StoryPhoto)
        .where(
            StoryPhoto.status.in_((PhotoStatus.pending, PhotoStatus.failed)),
            StoryPhoto.created_at < cutoff,
        )
        .order_by(StoryPhoto.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return list(result.scalars().all())


async def delete_by_ids(db: AsyncSession, photo_ids: list[uuid.UUID]) -> int:
    if not photo_ids:
        return 0
    result = await db.execute(delete(StoryPhoto).where(StoryPhoto.id.in_(photo_ids)))
    await db.flush()
    return result.rowcount


async def list_for_story(db: AsyncSession, story_id: uuid.UUID) -> list[StoryPhoto]:
    result = await db.execute(
        select(StoryPhoto)
        .where(StoryPhoto.story_id == story_id, StoryPhoto.status == PhotoStatus.ready)
        .order_by(StoryPhoto.position)
    )
    return list(result.scalars().all())


async def list_for_stories(
    db: AsyncSession, story_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[StoryPhoto]]:
    """Ready photos for many stories in one query, grouped by story id.
    Used by the moderation queue so it never issues a per-story photo query."""
    if not story_ids:
        return {}
    result = await db.execute(
        select(StoryPhoto)
        .where(StoryPhoto.story_id.in_(story_ids), StoryPhoto.status == PhotoStatus.ready)
        .order_by(StoryPhoto.story_id, StoryPhoto.position)
    )
    grouped: dict[uuid.UUID, list[StoryPhoto]] = {}
    for photo in result.scalars().all():
        grouped.setdefault(photo.story_id, []).append(photo)
    return grouped


async def count_for_story(db: AsyncSession, story_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(StoryPhoto)
        .where(
            StoryPhoto.story_id == story_id,
            StoryPhoto.status != PhotoStatus.failed,
        )
    )
    return (await db.execute(stmt)).scalar_one()


async def mark_ready(
    db: AsyncSession,
    photo_id: uuid.UUID,
    *,
    object_key: str,
    thumb_key: str,
    width: int,
    height: int,
    content_type: str,
) -> None:
    photo = await db.get(StoryPhoto, photo_id)
    if photo is None:
        return
    photo.object_key = object_key
    photo.thumb_key = thumb_key
    photo.width = width
    photo.height = height
    photo.content_type = content_type
    photo.status = PhotoStatus.ready
    await db.flush()


async def mark_failed(db: AsyncSession, photo_id: uuid.UUID) -> None:
    photo = await db.get(StoryPhoto, photo_id)
    if photo is not None:
        photo.status = PhotoStatus.failed
        await db.flush()

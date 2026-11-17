import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MediaDeletionJob, StoryPhoto

_ORIGINAL_EXTENSIONS = ("jpg", "png", "webp", "heic")


async def enqueue_for_story(db: AsyncSession, story_id: uuid.UUID) -> int:
    """Queue every stored object of a story's photos for durable deletion. Call
    in the same transaction that removes the story so no object is orphaned."""
    rows = await db.execute(
        select(StoryPhoto.object_key, StoryPhoto.thumb_key).where(
            StoryPhoto.story_id == story_id
        )
    )
    object_keys: set[str] = set()
    for row in rows:
        object_keys.update(key for key in (row.object_key, row.thumb_key) if key)
        # the upload original may still exist if optimization never finished
        base = row.object_key.rsplit("/", 1)[0]
        object_keys.update(f"{base}/original.{ext}" for ext in _ORIGINAL_EXTENSIONS)
    if not object_keys:
        return 0
    await db.execute(
        insert(MediaDeletionJob)
        .values([{"object_key": key} for key in sorted(object_keys)])
        .on_conflict_do_nothing(index_elements=[MediaDeletionJob.object_key])
    )
    return len(object_keys)


async def claim_due(db: AsyncSession) -> MediaDeletionJob | None:
    return (
        await db.execute(
            select(MediaDeletionJob)
            .where(MediaDeletionJob.next_attempt_at <= datetime.now(UTC))
            .order_by(MediaDeletionJob.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
    ).scalar_one_or_none()


async def complete(db: AsyncSession, job: MediaDeletionJob) -> None:
    await db.delete(job)


def retry(job: MediaDeletionJob, error: Exception) -> None:
    job.attempts += 1
    delay_seconds = min(60 * (2 ** min(job.attempts - 1, 10)), 86_400)
    job.next_attempt_at = datetime.now(UTC) + timedelta(seconds=delay_seconds)
    job.last_error = type(error).__name__[:500]

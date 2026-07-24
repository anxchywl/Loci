from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MediaDeletionJob


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

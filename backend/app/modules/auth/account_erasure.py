from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import account_erasure as erasure_repo


async def erase_account(db: AsyncSession, user_id: int):
    session_ids = await erasure_repo.erase_user(db, user_id, datetime.now(UTC))
    await db.commit()
    return session_ids

from sqlalchemy import delete as sa_delete
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PasswordCredential


async def get(db: AsyncSession, user_id: int) -> PasswordCredential | None:
    return await db.get(PasswordCredential, user_id)


async def delete(db: AsyncSession, user_id: int) -> None:
    await db.execute(sa_delete(PasswordCredential).where(PasswordCredential.user_id == user_id))


async def upsert(db: AsyncSession, user_id: int, password_hash: str) -> None:
    stmt = (
        postgres_insert(PasswordCredential)
        .values(user_id=user_id, password_hash=password_hash)
        .on_conflict_do_update(
            index_elements=[PasswordCredential.user_id],
            set_={"password_hash": password_hash, "updated_at": func.now()},
        )
    )
    await db.execute(stmt)

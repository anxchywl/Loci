import uuid
from datetime import datetime

from sqlalchemy import and_, delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.refresh_token import RefreshToken


async def create(
    db: AsyncSession,
    user_id: int,
    token_hash: str,
    expires_at: datetime,
    metadata=None,
    session_id: uuid.UUID | None = None,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        session_id=session_id or uuid.uuid4(),
        token_hash=token_hash,
        expires_at=expires_at,
        user_agent_summary=getattr(metadata, "user_agent_summary", None),
        device_type=getattr(metadata, "device_type", None),
        browser=getattr(metadata, "browser", None),
        operating_system=getattr(metadata, "operating_system", None),
        ip_hash=getattr(metadata, "ip_hash", None),
    )
    db.add(token)
    await db.flush()
    return token


async def get_by_hash(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    return result.scalar_one_or_none()


async def get_by_hash_for_update(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def revoke(db: AsyncSession, token: RefreshToken, when: datetime) -> None:
    token.revoked_at = when
    await db.flush()


async def revoke_all_for_user(db: AsyncSession, user_id: int, when: datetime) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=when)
    )
    await db.flush()


async def revoke_all_for_session(
    db: AsyncSession, session_id: uuid.UUID, when: datetime
) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.session_id == session_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=when)
    )
    await db.flush()


async def delete_stale(db: AsyncSession, cutoff: datetime) -> int:
    result = await db.execute(
        delete(RefreshToken).where(
            or_(
                RefreshToken.expires_at < cutoff,
                and_(RefreshToken.revoked_at.is_not(None), RefreshToken.revoked_at < cutoff),
            )
        )
    )
    await db.flush()
    return result.rowcount


async def has_active_session(db: AsyncSession, session_id: uuid.UUID, now: datetime) -> bool:
    statement = select(
        exists().where(
            RefreshToken.session_id == session_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
    )
    return bool((await db.execute(statement)).scalar_one())

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
    authenticated_at: datetime | None = None,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        session_id=session_id or uuid.uuid4(),
        token_hash=token_hash,
        expires_at=expires_at,
        authenticated_at=authenticated_at,
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


async def get_session_authenticated_at(
    db: AsyncSession, session_id: uuid.UUID
) -> datetime | None:
    stmt = (
        select(RefreshToken.authenticated_at)
        .where(RefreshToken.session_id == session_id)
        .order_by(RefreshToken.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def session_ids_for_user(db: AsyncSession, user_id: int) -> list[uuid.UUID]:
    stmt = select(RefreshToken.session_id).where(RefreshToken.user_id == user_id).distinct()
    return list((await db.execute(stmt)).scalars().all())


async def session_belongs_to_user(
    db: AsyncSession, session_id: uuid.UUID, user_id: int
) -> bool:
    stmt = select(
        exists().where(
            RefreshToken.session_id == session_id, RefreshToken.user_id == user_id
        )
    )
    return bool((await db.execute(stmt)).scalar_one())


async def list_sessions(db: AsyncSession, user_id: int, now: datetime) -> list[RefreshToken]:
    # one row per session (the newest token, which reflects current state)
    stmt = (
        select(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .order_by(RefreshToken.session_id, RefreshToken.created_at.desc())
        .distinct(RefreshToken.session_id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def has_active_session(db: AsyncSession, session_id: uuid.UUID, now: datetime) -> bool:
    statement = select(
        exists().where(
            RefreshToken.session_id == session_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
    )
    return bool((await db.execute(statement)).scalar_one())

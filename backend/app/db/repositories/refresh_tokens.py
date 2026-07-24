import uuid
from datetime import datetime

from sqlalchemy import and_, delete, exists, func, or_, select, update
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


async def find_device_session(
    db: AsyncSession, user_id: int, user_agent_summary: str, now: datetime
) -> uuid.UUID | None:
    """The user's newest live session that was opened from this same client.

    Signing in again from a device the user is already signed in on continues
    that session instead of opening another one, so the sessions list stays a
    list of devices. Matching is on the user agent alone: mobile IPs rotate
    constantly, and keying on the (hashed) IP too would spawn a fresh session
    every time the network changed.
    """
    stmt = (
        select(RefreshToken.session_id)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.user_agent_summary == user_agent_summary,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def list_sessions(db: AsyncSession, user_id: int, now: datetime):
    """One row per session: newest token for the metadata, aggregates for the rest.

    A session spans every token in its rotation chain, so its lifetime is the
    earliest token's creation through the latest use, and it counts as live
    while any of its tokens is unrevoked and unexpired.
    """
    partition = {"partition_by": RefreshToken.session_id}
    live = and_(RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now)
    stmt = (
        select(
            RefreshToken.session_id,
            RefreshToken.user_agent_summary,
            RefreshToken.device_type,
            RefreshToken.browser,
            RefreshToken.operating_system,
            func.min(RefreshToken.created_at).over(**partition).label("created_at"),
            func.max(RefreshToken.last_used_at).over(**partition).label("last_used_at"),
            func.bool_or(live).over(**partition).label("active"),
        )
        .where(RefreshToken.user_id == user_id)
        .order_by(RefreshToken.session_id, RefreshToken.created_at.desc())
        .distinct(RefreshToken.session_id)
    )
    return list((await db.execute(stmt)).all())


async def has_active_session(db: AsyncSession, session_id: uuid.UUID, now: datetime) -> bool:
    statement = select(
        exists().where(
            RefreshToken.session_id == session_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
    )
    return bool((await db.execute(statement)).scalar_one())

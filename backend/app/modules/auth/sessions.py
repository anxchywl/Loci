"""Self-service session management: list, revoke one, and logout everywhere."""

import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import session_cache
from app.db.repositories import audit as audit_repo
from app.db.repositories import refresh_tokens as refresh_tokens_repo
from app.modules.auth.schemas import SessionSummary


async def list_sessions(
    db: AsyncSession, user_id: int, current_session_id: uuid.UUID | None
) -> list[SessionSummary]:
    now = datetime.now(UTC)
    rows = await refresh_tokens_repo.list_sessions(db, user_id, now)
    summaries = [
        SessionSummary(
            id=str(row.session_id),
            current=row.session_id == current_session_id,
            active=row.revoked_at is None and row.expires_at > now,
            created_at=row.created_at,
            last_used_at=row.last_used_at,
            device_type=row.device_type,
            browser=row.browser,
            operating_system=row.operating_system,
        )
        for row in rows
    ]
    # active first, then most recently used
    summaries.sort(key=lambda s: (s.active, s.last_used_at), reverse=True)
    return summaries


async def revoke_session(
    db: AsyncSession, redis: Redis, user_id: int, session_id: uuid.UUID, ip_hash: str | None
) -> bool:
    if not await refresh_tokens_repo.session_belongs_to_user(db, session_id, user_id):
        return False
    now = datetime.now(UTC)
    await refresh_tokens_repo.revoke_all_for_session(db, session_id, now)
    await audit_repo.record(
        db, user_id, "session_revoked", detail=str(session_id), ip_hash=ip_hash
    )
    await db.commit()
    await session_cache.invalidate_session(redis, session_id)
    return True


async def logout_everywhere(
    db: AsyncSession, redis: Redis, user_id: int, ip_hash: str | None
) -> None:
    now = datetime.now(UTC)
    session_ids = await refresh_tokens_repo.session_ids_for_user(db, user_id)
    await refresh_tokens_repo.revoke_all_for_user(db, user_id, now)
    await audit_repo.record(db, user_id, "logged_out_all", ip_hash=ip_hash)
    await db.commit()
    for session_id in session_ids:
        await session_cache.invalidate_session(redis, session_id)

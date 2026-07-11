from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.refresh_token import RefreshToken


async def create(
    db: AsyncSession, user_id: int, token_hash: str, expires_at: datetime, metadata=None
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
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


async def revoke(db: AsyncSession, token: RefreshToken, when: datetime) -> None:
    token.revoked_at = when
    await db.flush()


async def revoke_all_for_user(db: AsyncSession, user_id: int, when: datetime) -> None:
    from sqlalchemy import update

    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=when)
    )
    await db.flush()

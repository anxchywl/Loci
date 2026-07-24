from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SecurityAuditEvent


async def record(
    db: AsyncSession,
    user_id: int,
    event_type: str,
    *,
    provider: str | None = None,
    detail: str | None = None,
    ip_hash: str | None = None,
) -> None:
    db.add(
        SecurityAuditEvent(
            user_id=user_id,
            event_type=event_type,
            provider=provider,
            detail=detail,
            ip_hash=ip_hash,
        )
    )

from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EmailChallenge


async def replace(
    db: AsyncSession,
    *,
    purpose: str,
    email: str,
    code_hmac: str,
    expires_at: datetime,
    user_id: int | None = None,
    password_hash: str | None = None,
) -> EmailChallenge:
    """issue a fresh challenge, invalidating any prior one for this email+purpose"""
    await db.execute(
        delete(EmailChallenge).where(
            EmailChallenge.email == email, EmailChallenge.purpose == purpose
        )
    )
    challenge = EmailChallenge(
        purpose=purpose,
        email=email,
        user_id=user_id,
        code_hmac=code_hmac,
        password_hash=password_hash,
        expires_at=expires_at,
    )
    db.add(challenge)
    await db.flush()
    return challenge


async def get_active(
    db: AsyncSession, email: str, purpose: str, now: datetime
) -> EmailChallenge | None:
    stmt = (
        select(EmailChallenge)
        .where(
            EmailChallenge.email == email,
            EmailChallenge.purpose == purpose,
            EmailChallenge.consumed_at.is_(None),
            EmailChallenge.expires_at > now,
        )
        .with_for_update()
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def latest(db: AsyncSession, email: str, purpose: str) -> EmailChallenge | None:
    stmt = (
        select(EmailChallenge)
        .where(EmailChallenge.email == email, EmailChallenge.purpose == purpose)
        .order_by(EmailChallenge.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def increment_attempts(db: AsyncSession, challenge_id: int) -> None:
    await db.execute(
        update(EmailChallenge)
        .where(EmailChallenge.id == challenge_id)
        .values(attempts=EmailChallenge.attempts + 1)
    )


async def consume(db: AsyncSession, challenge_id: int, now: datetime) -> None:
    await db.execute(
        update(EmailChallenge)
        .where(EmailChallenge.id == challenge_id)
        .values(consumed_at=now)
    )

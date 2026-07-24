from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuthIdentity


async def list_for_user(db: AsyncSession, user_id: int) -> list[AuthIdentity]:
    stmt = (
        select(AuthIdentity)
        .where(AuthIdentity.user_id == user_id)
        .order_by(AuthIdentity.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def get_for_user_provider(
    db: AsyncSession, user_id: int, provider: str
) -> AuthIdentity | None:
    stmt = select(AuthIdentity).where(
        AuthIdentity.user_id == user_id, AuthIdentity.provider == provider
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def count_for_user(db: AsyncSession, user_id: int) -> int:
    stmt = select(func.count()).select_from(AuthIdentity).where(AuthIdentity.user_id == user_id)
    return int((await db.execute(stmt)).scalar_one())


async def delete_for_user_provider(db: AsyncSession, user_id: int, provider: str) -> None:
    await db.execute(
        delete(AuthIdentity).where(
            AuthIdentity.user_id == user_id, AuthIdentity.provider == provider
        )
    )


async def get_by_provider_subject(
    db: AsyncSession, provider: str, subject: str, issuer: str | None = None
) -> AuthIdentity | None:
    stmt = select(AuthIdentity).where(
        AuthIdentity.provider == provider, AuthIdentity.provider_subject == subject
    )
    if issuer is not None:
        stmt = stmt.where(AuthIdentity.provider_issuer == issuer)
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_google_identity(
    db: AsyncSession,
    user_id: int,
    issuer: str,
    subject: str,
    verified_email: str | None,
) -> AuthIdentity:
    identity = AuthIdentity(
        user_id=user_id,
        provider="google",
        provider_issuer=issuer,
        provider_subject=subject,
        verified_email=verified_email,
    )
    db.add(identity)
    await db.flush()
    return identity


async def create_email_identity(
    db: AsyncSession, user_id: int, email: str
) -> AuthIdentity:
    identity = AuthIdentity(
        user_id=user_id,
        provider="email",
        provider_subject=email,
        verified_email=email,
    )
    db.add(identity)
    await db.flush()
    return identity


async def ensure_telegram_identity(
    db: AsyncSession, user_id: int, telegram_id: int
) -> None:
    """Idempotently attach a telegram identity to a user.

    New telegram sign-ins created after the identity backfill must still gain an
    identity row; existing users already have one. Conflicts resolve on the
    one-identity-per-provider constraint, refreshing last_used_at.
    """
    stmt = (
        postgres_insert(AuthIdentity)
        .values(
            user_id=user_id,
            provider="telegram",
            provider_subject=str(telegram_id),
        )
        .on_conflict_do_update(
            constraint="uq_auth_identities_user_provider",
            set_={"provider_subject": str(telegram_id), "last_used_at": func.now()},
        )
    )
    await db.execute(stmt)

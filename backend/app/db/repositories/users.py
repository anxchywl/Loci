from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.telegram import TelegramUserData
from app.db.models import User


async def upsert_from_telegram(db: AsyncSession, data: TelegramUserData) -> User:
    stmt = (
        postgres_insert(User)
        .values(
            telegram_id=data.telegram_id,
            username=data.username,
            first_name=data.first_name,
            last_name=data.last_name,
            language_code=data.language_code,
            photo_url=data.photo_url,
        )
        .on_conflict_do_update(
            index_elements=[User.__table__.c.telegram_id],
            set_={
                "username": data.username,
                "first_name": data.first_name,
                "last_name": data.last_name,
                "language_code": data.language_code,
                "photo_url": data.photo_url,
                "updated_at": func.now(),
            },
        )
        .returning(User.id)
    )
    user_id = (await db.execute(stmt)).scalar_one()
    user = await db.get(User, user_id)
    assert user is not None
    return user


async def create_for_google(db: AsyncSession, claims: dict) -> User:
    """create a telegram-less account from verified google profile claims"""
    user = User(
        telegram_id=None,
        first_name=claims.get("given_name"),
        last_name=claims.get("family_name"),
        photo_url=claims.get("picture"),
        language_code=claims.get("locale"),
        primary_provider="google",
    )
    db.add(user)
    await db.flush()
    return user


async def create_for_email(db: AsyncSession) -> User:
    """create a telegram-less account for an email/password registration"""
    user = User(telegram_id=None, primary_provider="email")
    db.add(user)
    await db.flush()
    return user


def claim_primary_provider(user: User, provider: str) -> None:
    """Record the creation provider the first time an account gains an identity.

    Never overwrites: linking a second method must not move the protected primary,
    and a legacy row that predates the column keeps whatever the backfill derived.
    """
    if user.primary_provider is None:
        user.primary_provider = provider


def apply_telegram_profile(user: User, data: TelegramUserData) -> None:
    """refresh the mutable profile fields telegram supplies on every login"""
    user.username = data.username
    user.first_name = data.first_name
    user.last_name = data.last_name
    user.language_code = data.language_code
    user.photo_url = data.photo_url


async def set_display_name(db: AsyncSession, user: User, display_name: str) -> None:
    user.display_name = display_name
    await db.flush()


async def get_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_by_telegram_id(db: AsyncSession, telegram_id: int) -> User | None:
    stmt = select(User).where(User.telegram_id == telegram_id)
    return (await db.execute(stmt)).scalar_one_or_none()

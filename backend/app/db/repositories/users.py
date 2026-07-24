from sqlalchemy import func
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
    )
    db.add(user)
    await db.flush()
    return user


async def create_for_email(db: AsyncSession) -> User:
    """create a telegram-less account for an email/password registration"""
    user = User(telegram_id=None)
    db.add(user)
    await db.flush()
    return user


def apply_telegram_profile(user: User, data: TelegramUserData) -> None:
    """refresh the mutable profile fields telegram supplies on every login"""
    user.username = data.username
    user.first_name = data.first_name
    user.last_name = data.last_name
    user.language_code = data.language_code
    user.photo_url = data.photo_url


async def get_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)

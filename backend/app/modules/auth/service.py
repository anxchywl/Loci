from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security.jwt import create_access_token
from app.core.security.telegram import TelegramUserData
from app.core.security.tokens import generate_refresh_token, hash_token
from app.core.security.session_metadata import SessionMetadata
from app.db.repositories import refresh_tokens as refresh_tokens_repo
from app.db.repositories import users as users_repo
from app.modules.auth.schemas import RefreshResponse, TokenResponse, UserResponse


class AuthError(Exception):
    pass


async def authenticate_telegram_user(
    db: AsyncSession,
    telegram_user: TelegramUserData,
    settings: Settings,
    session_metadata: SessionMetadata | None = None,
) -> tuple[TokenResponse, str]:
    user = await users_repo.upsert_from_telegram(db, telegram_user)
    if user.is_blocked or user.deleted_at is not None:
        raise AuthError("account is blocked")
    user.last_active_at = datetime.now(UTC)

    access_token, access_expires_at = create_access_token(user.id, settings)
    refresh_value = generate_refresh_token()
    refresh_expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    await refresh_tokens_repo.create(
        db, user.id, hash_token(refresh_value), refresh_expires_at, session_metadata
    )
    await db.commit()

    user_response = UserResponse.model_validate(user)
    user_response.is_admin = user.telegram_id in settings.admin_ids
    response = TokenResponse(
        access_token=access_token,
        access_token_expires_at=access_expires_at,
        refresh_token_expires_at=refresh_expires_at,
        user=user_response,
    )
    return response, refresh_value


async def rotate_refresh_token(
    db: AsyncSession,
    refresh_token_value: str,
    settings: Settings,
) -> tuple[RefreshResponse, str]:
    now = datetime.now(UTC)
    existing = await refresh_tokens_repo.get_by_hash(db, hash_token(refresh_token_value))
    if existing is None or existing.revoked_at is not None or existing.expires_at <= now:
        raise AuthError("refresh token is invalid, revoked, or expired")

    owner = await users_repo.get_by_id(db, existing.user_id)
    if owner is None or owner.is_blocked or owner.deleted_at is not None:
        await refresh_tokens_repo.revoke(db, existing, now)
        await db.commit()
        raise AuthError("account is blocked")
    owner.last_active_at = now
    existing.last_used_at = now
    await refresh_tokens_repo.revoke(db, existing, now)

    access_token, access_expires_at = create_access_token(existing.user_id, settings)
    new_value = generate_refresh_token()
    refresh_expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    await refresh_tokens_repo.create(
        db, existing.user_id, hash_token(new_value), refresh_expires_at, existing
    )
    await db.commit()

    response = RefreshResponse(
        access_token=access_token,
        access_token_expires_at=access_expires_at,
        refresh_token_expires_at=refresh_expires_at,
    )
    return response, new_value


async def logout(db: AsyncSession, refresh_token_value: str) -> None:
    existing = await refresh_tokens_repo.get_by_hash(db, hash_token(refresh_token_value))
    if existing is not None and existing.revoked_at is None:
        await refresh_tokens_repo.revoke(db, existing, datetime.now(UTC))
        await db.commit()

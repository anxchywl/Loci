from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security.jwt import create_access_token
from app.core.security.telegram import TelegramUserData
from app.core.security.tokens import generate_refresh_token, hash_token
from app.core.security.session_metadata import SessionMetadata
from app.db.repositories import identities as identities_repo
from app.db.repositories import refresh_tokens as refresh_tokens_repo
from app.db.repositories import users as users_repo
from app.modules.auth.schemas import RefreshResponse, TokenResponse, UserResponse


class AuthError(Exception):
    # session_id is set when the failure should also drop a cached session (reuse)
    def __init__(self, message: str, session_id=None):
        super().__init__(message)
        self.session_id = session_id


async def authenticate_telegram_user(
    db: AsyncSession,
    telegram_user: TelegramUserData,
    settings: Settings,
    session_metadata: SessionMetadata | None = None,
) -> tuple[TokenResponse, str]:
    # resolve the loci account through the telegram auth identity; existing users
    # (including the backfilled owner) keep their users.id
    identity = await identities_repo.get_by_provider_subject(
        db, "telegram", str(telegram_user.telegram_id)
    )
    if identity is not None:
        user = await users_repo.get_by_id(db, identity.user_id)
        if user is None or user.is_blocked or user.deleted_at is not None:
            raise AuthError("account is blocked")
        users_repo.apply_telegram_profile(user, telegram_user)
        identity.last_used_at = datetime.now(UTC)
    else:
        # first time this telegram id is seen — create the account race-safely and
        # attach its identity in the same transaction
        user = await users_repo.upsert_from_telegram(db, telegram_user)
        if user.is_blocked or user.deleted_at is not None:
            raise AuthError("account is blocked")
        await identities_repo.ensure_telegram_identity(db, user.id, telegram_user.telegram_id)
    user.last_active_at = datetime.now(UTC)

    # bootstrap the first admin from the environment; authorization thereafter reads
    # users.is_admin only, regardless of which provider signed the user in
    if (
        settings.initial_admin_telegram_id is not None
        and telegram_user.telegram_id == settings.initial_admin_telegram_id
        and not user.is_admin
    ):
        user.is_admin = True

    response, refresh_value = await issue_session_tokens(db, user, settings, session_metadata)
    await db.commit()
    return response, refresh_value


async def issue_session_tokens(
    db: AsyncSession,
    user,
    settings: Settings,
    session_metadata: SessionMetadata | None = None,
) -> tuple[TokenResponse, str]:
    """mint a new server session (refresh) plus access token for an authenticated user.

    Does not commit — the caller owns the transaction. Shared by every login
    provider so session issuance stays identical across telegram, google, and email.
    """
    now = datetime.now(UTC)
    refresh_value = generate_refresh_token()
    refresh_expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    refresh = await refresh_tokens_repo.create(
        db, user.id, hash_token(refresh_value), refresh_expires_at, session_metadata,
        authenticated_at=now,
    )
    access_token, access_expires_at = create_access_token(
        user.id, settings, session_id=refresh.session_id
    )
    user_response = UserResponse.model_validate(user)
    user_response.is_admin = user.is_admin
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
    existing = await refresh_tokens_repo.get_by_hash_for_update(
        db, hash_token(refresh_token_value)
    )
    if existing is None or existing.expires_at <= now:
        raise AuthError("refresh token is invalid or expired")
    if existing.revoked_at is not None:
        # a token that was already rotated is being replayed — treat as compromise
        # and revoke the whole session family, not just this token
        await refresh_tokens_repo.revoke_all_for_session(db, existing.session_id, now)
        await db.commit()
        raise AuthError("refresh token reuse detected", session_id=existing.session_id)

    owner = await users_repo.get_by_id(db, existing.user_id)
    if owner is None or owner.is_blocked or owner.deleted_at is not None:
        await refresh_tokens_repo.revoke_all_for_session(db, existing.session_id, now)
        await db.commit()
        raise AuthError("account is blocked")
    owner.last_active_at = now
    existing.last_used_at = now
    await refresh_tokens_repo.revoke(db, existing, now)

    new_value = generate_refresh_token()
    refresh_expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    replacement = await refresh_tokens_repo.create(
        db,
        existing.user_id,
        hash_token(new_value),
        refresh_expires_at,
        existing,
        session_id=existing.session_id,
        # a refresh is not a re-authentication; carry the original auth time forward
        authenticated_at=existing.authenticated_at,
    )
    access_token, access_expires_at = create_access_token(
        existing.user_id, settings, session_id=replacement.session_id
    )
    await db.commit()

    response = RefreshResponse(
        access_token=access_token,
        access_token_expires_at=access_expires_at,
        refresh_token_expires_at=refresh_expires_at,
    )
    return response, new_value


async def logout(db: AsyncSession, refresh_token_value: str):
    """return the revoked session id for immediate cache invalidation"""
    existing = await refresh_tokens_repo.get_by_hash_for_update(
        db, hash_token(refresh_token_value)
    )
    if existing is None:
        return None
    now = datetime.now(UTC)
    await refresh_tokens_repo.revoke_all_for_session(db, existing.session_id, now)
    await db.commit()
    return existing.session_id

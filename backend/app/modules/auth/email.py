"""Email/password login: registration, verification, login, and password reset.

Anti-enumeration is structural: register and reset-request always return the same
generic result whether or not the address exists. Codes are single-use, attempt-
limited, keyed-HMAC hashed, and a new code invalidates the previous one. Abandoned
registrations never create a user — the pending password lives on the challenge
until verification.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security.codes import generate_code, hmac_code, verify_code
from app.core.security.password import (
    PasswordPolicyError,
    hash_password,
    needs_rehash,
    validate_password,
    verify_password,
)
from app.core.security.session_metadata import SessionMetadata
from app.db.repositories import credentials as credentials_repo
from app.db.repositories import email_challenges as challenges_repo
from app.db.repositories import identities as identities_repo
from app.db.repositories import refresh_tokens as refresh_tokens_repo
from app.db.repositories import users as users_repo
from app.integrations import email as email_integ
from app.integrations import hibp
from app.modules.auth.schemas import TokenResponse
from app.modules.auth.service import issue_session_tokens

logger = logging.getLogger(__name__)


class EmailAuthError(Exception):
    """generic auth failure — the http layer maps it to a non-revealing response"""


def normalize_email(raw: str) -> str:
    # conservative: trim + lowercase only, no provider-specific transforms
    return raw.strip().lower()


async def _screen_password(settings: Settings, password: str) -> None:
    if not settings.hibp_enabled:
        return
    try:
        compromised = await hibp.is_compromised(password)
    except Exception:
        # documented fail-open: a screening outage must not block legitimate signups
        logger.warning("hibp screening unavailable; allowing password")
        return
    if compromised:
        raise PasswordPolicyError("This password has appeared in a data breach; choose another")


def _expiry(settings: Settings) -> datetime:
    return datetime.now(UTC) + timedelta(minutes=settings.email_code_ttl_minutes)


async def register(
    db: AsyncSession, settings: Settings, email_raw: str, password: str, lang: str | None
) -> None:
    email = normalize_email(email_raw)
    validate_password(password)
    await _screen_password(settings, password)

    if await identities_repo.get_by_provider_subject(db, "email", email) is not None:
        # already registered — say nothing different, and don't issue a code
        return

    code = generate_code()
    await challenges_repo.replace(
        db,
        purpose="register",
        email=email,
        code_hmac=hmac_code(settings.email_code_secret, "register", email, code),
        expires_at=_expiry(settings),
        password_hash=hash_password(password),
    )
    await db.commit()
    email_integ.send_verification_code(settings, email, code, lang)


async def resend(db: AsyncSession, settings: Settings, email_raw: str, lang: str | None) -> None:
    email = normalize_email(email_raw)
    pending = await challenges_repo.latest(db, email, "register")
    if pending is None or pending.consumed_at is not None:
        return
    code = generate_code()
    await challenges_repo.replace(
        db,
        purpose="register",
        email=email,
        code_hmac=hmac_code(settings.email_code_secret, "register", email, code),
        expires_at=_expiry(settings),
        password_hash=pending.password_hash,
    )
    await db.commit()
    email_integ.send_verification_code(settings, email, code, lang)


async def verify(
    db: AsyncSession,
    settings: Settings,
    email_raw: str,
    code: str,
    session_metadata: SessionMetadata | None,
) -> tuple[TokenResponse, str]:
    email = normalize_email(email_raw)
    now = datetime.now(UTC)
    challenge = await challenges_repo.get_active(db, email, "register", now)
    if challenge is None or challenge.attempts >= settings.email_code_max_attempts:
        raise EmailAuthError("invalid or expired code")
    if not verify_code(settings.email_code_secret, "register", email, code, challenge.code_hmac):
        await challenges_repo.increment_attempts(db, challenge.id)
        await db.commit()
        raise EmailAuthError("invalid or expired code")

    # concurrent verification could already have created the account
    if await identities_repo.get_by_provider_subject(db, "email", email) is not None:
        await challenges_repo.consume(db, challenge.id, now)
        await db.commit()
        raise EmailAuthError("invalid or expired code")

    user = await users_repo.create_for_email(db)
    await identities_repo.create_email_identity(db, user.id, email)
    await credentials_repo.upsert(db, user.id, challenge.password_hash)
    await challenges_repo.consume(db, challenge.id, now)
    user.last_active_at = now
    response, refresh_value = await issue_session_tokens(db, user, settings, session_metadata)
    await db.commit()
    return response, refresh_value


async def login(
    db: AsyncSession,
    settings: Settings,
    email_raw: str,
    password: str,
    session_metadata: SessionMetadata | None,
) -> tuple[TokenResponse, str]:
    email = normalize_email(email_raw)
    generic = EmailAuthError("invalid credentials")
    identity = await identities_repo.get_by_provider_subject(db, "email", email)
    if identity is None:
        raise generic
    user = await users_repo.get_by_id(db, identity.user_id)
    if user is None or user.is_blocked or user.deleted_at is not None:
        raise generic
    credential = await credentials_repo.get(db, user.id)
    if credential is None or not verify_password(credential.password_hash, password):
        raise generic

    if needs_rehash(credential.password_hash):
        await credentials_repo.upsert(db, user.id, hash_password(password))
    user.last_active_at = datetime.now(UTC)
    response, refresh_value = await issue_session_tokens(db, user, settings, session_metadata)
    await db.commit()
    return response, refresh_value


async def request_reset(
    db: AsyncSession, settings: Settings, email_raw: str, lang: str | None
) -> None:
    email = normalize_email(email_raw)
    identity = await identities_repo.get_by_provider_subject(db, "email", email)
    if identity is None:
        return
    user = await users_repo.get_by_id(db, identity.user_id)
    if user is None or user.is_blocked or user.deleted_at is not None:
        return
    code = generate_code()
    await challenges_repo.replace(
        db,
        purpose="reset",
        email=email,
        code_hmac=hmac_code(settings.email_code_secret, "reset", email, code),
        expires_at=_expiry(settings),
        user_id=user.id,
    )
    await db.commit()
    email_integ.send_reset_code(settings, email, code, lang)


async def confirm_reset(
    db: AsyncSession,
    settings: Settings,
    email_raw: str,
    code: str,
    new_password: str,
    lang: str | None,
) -> list[uuid.UUID]:
    email = normalize_email(email_raw)
    validate_password(new_password)
    await _screen_password(settings, new_password)
    now = datetime.now(UTC)
    challenge = await challenges_repo.get_active(db, email, "reset", now)
    if challenge is None or challenge.attempts >= settings.email_code_max_attempts:
        raise EmailAuthError("invalid or expired code")
    if not verify_code(settings.email_code_secret, "reset", email, code, challenge.code_hmac):
        await challenges_repo.increment_attempts(db, challenge.id)
        await db.commit()
        raise EmailAuthError("invalid or expired code")

    user = await users_repo.get_by_id(db, challenge.user_id) if challenge.user_id else None
    if user is None or user.is_blocked or user.deleted_at is not None:
        raise EmailAuthError("invalid or expired code")

    await credentials_repo.upsert(db, user.id, hash_password(new_password))
    await challenges_repo.consume(db, challenge.id, now)
    session_ids = await refresh_tokens_repo.session_ids_for_user(db, user.id)
    # revoke every existing session; the user must log in again
    await refresh_tokens_repo.revoke_all_for_user(db, user.id, now)
    await db.commit()
    try:
        email_integ.send_password_changed(settings, email, lang)
    except email_integ.EmailDeliveryError:
        logger.warning("password change notice delivery failed")
    return session_ids

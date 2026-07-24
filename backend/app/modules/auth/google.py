"""Google OIDC login: authorization-code flow with PKCE.

The account is resolved through the google auth identity keyed on (issuer, sub) —
never on email, which is stored as verified metadata only. New google users get a
telegram-less Loci account. Sessions reuse the existing opaque refresh-token
machinery; the callback sets the refresh cookie and the frontend restores the
access token, exactly like a restored telegram session.
"""

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import oauth_state, oidc
from app.core.security.session_metadata import SessionMetadata
from app.core.security.tokens import generate_refresh_token, hash_token
from app.db.models import User
from app.db.repositories import audit as audit_repo
from app.db.repositories import identities as identities_repo
from app.db.repositories import refresh_tokens as refresh_tokens_repo
from app.db.repositories import users as users_repo
from app.integrations import google as google_integ


class GoogleAuthError(Exception):
    pass


def safe_destination(destination: str | None) -> str:
    # only same-app relative paths — blocks open redirects through the callback
    if destination and destination.startswith("/") and not destination.startswith("//"):
        return destination
    return "/"


async def build_authorization_url(
    settings: Settings, redis: Redis, destination: str | None, link_user_id: int | None = None
) -> str:
    verifier, challenge = oidc.generate_pkce_pair()
    state = oidc.random_url_token()
    nonce = oidc.random_url_token()
    await oauth_state.store_transaction(
        redis,
        state,
        {
            "nonce": nonce,
            "code_verifier": verifier,
            "destination": safe_destination(destination),
            "link_user_id": link_user_id,
        },
    )
    params = {
        "response_type": "code",
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{google_integ.GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


async def _attach_to_user(
    db: AsyncSession, user_id: int, subject: str, verified_email: str | None
) -> None:
    existing = await identities_repo.get_by_provider_subject(
        db, "google", subject, issuer=google_integ.GOOGLE_ISSUER
    )
    if existing is not None:
        if existing.user_id != user_id:
            raise GoogleAuthError("this google account is already linked to another user")
        return  # idempotent: already linked to this user
    if await identities_repo.get_for_user_provider(db, user_id, "google") is not None:
        raise GoogleAuthError("this account already has a google sign-in")
    await identities_repo.create_google_identity(
        db, user_id, google_integ.GOOGLE_ISSUER, subject, verified_email
    )
    await audit_repo.record(db, user_id, "identity_linked", provider="google")
    await db.commit()


async def complete_login(
    db: AsyncSession,
    redis: Redis,
    settings: Settings,
    code: str,
    state: str,
    session_metadata: SessionMetadata | None,
) -> tuple[User | None, str | None, datetime | None, str]:
    transaction = await oauth_state.consume_transaction(redis, state)
    if transaction is None:
        raise GoogleAuthError("invalid or expired state")

    try:
        token_response = await google_integ.exchange_code(
            settings, code, transaction["code_verifier"]
        )
    except Exception as exc:  # network / http errors from the token endpoint
        raise GoogleAuthError("token exchange failed") from exc

    id_token = token_response.get("id_token")
    if not id_token:
        raise GoogleAuthError("no id token in token response")

    jwks = await google_integ.fetch_jwks()
    try:
        claims = oidc.verify_id_token(
            id_token,
            jwks,
            client_id=settings.google_client_id,
            nonce=transaction["nonce"],
            issuers=google_integ.GOOGLE_ISSUERS,
        )
    except oidc.OidcError as exc:
        raise GoogleAuthError("id token verification failed") from exc

    subject = claims["sub"]
    email = claims.get("email")
    verified_email = email if claims.get("email_verified") else None
    now = datetime.now(UTC)
    link_user_id = transaction.get("link_user_id")

    if link_user_id is not None:
        await _attach_to_user(db, link_user_id, subject, verified_email)
        return None, None, None, transaction["destination"]

    identity = await identities_repo.get_by_provider_subject(
        db, "google", subject, issuer=google_integ.GOOGLE_ISSUER
    )
    if identity is not None:
        user = await users_repo.get_by_id(db, identity.user_id)
        if user is None or user.is_blocked or user.deleted_at is not None:
            raise GoogleAuthError("account is blocked")
        identity.last_used_at = now
        if verified_email is not None:
            identity.verified_email = verified_email
    else:
        user = await users_repo.create_for_google(db, claims)
        await identities_repo.create_google_identity(
            db, user.id, google_integ.GOOGLE_ISSUER, subject, verified_email
        )
    user.last_active_at = now

    refresh_value = generate_refresh_token()
    refresh_expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    await refresh_tokens_repo.create(
        db, user.id, hash_token(refresh_value), refresh_expires_at, session_metadata,
        authenticated_at=now,
    )
    await db.commit()
    return user, refresh_value, refresh_expires_at, transaction["destination"]

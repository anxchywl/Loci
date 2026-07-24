import hmac
import logging
import secrets
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_session_id,
    get_current_user,
    get_db_session,
    get_redis,
    require_recent_auth,
)
from app.core.config import Settings, get_settings
from app.core.security import session_cache
from app.core.security.rate_limit import check_rate_limit, client_identifier
from app.core.security.session_metadata import build_session_metadata
from app.db.models import User
from app.core.security.telegram import (
    TelegramInitDataError,
    reject_replayed_init_data,
    validate_telegram_init_data,
)
from app.core.security.password import PasswordPolicyError
from app.integrations.email import EmailDeliveryError
from app.modules.auth import email as email_service
from app.modules.auth import account_erasure as account_erasure_service
from app.modules.auth import google as google_service
from app.modules.auth import linking as linking_service
from app.modules.auth import sessions as sessions_service
from app.modules.auth.email import EmailAuthError
from app.modules.auth.linking import LinkAuthError, LinkError
from app.modules.auth.schemas import (
    AccountErasureRequest,
    EmailLinkStartRequest,
    EmailLinkVerifyRequest,
    EmailLoginRequest,
    EmailRegisterRequest,
    EmailResendRequest,
    EmailVerifyRequest,
    AuthProvidersResponse,
    GoogleStartResponse,
    IdentitySummary,
    MessageResponse,
    PasswordResetConfirmBody,
    PasswordResetRequestBody,
    RefreshResponse,
    SessionSummary,
    TelegramAuthRequest,
    TokenResponse,
)
from app.modules.auth.service import (
    AuthError,
    authenticate_telegram_user,
    logout,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

REFRESH_TOKEN_COOKIE = "refresh_token"
CSRF_TOKEN_COOKIE = "csrf_token"
CSRF_TOKEN_HEADER = "x-csrf-token"


def _set_refresh_cookie(
    response: Response, token: str, expires_at: datetime, settings: Settings
) -> None:
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        path=f"{settings.api_v1_prefix}/auth",
        expires=expires_at,
    )
    response.set_cookie(
        key=CSRF_TOKEN_COOKIE,
        value=secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.app_env == "production",
        samesite="lax",
        path="/",
        expires=expires_at,
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE,
        path=f"{settings.api_v1_prefix}/auth",
    )
    response.delete_cookie(key=CSRF_TOKEN_COOKIE, path="/")


def _check_cookie_request_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in settings.allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cross-origin authentication request rejected",
        )


def _check_cookie_request_csrf(request: Request, settings: Settings) -> None:
    _check_cookie_request_origin(request, settings)
    cookie_token = request.cookies.get(CSRF_TOKEN_COOKIE)
    header_token = request.headers.get(CSRF_TOKEN_HEADER)
    if (
        not cookie_token
        or not header_token
        or not hmac.compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="authentication CSRF check failed",
        )


async def _check_auth_rate_limit(
    redis: Redis, request: Request, settings: Settings
) -> None:
    await check_rate_limit(
        redis,
        key_prefix="rl:auth:ip",
        identifier=client_identifier(request, settings.trust_proxy_headers),
        window_seconds=60,
        max_requests=settings.auth_requests_per_minute,
    )


@router.get("/providers", response_model=AuthProvidersResponse)
async def auth_providers(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthProvidersResponse:
    return AuthProvidersResponse(google=settings.google_login_enabled)


@router.post("/telegram", response_model=TokenResponse)
async def telegram_auth(
    request: Request,
    response: Response,
    payload: TelegramAuthRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    await _check_auth_rate_limit(redis, request, settings)
    try:
        telegram_user = validate_telegram_init_data(
            init_data=payload.init_data,
            bot_token=settings.telegram_bot_token,
            max_age_seconds=settings.telegram_init_data_max_age_seconds,
        )
        try:
            await reject_replayed_init_data(
                redis, payload.init_data, settings.telegram_init_data_max_age_seconds
            )
        except RedisError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="authentication replay protection is temporarily unavailable",
            ) from exc
    except TelegramInitDataError as exc:
        logger.warning("telegram auth validation failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram authentication data",
        ) from exc

    session_metadata = build_session_metadata(
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
        settings.jwt_secret_key,
    )
    try:
        token_response, refresh_token = await authenticate_telegram_user(
            db, telegram_user, settings, session_metadata
        )
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked") from exc
    _set_refresh_cookie(response, refresh_token, token_response.refresh_token_expires_at, settings)
    return token_response


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_auth_token(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> RefreshResponse:
    await _check_auth_rate_limit(redis, request, settings)
    refresh_token_value = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token"
        )
    _check_cookie_request_csrf(request, settings)
    try:
        refresh_response, new_refresh_token = await rotate_refresh_token(
            db, refresh_token_value, settings
        )
    except AuthError as exc:
        # on reuse the family was revoked; drop its cached session so access tokens
        # stop resolving without waiting for the cache ttl
        if exc.session_id is not None:
            await session_cache.invalidate_session(redis, exc.session_id)
        _clear_refresh_cookie(response, settings)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    _set_refresh_cookie(
        response, new_refresh_token, refresh_response.refresh_token_expires_at, settings
    )
    return refresh_response


def _browser_redirect_base(settings: Settings) -> str:
    if settings.telegram_mini_app_url:
        return settings.telegram_mini_app_url.rstrip("/")
    if settings.allowed_origins:
        return settings.allowed_origins[0].rstrip("/")
    return ""


@router.get("/google/start", response_model=GoogleStartResponse)
async def google_start(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
    redirect: Annotated[str, Query(max_length=512)] = "/",
) -> GoogleStartResponse:
    if not settings.google_login_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Google login is not configured"
        )
    await _check_auth_rate_limit(redis, request, settings)
    url = await google_service.build_authorization_url(settings, redis, redirect)
    return GoogleStartResponse(authorization_url=url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
) -> Response:
    if not settings.google_login_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Google login is not configured"
        )
    await _check_auth_rate_limit(redis, request, settings)
    base = _browser_redirect_base(settings)
    # cancellation or a malformed callback returns the user to the app without a session
    if error or not code or not state:
        return RedirectResponse(f"{base}/?auth=cancelled", status_code=status.HTTP_303_SEE_OTHER)

    session_metadata = build_session_metadata(
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
        settings.jwt_secret_key,
    )
    try:
        _user, refresh_token, refresh_expires_at, destination = (
            await google_service.complete_login(db, redis, settings, code, state, session_metadata)
        )
    except google_service.GoogleAuthError:
        logger.warning("google auth failed")
        return RedirectResponse(f"{base}/?auth=error", status_code=status.HTTP_303_SEE_OTHER)

    redirect_response = RedirectResponse(
        f"{base}{destination}", status_code=status.HTTP_303_SEE_OTHER
    )
    # link flows return no session — the user is already authenticated
    if refresh_token is not None:
        _set_refresh_cookie(redirect_response, refresh_token, refresh_expires_at, settings)
    return redirect_response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_auth_session(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> Response:
    refresh_token_value = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if refresh_token_value:
        _check_cookie_request_csrf(request, settings)
        session_id = await logout(db, refresh_token_value)
        if session_id is not None:
            await session_cache.invalidate_session(redis, session_id)
    _clear_refresh_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


def _request_lang(request: Request) -> str | None:
    header = request.headers.get("accept-language")
    return header.split(",")[0].strip()[:2].lower() if header else None


async def _limit(redis: Redis, request: Request, settings: Settings, prefix: str, identifier: str, window: int, maximum: int) -> None:
    await check_rate_limit(redis, key_prefix=prefix, identifier=identifier, window_seconds=window, max_requests=maximum)


def _ip(request: Request, settings: Settings) -> str:
    return client_identifier(request, settings.trust_proxy_headers)


@router.post("/email/register", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse)
async def email_register(
    request: Request,
    payload: EmailRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MessageResponse:
    email = payload.email.strip().lower()
    await _limit(redis, request, settings, "rl:email:reg:ip", _ip(request, settings), 3600, settings.email_requests_per_hour)
    await _limit(redis, request, settings, "rl:email:reg:addr", email, 3600, settings.email_requests_per_hour)
    try:
        await email_service.register(db, settings, payload.email, payload.password, _request_lang(request))
    except PasswordPolicyError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not send the verification email") from exc
    return MessageResponse(detail="If the address can be registered, a verification code has been sent.")


@router.post("/email/resend", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse)
async def email_resend(
    request: Request,
    payload: EmailResendRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MessageResponse:
    email = payload.email.strip().lower()
    await _limit(redis, request, settings, "rl:email:resend:cd", email, settings.email_resend_cooldown_seconds, 1)
    await _limit(redis, request, settings, "rl:email:resend:addr", email, 3600, settings.email_requests_per_hour)
    try:
        await email_service.resend(db, settings, payload.email, _request_lang(request))
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not send the verification email") from exc
    return MessageResponse(detail="If a pending registration exists, a new code has been sent.")


@router.post("/email/verify", response_model=TokenResponse)
async def email_verify(
    request: Request,
    response: Response,
    payload: EmailVerifyRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    await _limit(redis, request, settings, "rl:email:verify:ip", _ip(request, settings), 900, settings.login_attempts_per_15min)
    session_metadata = build_session_metadata(
        request.headers.get("user-agent"), request.client.host if request.client else None, settings.jwt_secret_key
    )
    try:
        token_response, refresh_token = await email_service.verify(
            db, settings, payload.email, payload.code, session_metadata
        )
    except EmailAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired code") from exc
    _set_refresh_cookie(response, refresh_token, token_response.refresh_token_expires_at, settings)
    return token_response


@router.post("/email/login", response_model=TokenResponse)
async def email_login(
    request: Request,
    response: Response,
    payload: EmailLoginRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    email = payload.email.strip().lower()
    await _limit(redis, request, settings, "rl:email:login:ip", _ip(request, settings), 900, settings.login_attempts_per_15min)
    await _limit(redis, request, settings, "rl:email:login:addr", email, 900, settings.login_attempts_per_15min)
    session_metadata = build_session_metadata(
        request.headers.get("user-agent"), request.client.host if request.client else None, settings.jwt_secret_key
    )
    try:
        token_response, refresh_token = await email_service.login(
            db, settings, payload.email, payload.password, session_metadata
        )
    except EmailAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password") from exc
    _set_refresh_cookie(response, refresh_token, token_response.refresh_token_expires_at, settings)
    return token_response


@router.post("/password/reset/request", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse)
async def password_reset_request(
    request: Request,
    payload: PasswordResetRequestBody,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MessageResponse:
    email = payload.email.strip().lower()
    await _limit(redis, request, settings, "rl:email:reset:ip", _ip(request, settings), 3600, settings.email_requests_per_hour)
    await _limit(redis, request, settings, "rl:email:reset:addr", email, 3600, settings.email_requests_per_hour)
    try:
        await email_service.request_reset(db, settings, payload.email, _request_lang(request))
    except EmailDeliveryError:
        # do not reveal delivery state on the reset path; response stays generic
        logger.warning("reset email delivery failed")
    return MessageResponse(detail="If an account exists for that address, a reset code has been sent.")


@router.post("/password/reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    request: Request,
    payload: PasswordResetConfirmBody,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> Response:
    await _limit(redis, request, settings, "rl:email:reset-confirm:ip", _ip(request, settings), 900, settings.login_attempts_per_15min)
    try:
        session_ids = await email_service.confirm_reset(
            db, settings, payload.email, payload.code, payload.new_password, _request_lang(request)
        )
    except PasswordPolicyError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except EmailAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired code") from exc
    for session_id in session_ids:
        await session_cache.invalidate_session(redis, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── linked accounts and sessions ────────────────────────────────────


@router.get("/identities", response_model=list[IdentitySummary])
async def list_identities(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[IdentitySummary]:
    return await linking_service.list_identities(db, user.id)


@router.delete("/identities/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_identity(
    request: Request,
    provider: str,
    user: Annotated[User, Depends(require_recent_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    ip_hash = build_session_metadata(
        request.headers.get("user-agent"), request.client.host if request.client else None, settings.jwt_secret_key
    ).ip_hash
    try:
        await linking_service.unlink(db, user.id, provider, ip_hash)
    except LinkError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/google/link/start", response_model=GoogleStartResponse)
async def google_link_start(
    request: Request,
    user: Annotated[User, Depends(require_recent_auth)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
    redirect: Annotated[str, Query(max_length=512)] = "/",
) -> GoogleStartResponse:
    if not settings.google_login_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Google login is not configured")
    await _check_auth_rate_limit(redis, request, settings)
    url = await google_service.build_authorization_url(settings, redis, redirect, link_user_id=user.id)
    return GoogleStartResponse(authorization_url=url)


@router.post("/identities/email/start", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse)
async def email_link_start(
    request: Request,
    payload: EmailLinkStartRequest,
    user: Annotated[User, Depends(require_recent_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MessageResponse:
    await _limit(redis, request, settings, "rl:email:link:addr", payload.email.strip().lower(), 3600, settings.email_requests_per_hour)
    try:
        await linking_service.start_email_link(db, settings, user.id, payload.email, payload.password, _request_lang(request))
    except PasswordPolicyError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LinkError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not send the verification email") from exc
    return MessageResponse(detail="A verification code has been sent to that address.")


@router.post("/identities/email/verify", status_code=status.HTTP_204_NO_CONTENT)
async def email_link_verify(
    request: Request,
    payload: EmailLinkVerifyRequest,
    user: Annotated[User, Depends(require_recent_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> Response:
    await _limit(redis, request, settings, "rl:email:link:verify:ip", _ip(request, settings), 900, settings.login_attempts_per_15min)
    ip_hash = build_session_metadata(
        request.headers.get("user-agent"), request.client.host if request.client else None, settings.jwt_secret_key
    ).ip_hash
    try:
        await linking_service.verify_email_link(db, settings, user.id, payload.email, payload.code, ip_hash)
    except LinkAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired code") from exc
    except LinkError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(
    user: Annotated[User, Depends(get_current_user)],
    session_id: Annotated[uuid.UUID | None, Depends(get_current_session_id)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[SessionSummary]:
    return await sessions_service.list_sessions(db, user.id, session_id)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    request: Request,
    session_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    ip_hash = build_session_metadata(
        request.headers.get("user-agent"), request.client.host if request.client else None, settings.jwt_secret_key
    ).ip_hash
    revoked = await sessions_service.revoke_session(db, redis, user.id, session_id, ip_hash)
    if not revoked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_everywhere(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    ip_hash = build_session_metadata(
        request.headers.get("user-agent"), request.client.host if request.client else None, settings.jwt_secret_key
    ).ip_hash
    await sessions_service.logout_everywhere(db, redis, user.id, ip_hash)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, settings)
    return response


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def erase_account(
    request: Request,
    payload: AccountErasureRequest,
    user: Annotated[User, Depends(require_recent_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await _limit(
        redis,
        request,
        settings,
        "rl:auth:erase-account",
        str(user.id),
        3600,
        3,
    )
    session_ids = await account_erasure_service.erase_account(db, user.id)
    for session_id in session_ids:
        await session_cache.invalidate_session(redis, session_id)

    from app.modules.stories import map_clusters, trending_cache
    from app.workers.tasks import cleanup_deleted_media

    await map_clusters.invalidate(redis)
    await trending_cache.invalidate(redis)
    try:
        cleanup_deleted_media.delay()
    except Exception:
        logger.warning("account media cleanup dispatch failed", exc_info=True)

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, settings)
    return response

import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_redis
from app.core.config import Settings, get_settings
from app.core.security.rate_limit import check_rate_limit, client_identifier
from app.core.security.session_metadata import build_session_metadata
from app.core.security.telegram import (
    TelegramInitDataError,
    reject_replayed_init_data,
    validate_telegram_init_data,
)
from app.modules.auth.schemas import RefreshResponse, TelegramAuthRequest, TokenResponse
from app.modules.auth.service import (
    AuthError,
    authenticate_telegram_user,
    logout,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

REFRESH_TOKEN_COOKIE = "refresh_token"


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


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE,
        path=f"{settings.api_v1_prefix}/auth",
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
        await reject_replayed_init_data(
            redis, payload.init_data, settings.telegram_init_data_max_age_seconds
        )
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
    try:
        refresh_response, new_refresh_token = await rotate_refresh_token(
            db, refresh_token_value, settings
        )
    except AuthError as exc:
        _clear_refresh_cookie(response, settings)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    _set_refresh_cookie(
        response, new_refresh_token, refresh_response.refresh_token_expires_at, settings
    )
    return refresh_response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_auth_session(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    refresh_token_value = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if refresh_token_value:
        await logout(db, refresh_token_value)
    _clear_refresh_cookie(response, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

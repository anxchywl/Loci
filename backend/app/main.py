import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.observability import MetricsMiddleware, render_metrics
from app.core.operational_metrics import render_operational_metrics
from app.db.session import dispose_db
from app.integrations import storage
from app.integrations.redis import close_redis
from app.integrations.redis import get_redis_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    settings = get_settings()
    # direct-to-storage uploads need the bucket to answer CORS preflights for the
    # app origin; do it best-effort at startup so production uploads take the fast
    # path without a manual bucket step
    origins = settings.s3_cors_allowed_origins or settings.allowed_origins
    try:
        # bootstrap storage before request traffic starts
        storage.ensure_bucket(settings.s3_media_bucket)
        storage.configure_bucket_cors(origins)
    except Exception:
        logger.warning("bucket bootstrap skipped", exc_info=True)
    yield
    await close_redis()
    await dispose_db()


def _enforce_production_secrets(settings) -> None:
    if len(settings.jwt_secret_key) < 24 or settings.jwt_secret_key == "change-me":
        raise RuntimeError("JWT_SECRET_KEY must be at least 24 characters in production")
    if not settings.database_url and (
        len(settings.postgres_password) < 24 or settings.postgres_password == "loci"
    ):
        raise RuntimeError("POSTGRES_PASSWORD must be at least 24 characters in production")
    if settings.s3_secret_key in ("loci-password", ""):
        raise RuntimeError("S3_SECRET_KEY must be set to a secure value in production")
    if (
        len(settings.location_fuzz_secret) < 24
        or settings.location_fuzz_secret == "change-me-fuzz"
    ):
        raise RuntimeError("LOCATION_FUZZ_SECRET must be at least 24 characters in production")
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN must be set in production")
    if not settings.redis_url and not settings.redis_password:
        raise RuntimeError("REDIS_PASSWORD must be set in production")
    if not settings.s3_secure:
        raise RuntimeError("S3_SECURE must be true in production")
    if any(not origin.startswith("https://") for origin in settings.allowed_origins):
        raise RuntimeError("ALLOWED_ORIGINS must contain only HTTPS origins in production")
    if settings.telegram_init_data_max_age_seconds > 300:
        raise RuntimeError("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must not exceed 300 in production")
    # google login is all-or-nothing: partial config would fail confusingly at runtime
    google_values = (
        settings.google_client_id,
        settings.google_client_secret,
        settings.google_redirect_uri,
    )
    if any(google_values) and not all(google_values):
        raise RuntimeError(
            "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must all be set together"
        )
    if settings.google_redirect_uri and not settings.google_redirect_uri.startswith("https://"):
        raise RuntimeError("GOOGLE_REDIRECT_URI must be https in production")
    if len(settings.email_code_secret) < 24 or settings.email_code_secret == "change-me-email-code":
        raise RuntimeError("EMAIL_CODE_SECRET must be at least 24 characters in production")
    if settings.email_host in ("console", ""):
        raise RuntimeError("EMAIL_HOST must use a real SMTP provider in production")
    if not (settings.email_username and settings.email_password):
        raise RuntimeError("EMAIL_USERNAME and EMAIL_PASSWORD are required in production")


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    if settings.app_env == "production":
        _enforce_production_secrets(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        lifespan=_lifespan,
    )
    register_error_handlers(app)
    app.add_middleware(MetricsMiddleware)

    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics(authorization: str | None = Header(default=None)) -> Response:
        # optional bearer-token guard so the scrape endpoint can be exposed safely
        if settings.metrics_token:
            expected = f"Bearer {settings.metrics_token}"
            if authorization is None or not secrets.compare_digest(authorization, expected):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        content, media_type = render_metrics()
        operational = await render_operational_metrics(get_redis_client())
        return Response(content=content + operational, media_type=media_type)

    return app


app = create_app()

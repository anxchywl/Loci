import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.observability import render_metrics
from app.db.session import dispose_db
from app.integrations import storage
from app.integrations.redis import close_redis

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    settings = get_settings()
    # direct-to-storage uploads need the bucket to answer CORS preflights for the
    # app origin; do it best-effort at startup so production uploads take the fast
    # path without a manual bucket step
    origins = settings.s3_cors_allowed_origins or settings.allowed_origins
    try:
        storage.configure_bucket_cors(origins)
    except Exception:
        logger.warning("bucket CORS configuration skipped", exc_info=True)
    yield
    await close_redis()
    await dispose_db()


def _enforce_production_secrets(settings) -> None:
    if settings.jwt_secret_key in ("change-me", ""):
        raise RuntimeError("JWT_SECRET_KEY must be set to a secure value in production")
    if settings.postgres_password in ("loci", ""):
        raise RuntimeError("POSTGRES_PASSWORD must be set to a secure value in production")
    if settings.s3_secret_key in ("loci-password", ""):
        raise RuntimeError("S3_SECRET_KEY must be set to a secure value in production")
    if settings.location_fuzz_secret in ("change-me-fuzz", ""):
        raise RuntimeError("LOCATION_FUZZ_SECRET must be set to a secure value in production")
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN must be set in production")
    if not settings.redis_password:
        raise RuntimeError("REDIS_PASSWORD must be set in production")
    if settings.telegram_init_data_max_age_seconds > 300:
        raise RuntimeError("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must not exceed 300 in production")


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
            if authorization != expected:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return Response(content=render_metrics(), media_type="text/plain; version=0.0.4")

    return app


app = create_app()

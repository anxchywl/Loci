from functools import lru_cache
from urllib.parse import quote

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Loci API"
    app_version: str = "0.1.0"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = False
    log_level: str = "INFO"

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    telegram_mini_app_url: str = ""
    # telegram recommends validating auth_date within minutes, not hours
    telegram_init_data_max_age_seconds: int = 300

    # must be overridden in production — create_app() enforces this at startup
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "loci"
    postgres_user: str = "loci"
    postgres_password: str = "loci"
    database_url: str | None = None

    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str | None = None
    redis_url: str | None = None

    s3_endpoint: str = "localhost:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "loci"
    s3_secret_key: str = "loci-password"
    s3_secure: bool = False
    s3_media_bucket: str = "loci-media"
    s3_presigned_url_expires_seconds: int = 600

    # must be overridden in production — a known secret makes the fuzz offset reversible
    location_fuzz_secret: str = "change-me-fuzz"
    location_fuzz_min_meters: int = 250
    location_fuzz_max_meters: int = 750
    max_photos_per_story: int = 5
    max_upload_size_mb: int = 10
    report_auto_hide_threshold: int = 5

    auth_requests_per_minute: int = 10
    story_create_per_day: int = 10
    comments_per_minute: int = 10
    reactions_per_minute: int = 30
    reports_per_day: int = 20
    upload_urls_per_hour: int = 20

    allowed_origins: list[str] = []
    admin_telegram_ids: str = ""
    trust_proxy_headers: bool = False
    # when false, status-change notifications are computed but never enqueued
    notifications_enabled: bool = True

    @computed_field
    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        user = quote(self.postgres_user, safe="")
        password = quote(self.postgres_password, safe="")
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field
    @property
    def admin_ids(self) -> frozenset[int]:
        # comma/space separated telegram ids of users allowed into moderation
        ids: set[int] = set()
        for chunk in self.admin_telegram_ids.replace(",", " ").split():
            try:
                ids.add(int(chunk))
            except ValueError:
                continue
        return frozenset(ids)

    @computed_field
    @property
    def redis_dsn(self) -> str:
        if self.redis_url:
            return self.redis_url
        password = quote(self.redis_password, safe="") if self.redis_password else ""
        auth = f":{password}@" if password else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"


@lru_cache
def get_settings() -> Settings:
    return Settings()

import pytest

from app.core.config import Settings
from app.main import _enforce_production_secrets


def test_connection_urls_escape_credentials():
    settings = Settings(
        postgres_user="loci/user",
        postgres_password="p@ss/word:with+chars",
        postgres_host="localhost",
        postgres_port=5432,
        postgres_db="loci",
        redis_password="redis/p@ss:with+chars",
    )

    assert (
        settings.sqlalchemy_database_url
        == "postgresql+asyncpg://loci%2Fuser:p%40ss%2Fword%3Awith%2Bchars"
        "@localhost:5432/loci"
    )
    assert settings.redis_dsn == "redis://:redis%2Fp%40ss%3Awith%2Bchars@localhost:6379/0"
    assert settings.celery_broker_dsn.endswith("@localhost:6379/1")
    assert settings.celery_result_backend_dsn.endswith("@localhost:6379/2")


def test_external_service_urls_override_local_connection_parts():
    settings = Settings(
        database_url="postgresql+asyncpg://managed/db",
        redis_url="rediss://managed-redis:25061/0?ssl_cert_reqs=required",
        celery_broker_url="rediss://managed-redis:25061/4",
        celery_result_backend="rediss://managed-redis:25061/5",
    )

    assert settings.sqlalchemy_database_url == "postgresql+asyncpg://managed/db"
    assert settings.redis_dsn == "rediss://managed-redis:25061/0?ssl_cert_reqs=required"
    assert settings.celery_broker_dsn == "rediss://managed-redis:25061/4"
    assert settings.celery_result_backend_dsn == "rediss://managed-redis:25061/5"

    derived = Settings(redis_url="rediss://managed-redis:25061/0?ssl_cert_reqs=required")
    assert derived.celery_broker_dsn.endswith("/1?ssl_cert_reqs=required")
    assert derived.celery_result_backend_dsn.endswith("/2?ssl_cert_reqs=required")


def test_production_rejects_short_secrets_and_insecure_origins():
    base = {
        "jwt_secret_key": "j" * 32,
        "postgres_password": "p" * 32,
        "redis_password": "r" * 32,
        "s3_secret_key": "s" * 32,
        "location_fuzz_secret": "f" * 32,
        "email_code_secret": "e" * 32,
        "email_host": "smtp.example.com",
        "email_username": "mailer",
        "email_password": "smtp-secret",
        "telegram_bot_token": "123:test",
        "telegram_init_data_max_age_seconds": 300,
        "s3_secure": True,
        "allowed_origins": ["https://loci.example"],
    }
    _enforce_production_secrets(Settings(**base))

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        _enforce_production_secrets(Settings(**(base | {"jwt_secret_key": "short"})))

    with pytest.raises(RuntimeError, match="S3_SECURE"):
        _enforce_production_secrets(Settings(**(base | {"s3_secure": False})))

    with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
        _enforce_production_secrets(
            Settings(**(base | {"allowed_origins": ["http://localhost:3000"]}))
        )

    with pytest.raises(RuntimeError, match="EMAIL_CODE_SECRET"):
        _enforce_production_secrets(Settings(**(base | {"email_code_secret": "change-me-email-code"})))

    with pytest.raises(RuntimeError, match="GOOGLE_CLIENT_ID"):
        _enforce_production_secrets(
            Settings(
                **(
                    base
                    | {
                        "google_client_id": "only-id-set",
                        "google_client_secret": "",
                        "google_redirect_uri": "",
                    }
                )
            )
        )

    with pytest.raises(RuntimeError, match="EMAIL_HOST"):
        _enforce_production_secrets(Settings(**(base | {"email_host": "console"})))

    with pytest.raises(RuntimeError, match="EMAIL_USERNAME"):
        _enforce_production_secrets(Settings(**(base | {"email_username": ""})))

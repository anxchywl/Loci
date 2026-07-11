import asyncio
import os
from pathlib import Path

os.environ["TELEGRAM_BOT_TOKEN"] = "123456:TEST-TOKEN"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-with-enough-length-for-hs256"
os.environ.setdefault("POSTGRES_PORT", "5433")
os.environ["POSTGRES_DB"] = "loci_test"
# telegram id 999 is the moderation admin in tests; keep notifications from
# trying to reach a broker/bot during the suite
os.environ["ADMIN_TELEGRAM_IDS"] = "999"
os.environ["NOTIFICATIONS_ENABLED"] = "false"

import pytest
from alembic import command
from alembic.config import Config
from fakeredis.aioredis import FakeRedis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
import app.db.models  # noqa: F401

APP_TABLES = (
    "reports",
    "bookmarks",
    "reactions",
    "comments",
    "story_photos",
    "stories",
    "refresh_tokens",
    "users",
)


def _test_db_url() -> str:
    return get_settings().sqlalchemy_database_url


def _admin_db_url() -> str:
    return _test_db_url().rsplit("/", 1)[0] + "/postgres"


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    async def recreate() -> None:
        admin = create_async_engine(_admin_db_url(), isolation_level="AUTOCOMMIT")
        async with admin.connect() as conn:
            await conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = 'loci_test' AND pid <> pg_backend_pid()"
                )
            )
            await conn.execute(text("DROP DATABASE IF EXISTS loci_test"))
            await conn.execute(text("CREATE DATABASE loci_test"))
        await admin.dispose()

    asyncio.run(recreate())

    # migrations build the test schema so the category seed and migration itself get exercised
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "app/db/migrations"))
    command.upgrade(config, "head")


@pytest.fixture
async def db_engine():
    engine = create_async_engine(_test_db_url())
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    async with db_engine.begin() as conn:
        await conn.execute(
            text(f"TRUNCATE {', '.join(APP_TABLES)} RESTART IDENTITY CASCADE")
        )
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    async with maker() as session:
        yield session


@pytest.fixture
def fake_redis():
    return FakeRedis(decode_responses=True)


@pytest.fixture
async def client(db_session, fake_redis):
    from app.api.deps import get_db_session, get_redis
    from app.main import app

    async def _override_db():
        yield db_session

    async def _override_redis():
        yield fake_redis

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_redis] = _override_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

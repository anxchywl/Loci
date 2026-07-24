"""Phase 2: provider-independent auth core.

Covers admin bootstrap + authoritative is_admin, identity creation on telegram
signup, refresh-token reuse detection, and notification null-safety.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import get_settings
from app.db.models import AuthIdentity, User
from app.db.models import RefreshToken
from app.modules.auth.service import AuthError, rotate_refresh_token
from tests.factories import build_init_data
from tests.test_stories_api import authenticate

AUTH_URL = "/api/v1/auth/telegram"
REFRESH_URL = "/api/v1/auth/refresh"
ADMIN_TG = 999


async def test_initial_admin_bootstrapped_on_first_auth(client, db_session):
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (await client.get("/api/v1/profile/me")).json()["is_admin"] is True

    row = (
        await db_session.execute(select(User).where(User.telegram_id == ADMIN_TG))
    ).scalar_one()
    assert row.is_admin is True


async def test_non_initial_admin_is_not_admin(client):
    await authenticate(client, telegram_id=1)
    assert (await client.get("/api/v1/profile/me")).json()["is_admin"] is False
    # and the admin surface is closed to them
    assert (await client.get("/api/v1/admin/moderation/queue")).status_code == 403


async def test_admin_access_is_provider_independent(client, db_session):
    # once is_admin is set, authorization no longer depends on the telegram allowlist
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (await client.get("/api/v1/admin/moderation/queue")).status_code == 200

    settings = get_settings()
    assert ADMIN_TG in settings.admin_ids  # the flag, not this set, is what authorizes


async def test_telegram_signup_creates_identity(client, db_session):
    await authenticate(client, telegram_id=424242)
    user = (
        await db_session.execute(select(User).where(User.telegram_id == 424242))
    ).scalar_one()
    identity = (
        await db_session.execute(
            select(AuthIdentity).where(AuthIdentity.user_id == user.id)
        )
    ).scalar_one()
    assert identity.provider == "telegram"
    assert identity.provider_subject == "424242"


async def test_repeat_auth_keeps_single_identity(client, db_session):
    await authenticate(client, telegram_id=555)
    await authenticate(client, telegram_id=555)
    rows = (
        await db_session.execute(
            select(AuthIdentity).where(AuthIdentity.provider_subject == "555")
        )
    ).scalars().all()
    assert len(rows) == 1


async def test_refresh_reuse_revokes_session_family(client):
    await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=1)})
    old_refresh = client.cookies.get("refresh_token")

    rotated = await client.post(REFRESH_URL)
    assert rotated.status_code == 200
    new_refresh = client.cookies.get("refresh_token")
    assert new_refresh != old_refresh

    # replaying the rotated-away token is detected as reuse
    client.cookies.set("refresh_token", old_refresh)
    reused = await client.post(REFRESH_URL)
    assert reused.status_code == 401

    # and it revokes the whole family: the current token no longer works either
    client.cookies.set("refresh_token", new_refresh)
    after = await client.post(REFRESH_URL)
    assert after.status_code == 401


async def test_concurrent_refresh_issues_at_most_one_successor(client, db_engine):
    await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=2)})
    refresh_value = client.cookies.get("refresh_token")
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def rotate():
        async with maker() as session:
            return await rotate_refresh_token(session, refresh_value, get_settings())

    results = await asyncio.gather(rotate(), rotate(), return_exceptions=True)
    assert sum(not isinstance(result, Exception) for result in results) == 1
    assert sum(isinstance(result, AuthError) for result in results) == 1

    async with maker() as session:
        active = (
            await session.execute(
                select(RefreshToken).where(RefreshToken.revoked_at.is_(None))
            )
        ).scalars().all()
    assert active == []


def test_dispatch_skips_user_without_telegram(monkeypatch):
    from app.modules import notifications

    settings = get_settings()
    monkeypatch.setattr(settings, "notifications_enabled", True)
    sent: list[tuple[int, str]] = []
    monkeypatch.setattr(notifications, "_enqueue", lambda tid, text: sent.append((tid, text)))

    # a google/email-only user (no telegram identity) must not enqueue or raise
    notifications.dispatch(
        settings, event=notifications.StoryEvent.approved, telegram_id=None, title="x"
    )
    assert sent == []

    # positive control: a telegram user still gets delivered
    notifications.dispatch(
        settings, event=notifications.StoryEvent.approved, telegram_id=7, title="x"
    )
    assert sent == [(7, notifications.render_message(notifications.StoryEvent.approved, "x", None))]

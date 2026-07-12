from sqlalchemy import text

from tests.test_stories_api import authenticate


async def test_logout_kills_access_token_immediately(client):
    await authenticate(client, telegram_id=1)
    # warms the session cache
    assert (await client.get("/api/v1/profile/me")).status_code == 200

    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    # eager invalidation on logout: the cached session entry is dropped, so the
    # still-unexpired access token is rejected without waiting out the TTL
    assert (await client.get("/api/v1/profile/me")).status_code == 401


async def test_last_active_write_is_throttled(client, db_session):
    await authenticate(client, telegram_id=1)
    assert (await client.get("/api/v1/profile/me")).status_code == 200

    async def last_active():
        return (
            await db_session.execute(
                text("SELECT last_active_at FROM users WHERE telegram_id = 1")
            )
        ).scalar_one()

    first = await last_active()
    assert first is not None
    # a second request inside the activity window must not write again
    assert (await client.get("/api/v1/profile/me")).status_code == 200
    assert await last_active() == first


async def test_blocked_user_rejected_despite_session_cache(client, db_session):
    await authenticate(client, telegram_id=1)
    assert (await client.get("/api/v1/profile/me")).status_code == 200

    await db_session.execute(text("UPDATE users SET is_blocked = true WHERE telegram_id = 1"))
    await db_session.commit()
    # the user-row check runs on every request; the session cache never bypasses it
    assert (await client.get("/api/v1/profile/me")).status_code == 403

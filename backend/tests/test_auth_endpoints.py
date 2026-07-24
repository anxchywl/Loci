import time

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security.jwt import create_access_token
from app.db.models import RefreshToken, User
from tests.factories import build_init_data

AUTH_URL = "/api/v1/auth/telegram"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"


async def test_auth_providers_reflect_server_configuration(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "")
    monkeypatch.setattr(settings, "google_client_secret", "")
    monkeypatch.setattr(settings, "google_redirect_uri", "")

    response = await client.get("/api/v1/auth/providers")

    assert response.status_code == 200
    assert response.json() == {"google": False, "email": True}


async def test_telegram_auth_creates_user_and_returns_tokens(client, db_session):
    response = await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=7)})
    assert response.status_code == 200

    body = response.json()
    assert body["access_token"]
    assert body["user"]["username"] == "loci_mapper"
    assert "telegram_id" not in body["user"]
    assert client.cookies.get("refresh_token")

    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert users == 1


async def test_replayed_init_data_rejected(client):
    init_data = build_init_data()
    first = await client.post(AUTH_URL, json={"init_data": init_data})
    assert first.status_code == 200
    second = await client.post(AUTH_URL, json={"init_data": init_data})
    assert second.status_code == 401


async def test_tampered_init_data_rejected(client, db_session):
    init_data = build_init_data(username="aru")
    response = await client.post(AUTH_URL, json={"init_data": init_data.replace("aru", "eve")})
    assert response.status_code == 401

    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert users == 0


async def test_repeat_auth_upserts_profile_without_duplicating(client, db_session):
    now = int(time.time())
    first = await client.post(
        AUTH_URL, json={"init_data": build_init_data(telegram_id=7, username="old", auth_date=now - 5)}
    )
    assert first.status_code == 200
    second = await client.post(
        AUTH_URL, json={"init_data": build_init_data(telegram_id=7, username="new", auth_date=now)}
    )
    assert second.status_code == 200

    users = (await db_session.execute(select(User))).scalars().all()
    assert len(users) == 1
    assert users[0].username == "new"


async def test_refresh_rotates_and_revokes_old_token(client, db_session):
    auth = await client.post(AUTH_URL, json={"init_data": build_init_data()})
    assert auth.status_code == 200
    old_cookie = client.cookies.get("refresh_token")

    refreshed = await client.post(REFRESH_URL)
    assert refreshed.status_code == 200
    new_cookie = client.cookies.get("refresh_token")
    assert new_cookie and new_cookie != old_cookie

    tokens = (await db_session.execute(select(RefreshToken))).scalars().all()
    assert len(tokens) == 2
    assert sum(1 for t in tokens if t.revoked_at is not None) == 1

    client.cookies.set("refresh_token", old_cookie)
    reused = await client.post(REFRESH_URL)
    assert reused.status_code == 401

    # reuse detection revokes the whole family, so the live token is now dead too
    client.cookies.set("refresh_token", new_cookie)
    after_reuse = await client.post(REFRESH_URL)
    assert after_reuse.status_code == 401


async def test_refresh_without_cookie_rejected(client):
    response = await client.post(REFRESH_URL)
    assert response.status_code == 401


async def test_refresh_rejects_missing_or_mismatched_csrf(client):
    auth = await client.post(AUTH_URL, json={"init_data": build_init_data()})
    assert auth.status_code == 200

    client.cookies.delete("csrf_token")
    missing = await client.post(REFRESH_URL)
    assert missing.status_code == 403

    client.cookies.set("csrf_token", "cookie-token")
    mismatched = await client.post(
        REFRESH_URL, headers={"X-CSRF-Token": "different-token"}
    )
    assert mismatched.status_code == 403


async def test_logout_revokes_refresh_token(client):
    auth = await client.post(AUTH_URL, json={"init_data": build_init_data()})
    assert auth.status_code == 200
    cookie = client.cookies.get("refresh_token")
    csrf = client.cookies.get("csrf_token")

    logout = await client.post(LOGOUT_URL)
    assert logout.status_code == 204

    client.cookies.set("refresh_token", cookie)
    client.cookies.set("csrf_token", csrf)
    response = await client.post(REFRESH_URL)
    assert response.status_code == 401


async def test_logout_revokes_access_token_session(client):
    auth = await client.post(AUTH_URL, json={"init_data": build_init_data()})
    access_token = auth.json()["access_token"]
    logout = await client.post(LOGOUT_URL)
    assert logout.status_code == 204

    response = await client.get(
        "/api/v1/profile/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 401


async def test_auth_rate_limit_returns_429(client):
    limit = get_settings().auth_requests_per_minute
    for _ in range(limit):
        await client.post(AUTH_URL, json={"init_data": "garbage"})
    response = await client.post(AUTH_URL, json={"init_data": "garbage"})
    assert response.status_code == 429
    assert response.headers.get("Retry-After")


async def test_get_current_user_resolves_bearer_token(client, db_session):
    auth = await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=7)})
    user_id = auth.json()["user"]["id"]

    settings = get_settings()
    token, _ = create_access_token(user_id, settings)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user = await get_current_user(credentials, db_session, settings, FakeRedis(decode_responses=True))
    assert user.telegram_id == 7


async def test_get_current_user_rejects_missing_and_garbage_tokens(db_session):
    settings = get_settings()
    with pytest.raises(HTTPException) as missing:
        await get_current_user(None, db_session, settings, FakeRedis(decode_responses=True))
    assert missing.value.status_code == 401

    garbage = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-jwt")
    with pytest.raises(HTTPException) as invalid:
        await get_current_user(garbage, db_session, settings, FakeRedis(decode_responses=True))
    assert invalid.value.status_code == 401

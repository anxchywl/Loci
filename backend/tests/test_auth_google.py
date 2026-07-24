"""End-to-end Google OIDC login through the API, with the network seams faked."""

import json
from urllib.parse import parse_qs, urlparse

from sqlalchemy import func, select

from app.db.models import AuthIdentity, User
from app.integrations import google as google_integ
from tests.google_helpers import public_jwk, sign_id_token

START_URL = "/api/v1/auth/google/start"
CALLBACK_URL = "/api/v1/auth/google/callback"


async def _start_and_fake_google(
    client, fake_redis, monkeypatch, *, sub, email="user@example.com", email_verified=True
):
    """run the start endpoint, read the server nonce, and stage a matching id_token"""
    resp = await client.get(START_URL, params={"redirect": "/story/42"})
    assert resp.status_code == 200
    url = resp.json()["authorization_url"]
    query = parse_qs(urlparse(url).query)
    state = query["state"][0]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid email profile"]

    raw = await fake_redis.get(f"oauth:google:{state}")
    nonce = json.loads(raw)["nonce"]

    id_token = sign_id_token(sub=sub, nonce=nonce, email=email, email_verified=email_verified)

    async def fake_exchange(settings, code, code_verifier):
        return {"id_token": id_token}

    async def fake_jwks():
        return [public_jwk()]

    monkeypatch.setattr(google_integ, "exchange_code", fake_exchange)
    monkeypatch.setattr(google_integ, "fetch_jwks", fake_jwks)
    return state


async def test_new_google_user_gets_account_and_session(client, db_session, fake_redis, monkeypatch):
    state = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-abc")
    resp = await client.get(CALLBACK_URL, params={"code": "auth-code", "state": state})

    assert resp.status_code == 303
    assert resp.headers["location"] == "https://app.example/story/42"
    assert "refresh_token" in resp.headers.get("set-cookie", "")

    user = (
        await db_session.execute(select(User).where(User.telegram_id.is_(None)))
    ).scalar_one()
    identity = (
        await db_session.execute(select(AuthIdentity).where(AuthIdentity.user_id == user.id))
    ).scalar_one()
    assert identity.provider == "google"
    assert identity.provider_issuer == "https://accounts.google.com"
    assert identity.provider_subject == "g-abc"
    assert identity.verified_email == "user@example.com"

    # the session works: the frontend restores an access token from the cookie
    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    token = refreshed.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    me = await client.get("/api/v1/profile/me")
    assert me.status_code == 200
    assert me.json()["is_admin"] is False


async def test_returning_google_user_resolves_same_account(client, db_session, fake_redis, monkeypatch):
    state1 = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-same")
    first = await client.get(CALLBACK_URL, params={"code": "c1", "state": state1})
    assert first.status_code == 303

    state2 = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-same")
    second = await client.get(CALLBACK_URL, params={"code": "c2", "state": state2})
    assert second.status_code == 303

    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    identities = (
        await db_session.execute(select(func.count()).select_from(AuthIdentity))
    ).scalar_one()
    assert users == 1
    assert identities == 1


async def test_same_email_different_sub_are_distinct_accounts(client, db_session, fake_redis, monkeypatch):
    # email must never be the identity key: two google subs with one email = two users
    state1 = await _start_and_fake_google(
        client, fake_redis, monkeypatch, sub="g-1", email="shared@example.com"
    )
    await client.get(CALLBACK_URL, params={"code": "c1", "state": state1})

    state2 = await _start_and_fake_google(
        client, fake_redis, monkeypatch, sub="g-2", email="shared@example.com"
    )
    await client.get(CALLBACK_URL, params={"code": "c2", "state": state2})

    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert users == 2


async def test_unverified_email_not_stored_as_verified(client, db_session, fake_redis, monkeypatch):
    state = await _start_and_fake_google(
        client, fake_redis, monkeypatch, sub="g-unv", email="unv@example.com", email_verified=False
    )
    await client.get(CALLBACK_URL, params={"code": "c", "state": state})
    identity = (
        await db_session.execute(select(AuthIdentity).where(AuthIdentity.provider_subject == "g-unv"))
    ).scalar_one()
    assert identity.verified_email is None


async def test_invalid_state_redirects_to_error_without_session(client, fake_redis, monkeypatch):
    async def fake_exchange(settings, code, code_verifier):
        raise AssertionError("must not exchange on invalid state")

    monkeypatch.setattr(google_integ, "exchange_code", fake_exchange)
    resp = await client.get(CALLBACK_URL, params={"code": "x", "state": "not-a-real-state"})
    assert resp.status_code == 303
    assert resp.headers["location"] == "https://app.example/?auth=error"
    assert "refresh_token" not in resp.headers.get("set-cookie", "")


async def test_cancelled_flow_redirects_without_session(client):
    resp = await client.get(CALLBACK_URL, params={"error": "access_denied", "state": "s"})
    assert resp.status_code == 303
    assert resp.headers["location"] == "https://app.example/?auth=cancelled"
    assert "refresh_token" not in resp.headers.get("set-cookie", "")


async def test_state_is_single_use(client, fake_redis, monkeypatch):
    state = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-once")
    first = await client.get(CALLBACK_URL, params={"code": "c1", "state": state})
    assert first.status_code == 303
    # replaying the same state is rejected (consumed) → error redirect, no session
    second = await client.get(CALLBACK_URL, params={"code": "c2", "state": state})
    assert second.headers["location"] == "https://app.example/?auth=error"

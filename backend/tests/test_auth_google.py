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


async def test_redirect_entry_point_hands_the_browser_straight_to_google(client, fake_redis):
    """The browser navigates here on the click; nothing is fetched in between."""
    resp = await client.get(
        "/api/v1/auth/google/redirect", params={"redirect": "/story/42"}, follow_redirects=False
    )

    assert resp.status_code == 303
    location = resp.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    query = parse_qs(urlparse(location).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["https://app.example/api/v1/auth/google/callback"]
    # every response carries a fresh single-use state, so none of them may be
    # cached — a replayed state is exactly what a Safari-cached redirect causes
    assert resp.headers["cache-control"] == "no-store"

    state = query["state"][0]
    stored = json.loads(await fake_redis.get(f"oauth:google:{state}"))
    assert stored["destination"] == "/story/42"


async def test_start_response_is_not_cacheable(client):
    resp = await client.get(START_URL, params={"redirect": "/"})
    assert resp.headers["cache-control"] == "no-store"


async def test_rotated_signing_key_is_refetched_once(client, fake_redis, monkeypatch):
    """A cached JWKS predating a key rotation must not fail the sign-in."""
    state = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-rotated")

    calls: list[bool] = []
    real_jwk = public_jwk()
    stale_jwk = {**real_jwk, "kid": "retired-key"}

    async def fake_jwks(*, force_refresh: bool = False):
        calls.append(force_refresh)
        return [real_jwk] if force_refresh else [stale_jwk]

    monkeypatch.setattr(google_integ, "fetch_jwks", fake_jwks)

    resp = await client.get(CALLBACK_URL, params={"code": "c", "state": state})

    assert resp.status_code == 303
    assert resp.headers["location"] == "https://app.example/story/42"
    assert "refresh_token" in resp.headers.get("set-cookie", "")
    # exactly one forced refetch, not a refetch on every verification
    assert calls == [False, True]


async def test_verification_failure_other_than_key_rotation_is_not_retried(
    client, fake_redis, monkeypatch
):
    state = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-badnonce")
    id_token = sign_id_token(sub="g-badnonce", nonce="a-different-nonce")

    async def fake_exchange(settings, code, code_verifier):
        return {"id_token": id_token}

    calls: list[bool] = []

    async def fake_jwks(*, force_refresh: bool = False):
        calls.append(force_refresh)
        return [public_jwk()]

    monkeypatch.setattr(google_integ, "exchange_code", fake_exchange)
    monkeypatch.setattr(google_integ, "fetch_jwks", fake_jwks)

    resp = await client.get(CALLBACK_URL, params={"code": "c", "state": state})

    assert resp.headers["location"] == "https://app.example/?auth=error"
    assert "set-cookie" not in resp.headers
    assert calls == [False]


async def test_token_exchange_surfaces_googles_error_code(monkeypatch):
    """exchange_code must carry Google's own reason, not a bare HTTP error."""
    import httpx
    import pytest

    from app.core.config import get_settings

    async def fake_post(self, url, **kwargs):
        return httpx.Response(
            401,
            json={"error": "invalid_client", "error_description": "Unauthorized"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with pytest.raises(google_integ.TokenExchangeError) as excinfo:
        await google_integ.exchange_code(get_settings(), "code", "verifier")
    assert "invalid_client" in str(excinfo.value)
    assert "Unauthorized" in str(excinfo.value)


async def test_failed_callback_logs_the_cause(client, fake_redis, monkeypatch):
    """The warning must name why sign-in broke, not just that it did."""
    import logging

    state = await _start_and_fake_google(client, fake_redis, monkeypatch, sub="g-badsecret")

    async def failing_exchange(settings, code, code_verifier):
        raise google_integ.TokenExchangeError("401 invalid_client: Unauthorized")

    monkeypatch.setattr(google_integ, "exchange_code", failing_exchange)

    # attached to the emitting logger directly: app startup calls basicConfig,
    # which makes root-handler capture depend on test order
    records: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(self.format(record))

    logger = logging.getLogger("app.api.v1.auth.router")
    handler = _Capture()
    # uvicorn's logging config disables pre-existing loggers when another test
    # boots the app, so re-enable this one rather than depend on suite order
    was_disabled = logger.disabled
    logger.disabled = False
    logger.addHandler(handler)
    try:
        resp = await client.get(CALLBACK_URL, params={"code": "c", "state": state})
    finally:
        logger.removeHandler(handler)
        logger.disabled = was_disabled

    assert resp.headers["location"] == "https://app.example/?auth=error"
    assert "set-cookie" not in resp.headers
    logged = "\n".join(records)
    assert "invalid_client" in logged
    assert "TokenExchangeError" in logged  # the traceback, not just the message

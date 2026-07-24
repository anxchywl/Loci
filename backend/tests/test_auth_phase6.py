"""Phase 6: linked accounts, session management, recent-auth, and audit."""

import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select, update

from app.db.models import AuthIdentity, RefreshToken, SecurityAuditEvent, User
from app.integrations import google as google_integ
from tests.google_helpers import public_jwk, sign_id_token
from tests.test_stories_api import authenticate

IDENTITIES = "/api/v1/auth/identities"
SESSIONS = "/api/v1/auth/sessions"
LINK_START = "/api/v1/auth/google/link/start"
CALLBACK = "/api/v1/auth/google/callback"
EMAIL_LINK_START = "/api/v1/auth/identities/email/start"
EMAIL_LINK_VERIFY = "/api/v1/auth/identities/email/verify"
PASSWORD = "a strong enough passphrase"
PHONE_UA = (
    "Mozilla/5.0 (Linux; Android 13; SM-A536E; wv) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Version/4.0 Chrome/137.0.7151.72 Mobile Safari/537.36"
)
LAPTOP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"
)


async def _fake_google(client, fake_redis, monkeypatch, sub, email="g@example.com"):
    resp = await client.get(LINK_START, params={"redirect": "/settings"})
    assert resp.status_code == 200, resp.text
    state = parse_qs(urlparse(resp.json()["authorization_url"]).query)["state"][0]
    nonce = json.loads(await fake_redis.get(f"oauth:google:{state}"))["nonce"]
    id_token = sign_id_token(sub=sub, nonce=nonce, email=email)

    async def fake_exchange(settings, code, code_verifier):
        return {"id_token": id_token}

    async def fake_jwks():
        return [public_jwk()]

    monkeypatch.setattr(google_integ, "exchange_code", fake_exchange)
    monkeypatch.setattr(google_integ, "fetch_jwks", fake_jwks)
    return await client.get(CALLBACK, params={"code": "c", "state": state})


async def test_list_identities_shows_telegram(client):
    await authenticate(client, telegram_id=1)
    rows = (await client.get(IDENTITIES)).json()
    assert [r["provider"] for r in rows] == ["telegram"]


async def test_cannot_unlink_last_method(client):
    await authenticate(client, telegram_id=1)
    resp = await client.delete(f"{IDENTITIES}/telegram")
    assert resp.status_code == 400


async def test_google_link_adds_identity_same_user(client, db_session, fake_redis, monkeypatch):
    await authenticate(client, telegram_id=1)
    user_id = (await client.get("/api/v1/profile/me")).json()["id"]

    resp = await _fake_google(client, fake_redis, monkeypatch, sub="g-link")
    assert resp.status_code == 303
    assert resp.headers["location"] == "https://app.example/settings"

    identities = (
        await db_session.execute(select(AuthIdentity).where(AuthIdentity.user_id == user_id))
    ).scalars().all()
    assert {i.provider for i in identities} == {"telegram", "google"}
    users = (await db_session.execute(select(User))).scalars().all()
    assert len(users) == 1  # linking never creates a new account

    event = (
        await db_session.execute(
            select(SecurityAuditEvent).where(SecurityAuditEvent.event_type == "identity_linked")
        )
    ).scalars().all()
    assert event and event[0].provider == "google"


async def test_link_rejected_when_identity_owned_by_another(client, db_session, fake_redis, monkeypatch):
    # a different account already owns this google sub
    other = User(telegram_id=None)
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        AuthIdentity(user_id=other.id, provider="google",
                     provider_issuer="https://accounts.google.com", provider_subject="taken")
    )
    await db_session.commit()

    await authenticate(client, telegram_id=1)
    resp = await _fake_google(client, fake_redis, monkeypatch, sub="taken")
    assert resp.headers["location"] == "https://app.example/?auth=error"
    # the telegram user did not gain a google identity
    me = (await client.get(IDENTITIES)).json()
    assert [r["provider"] for r in me] == ["telegram"]


async def test_email_link_start_and_verify(client, db_session, monkeypatch):
    from app.integrations import email as email_integ

    codes: list = []
    monkeypatch.setattr(email_integ, "send_verification_code",
                        lambda settings, to, code, lang: codes.append(code))

    await authenticate(client, telegram_id=1)
    start = await client.post(EMAIL_LINK_START, json={"email": "me@example.com", "password": PASSWORD})
    assert start.status_code == 202
    verify = await client.post(EMAIL_LINK_VERIFY, json={"email": "me@example.com", "code": codes[-1]})
    assert verify.status_code == 204

    rows = (await client.get(IDENTITIES)).json()
    assert {r["provider"] for r in rows} == {"telegram", "email"}
    # now the email login works for the same account
    login = await client.post("/api/v1/auth/email/login", json={"email": "me@example.com", "password": PASSWORD})
    assert login.status_code == 200


async def test_unlink_after_linking_records_audit(client, db_session, fake_redis, monkeypatch):
    await authenticate(client, telegram_id=1)
    await _fake_google(client, fake_redis, monkeypatch, sub="g-unlink")
    resp = await client.delete(f"{IDENTITIES}/google")
    assert resp.status_code == 204
    rows = (await client.get(IDENTITIES)).json()
    assert [r["provider"] for r in rows] == ["telegram"]
    events = (
        await db_session.execute(
            select(SecurityAuditEvent).where(SecurityAuditEvent.event_type == "identity_unlinked")
        )
    ).scalars().all()
    assert events and events[0].provider == "google"


async def test_recent_auth_required_for_unlink(client, db_session, fake_redis, monkeypatch):
    await authenticate(client, telegram_id=1)
    await _fake_google(client, fake_redis, monkeypatch, sub="g-stale")
    # backdate the session's authentication far outside the recent-auth window
    await db_session.execute(
        update(RefreshToken).values(authenticated_at=datetime.now(UTC) - timedelta(hours=2))
    )
    await db_session.commit()
    resp = await client.delete(f"{IDENTITIES}/google")
    assert resp.status_code == 403


async def test_sessions_list_and_revoke_other(client, db_session):
    await authenticate(client, telegram_id=1, user_agent=PHONE_UA)  # session A
    first_sessions = (await client.get(SESSIONS)).json()
    session_a = first_sessions[0]["id"]

    await authenticate(client, telegram_id=1, user_agent=LAPTOP_UA)  # session B, now current
    sessions = (await client.get(SESSIONS)).json()
    assert len(sessions) == 2

    revoke = await client.delete(f"{SESSIONS}/{session_a}")
    assert revoke.status_code == 204

    active = (
        await db_session.execute(
            select(RefreshToken).where(RefreshToken.session_id == session_a, RefreshToken.revoked_at.is_(None))
        )
    ).scalars().all()
    assert active == []


async def test_repeat_sign_in_from_same_device_reuses_its_session(client, db_session):
    # a telegram webview that dropped the refresh cookie re-authenticates on every
    # launch; those launches must not pile up as separate devices
    await authenticate(client, telegram_id=1, user_agent=PHONE_UA)
    opened = (await client.get(SESSIONS)).json()
    await authenticate(client, telegram_id=1, user_agent=PHONE_UA)
    await authenticate(client, telegram_id=1, user_agent=PHONE_UA)

    sessions = (await client.get(SESSIONS)).json()
    assert [s["id"] for s in sessions] == [opened[0]["id"]]
    assert sessions[0]["current"] is True
    # three logins, one session, and its lifetime still starts at the first
    tokens = (await db_session.execute(select(RefreshToken))).scalars().all()
    assert len({t.session_id for t in tokens}) == 1
    assert sessions[0]["created_at"] == opened[0]["created_at"]


async def test_session_reports_device_details_from_user_agent(client):
    await authenticate(client, telegram_id=1, user_agent=PHONE_UA)
    session = (await client.get(SESSIONS)).json()[0]

    assert session["device_type"] == "mobile"
    assert session["device_model"] == "SM-A536E"
    assert session["browser"] == "Chrome"
    assert session["browser_version"] == "137"
    assert session["operating_system"] == "Android"
    assert session["os_version"] == "13"
    assert session["in_app"] is True


async def test_unidentified_clients_get_their_own_sessions(client):
    # nothing distinguishes two callers that send no user agent, so they must not
    # be merged into one device entry
    await authenticate(client, telegram_id=1, user_agent="")
    await authenticate(client, telegram_id=1, user_agent="")
    assert len((await client.get(SESSIONS)).json()) == 2


async def test_revoke_other_users_session_is_404(client, db_session):
    # session belonging to a different user
    other = User(telegram_id=None)
    db_session.add(other)
    await db_session.flush()
    token = RefreshToken(user_id=other.id, token_hash="h", expires_at=datetime.now(UTC) + timedelta(days=1))
    db_session.add(token)
    await db_session.commit()

    await authenticate(client, telegram_id=1)
    resp = await client.delete(f"{SESSIONS}/{token.session_id}")
    assert resp.status_code == 404


async def test_logout_everywhere_revokes_all_and_clears_cookie(client, db_session):
    await authenticate(client, telegram_id=1)
    await authenticate(client, telegram_id=1)  # a second login on the same session
    resp = await client.post("/api/v1/auth/logout-all")
    assert resp.status_code == 204

    active = (
        await db_session.execute(
            select(RefreshToken).where(RefreshToken.revoked_at.is_(None))
        )
    ).scalars().all()
    assert active == []
    # the refresh cookie no longer restores a session
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    events = (
        await db_session.execute(
            select(SecurityAuditEvent).where(SecurityAuditEvent.event_type == "logged_out_all")
        )
    ).scalars().all()
    assert len(events) == 1

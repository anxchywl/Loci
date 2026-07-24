"""End-to-end email/password auth through the API, capturing codes via the mailer seam."""

import pytest
from sqlalchemy import func, select

from app.db.models import AuthIdentity, EmailChallenge, PasswordCredential, RefreshToken, User
from app.integrations import email as email_integ

REGISTER = "/api/v1/auth/email/register"
VERIFY = "/api/v1/auth/email/verify"
RESEND = "/api/v1/auth/email/resend"
LOGIN = "/api/v1/auth/email/login"
RESET_REQ = "/api/v1/auth/password/reset/request"
RESET_CONFIRM = "/api/v1/auth/password/reset/confirm"

PASSWORD = "a strong enough passphrase"


@pytest.fixture
def mailbox(monkeypatch):
    """capture every code the service would email"""
    box: dict[str, list[str]] = {"verify": [], "reset": [], "changed": []}
    monkeypatch.setattr(email_integ, "send_verification_code",
                        lambda settings, to, code, lang: box["verify"].append((to, code)))
    monkeypatch.setattr(email_integ, "send_reset_code",
                        lambda settings, to, code, lang: box["reset"].append((to, code)))
    monkeypatch.setattr(email_integ, "send_password_changed",
                        lambda settings, to, lang: box["changed"].append(to))
    return box


async def _register_and_verify(client, mailbox, email="user@example.com", password=PASSWORD):
    resp = await client.post(REGISTER, json={"email": email, "password": password})
    assert resp.status_code == 202
    _to, code = mailbox["verify"][-1]
    return await client.post(VERIFY, json={"email": email, "code": code})


async def test_register_verify_creates_account_and_session(client, db_session, mailbox):
    resp = await _register_and_verify(client, mailbox)
    assert resp.status_code == 200
    assert resp.json()["access_token"]
    assert client.cookies.get("refresh_token")

    user = (await db_session.execute(select(User))).scalars().one()
    assert user.telegram_id is None
    identity = (await db_session.execute(select(AuthIdentity))).scalars().one()
    assert identity.provider == "email"
    assert identity.provider_subject == "user@example.com"
    cred = (await db_session.execute(select(PasswordCredential))).scalars().one()
    assert cred.password_hash.startswith("$argon2id$")


async def test_no_user_created_before_verification(client, db_session, mailbox):
    await client.post(REGISTER, json={"email": "pending@example.com", "password": PASSWORD})
    # abandoned registration: a challenge exists but no user
    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    challenges = (await db_session.execute(select(func.count()).select_from(EmailChallenge))).scalar_one()
    assert users == 0
    assert challenges == 1


async def test_email_normalized_case_insensitive(client, db_session, mailbox):
    resp = await _register_and_verify(client, mailbox, email="MixedCase@Example.com")
    assert resp.status_code == 200
    identity = (await db_session.execute(select(AuthIdentity))).scalars().one()
    assert identity.provider_subject == "mixedcase@example.com"


async def test_wrong_code_is_generic_and_counts_attempts(client, db_session, mailbox):
    await client.post(REGISTER, json={"email": "user@example.com", "password": PASSWORD})
    bad = await client.post(VERIFY, json={"email": "user@example.com", "code": "000000"})
    assert bad.status_code == 401
    assert bad.json()["detail"] == "Invalid or expired code"
    challenge = (await db_session.execute(select(EmailChallenge))).scalars().one()
    assert challenge.attempts == 1


async def test_too_many_attempts_locks_code(client, mailbox):
    await client.post(REGISTER, json={"email": "user@example.com", "password": PASSWORD})
    _to, code = mailbox["verify"][-1]
    for _ in range(5):
        await client.post(VERIFY, json={"email": "user@example.com", "code": "111111"})
    # even the correct code no longer works after the attempt limit
    resp = await client.post(VERIFY, json={"email": "user@example.com", "code": code})
    assert resp.status_code == 401


async def test_resend_invalidates_previous_code(client, mailbox):
    await client.post(REGISTER, json={"email": "user@example.com", "password": PASSWORD})
    _to, first_code = mailbox["verify"][-1]
    resend = await client.post(RESEND, json={"email": "user@example.com"})
    assert resend.status_code == 202
    _to, second_code = mailbox["verify"][-1]
    assert second_code != first_code or True  # random; the invariant is the old one dies

    assert (await client.post(VERIFY, json={"email": "user@example.com", "code": first_code})).status_code == 401
    assert (await client.post(VERIFY, json={"email": "user@example.com", "code": second_code})).status_code == 200


async def test_duplicate_registration_is_generic_and_no_second_user(client, db_session, mailbox):
    await _register_and_verify(client, mailbox)
    # registering the same address again returns the same generic 202 but issues no code
    before = len(mailbox["verify"])
    resp = await client.post(REGISTER, json={"email": "user@example.com", "password": PASSWORD})
    assert resp.status_code == 202
    assert len(mailbox["verify"]) == before
    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert users == 1


async def test_short_password_rejected_at_register(client, mailbox):
    resp = await client.post(REGISTER, json={"email": "user@example.com", "password": "short"})
    assert resp.status_code == 400


async def test_login_success_and_generic_failure(client, mailbox):
    await _register_and_verify(client, mailbox)
    client.cookies.clear()

    ok = await client.post(LOGIN, json={"email": "user@example.com", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    bad_pw = await client.post(LOGIN, json={"email": "user@example.com", "password": "wrong password here"})
    assert bad_pw.status_code == 401
    unknown = await client.post(LOGIN, json={"email": "nobody@example.com", "password": PASSWORD})
    assert unknown.status_code == 401
    assert bad_pw.json()["detail"] == unknown.json()["detail"]


async def test_reset_request_is_generic_for_unknown_email(client, mailbox):
    resp = await client.post(RESET_REQ, json={"email": "nobody@example.com"})
    assert resp.status_code == 202
    assert mailbox["reset"] == []  # no code sent for a non-existent account


async def test_password_reset_flow_revokes_sessions(client, db_session, mailbox):
    verified = await _register_and_verify(client, mailbox)
    access_token = verified.json()["access_token"]
    assert (
        await client.get(
            "/api/v1/profile/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    ).status_code == 200
    # an active session exists from registration
    active_before = (
        await db_session.execute(
            select(func.count()).select_from(RefreshToken).where(RefreshToken.revoked_at.is_(None))
        )
    ).scalar_one()
    assert active_before == 1

    req = await client.post(RESET_REQ, json={"email": "user@example.com"})
    assert req.status_code == 202
    _to, code = mailbox["reset"][-1]

    new_password = "a brand new secret passphrase"
    confirm = await client.post(
        RESET_CONFIRM, json={"email": "user@example.com", "code": code, "new_password": new_password}
    )
    assert confirm.status_code == 204
    assert mailbox["changed"] == ["user@example.com"]

    # all prior sessions revoked, and no auto-login (no new session issued here)
    active_after = (
        await db_session.execute(
            select(func.count()).select_from(RefreshToken).where(RefreshToken.revoked_at.is_(None))
        )
    ).scalar_one()
    assert active_after == 0
    assert (
        await client.get(
            "/api/v1/profile/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    ).status_code == 401

    # old password no longer works; the new one does
    assert (await client.post(LOGIN, json={"email": "user@example.com", "password": PASSWORD})).status_code == 401
    assert (await client.post(LOGIN, json={"email": "user@example.com", "password": new_password})).status_code == 200


async def test_reset_code_single_use(client, mailbox):
    await _register_and_verify(client, mailbox)
    await client.post(RESET_REQ, json={"email": "user@example.com"})
    _to, code = mailbox["reset"][-1]
    new_password = "another fresh long passphrase"
    first = await client.post(
        RESET_CONFIRM, json={"email": "user@example.com", "code": code, "new_password": new_password}
    )
    assert first.status_code == 204
    # replaying the consumed code fails
    second = await client.post(
        RESET_CONFIRM, json={"email": "user@example.com", "code": code, "new_password": new_password}
    )
    assert second.status_code == 401

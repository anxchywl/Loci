"""Every linking order, duplicate-provider conflicts, and the protected primary method.

The Loci account is ``users.id``; a provider identity only ever points at it. So
each permutation below asserts the same two things: linking never creates a
second account, and every linked method independently signs in to that same id.
"""

import json
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import func, select

from app.db.models import AuthIdentity, User
from app.integrations import email as email_integ
from app.integrations import google as google_integ
from tests.google_helpers import public_jwk, sign_id_token
from tests.test_stories_api import authenticate

IDENTITIES = "/api/v1/auth/identities"
GOOGLE_START = "/api/v1/auth/google/start"
GOOGLE_LINK_START = "/api/v1/auth/google/link/start"
GOOGLE_CALLBACK = "/api/v1/auth/google/callback"
EMAIL_REGISTER = "/api/v1/auth/email/register"
EMAIL_VERIFY = "/api/v1/auth/email/verify"
EMAIL_LOGIN = "/api/v1/auth/email/login"
EMAIL_LINK_START = "/api/v1/auth/identities/email/start"
EMAIL_LINK_VERIFY = "/api/v1/auth/identities/email/verify"
TELEGRAM_LINK_START = "/api/v1/auth/telegram/link/start"
PASSWORD = "a strong enough passphrase"


@pytest.fixture
def mailbox(monkeypatch):
    """capture every code the service would email"""
    box: dict[str, list] = {"verify": [], "reset": [], "changed": []}
    monkeypatch.setattr(
        email_integ,
        "send_verification_code",
        lambda settings, to, code, lang: box["verify"].append((to, code)),
    )
    return box


def _stage_google(monkeypatch, id_token: str) -> None:
    async def fake_exchange(settings, code, code_verifier):
        return {"id_token": id_token}

    async def fake_jwks():
        return [public_jwk()]

    monkeypatch.setattr(google_integ, "exchange_code", fake_exchange)
    monkeypatch.setattr(google_integ, "fetch_jwks", fake_jwks)


async def _google_callback(client, fake_redis, monkeypatch, start_url, *, sub, email):
    resp = await client.get(start_url, params={"redirect": "/"})
    assert resp.status_code == 200, resp.text
    state = parse_qs(urlparse(resp.json()["authorization_url"]).query)["state"][0]
    nonce = json.loads(await fake_redis.get(f"oauth:google:{state}"))["nonce"]
    _stage_google(monkeypatch, sign_id_token(sub=sub, nonce=nonce, email=email))
    return await client.get(GOOGLE_CALLBACK, params={"code": "c", "state": state})


async def google_login(client, fake_redis, monkeypatch, *, sub, email="g@example.com"):
    return await _google_callback(
        client, fake_redis, monkeypatch, GOOGLE_START, sub=sub, email=email
    )


async def google_link(client, fake_redis, monkeypatch, *, sub, email="g@example.com"):
    return await _google_callback(
        client, fake_redis, monkeypatch, GOOGLE_LINK_START, sub=sub, email=email
    )


async def email_register(client, mailbox, email="user@example.com"):
    resp = await client.post(EMAIL_REGISTER, json={"email": email, "password": PASSWORD})
    assert resp.status_code == 202, resp.text
    _to, code = mailbox["verify"][-1]
    return await client.post(EMAIL_VERIFY, json={"email": email, "code": code})


async def email_link(client, mailbox, email="user@example.com"):
    start = await client.post(EMAIL_LINK_START, json={"email": email, "password": PASSWORD})
    assert start.status_code == 202, start.text
    _to, code = mailbox["verify"][-1]
    return await client.post(EMAIL_LINK_VERIFY, json={"email": email, "code": code})


async def telegram_link(client, db_session, *, user_id: int, telegram_id: int):
    """redeem a link the way the bot does, once the token has proved the account"""
    from app.core.security.telegram import TelegramUserData
    from app.modules.auth import linking as linking_service

    await linking_service.link_telegram(
        db_session,
        user_id,
        TelegramUserData(
            telegram_id=telegram_id,
            username=None,
            first_name="T",
            last_name=None,
            photo_url=None,
            language_code=None,
        ),
    )


def use_token(client, response) -> None:
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"


async def account_count(db_session) -> int:
    return int((await db_session.execute(select(func.count()).select_from(User))).scalar_one())


async def linked_providers(client) -> set[str]:
    resp = await client.get(IDENTITIES)
    assert resp.status_code == 200, resp.text
    return {row["provider"] for row in resp.json()}


async def me_id(client) -> int:
    resp = await client.get("/api/v1/profile/me")
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ── linking permutations ────────────────────────────────────────────


async def test_telegram_then_google(client, db_session, fake_redis, monkeypatch):
    await authenticate(client, telegram_id=1)
    user_id = await me_id(client)

    assert (await google_link(client, fake_redis, monkeypatch, sub="g-1")).status_code == 303

    assert await linked_providers(client) == {"telegram", "google"}
    assert await account_count(db_session) == 1
    assert await me_id(client) == user_id


async def test_telegram_then_email(client, db_session, mailbox):
    await authenticate(client, telegram_id=1)
    user_id = await me_id(client)

    assert (await email_link(client, mailbox)).status_code == 204

    assert await linked_providers(client) == {"telegram", "email"}
    assert await account_count(db_session) == 1
    # the new method signs in independently, to the same account
    login = await client.post(EMAIL_LOGIN, json={"email": "user@example.com", "password": PASSWORD})
    assert login.status_code == 200
    use_token(client, login)
    assert await me_id(client) == user_id


async def test_google_then_telegram(client, db_session, fake_redis, monkeypatch):
    login = await google_login(client, fake_redis, monkeypatch, sub="g-2")
    assert login.status_code == 303
    identity = (await db_session.execute(select(AuthIdentity))).scalars().one()
    user_id = identity.user_id
    await authenticate_as_existing(client, db_session, user_id)

    await telegram_link(client, db_session, user_id=user_id, telegram_id=77)

    assert await linked_providers(client) == {"google", "telegram"}
    assert await account_count(db_session) == 1
    # telegram now signs in on its own and resolves to the same account
    await authenticate(client, telegram_id=77)
    assert await me_id(client) == user_id


async def test_google_then_email(client, db_session, fake_redis, monkeypatch, mailbox):
    assert (await google_login(client, fake_redis, monkeypatch, sub="g-3")).status_code == 303
    identity = (await db_session.execute(select(AuthIdentity))).scalars().one()
    user_id = identity.user_id
    await authenticate_as_existing(client, db_session, user_id)

    assert (await email_link(client, mailbox)).status_code == 204

    assert await linked_providers(client) == {"google", "email"}
    assert await account_count(db_session) == 1
    login = await client.post(EMAIL_LOGIN, json={"email": "user@example.com", "password": PASSWORD})
    assert login.status_code == 200
    use_token(client, login)
    assert await me_id(client) == user_id


async def test_email_then_telegram(client, db_session, mailbox):
    verify = await email_register(client, mailbox)
    assert verify.status_code == 200
    use_token(client, verify)
    user_id = await me_id(client)

    await telegram_link(client, db_session, user_id=user_id, telegram_id=88)

    assert await linked_providers(client) == {"email", "telegram"}
    assert await account_count(db_session) == 1
    await authenticate(client, telegram_id=88)
    assert await me_id(client) == user_id


async def test_email_then_google(client, db_session, fake_redis, monkeypatch, mailbox):
    verify = await email_register(client, mailbox)
    assert verify.status_code == 200
    use_token(client, verify)
    user_id = await me_id(client)

    assert (await google_link(client, fake_redis, monkeypatch, sub="g-4")).status_code == 303

    assert await linked_providers(client) == {"email", "google"}
    assert await account_count(db_session) == 1
    assert await me_id(client) == user_id


async def test_all_three_linked_each_logs_into_the_same_account(
    client, db_session, fake_redis, monkeypatch, mailbox
):
    await authenticate(client, telegram_id=9)
    user_id = await me_id(client)
    assert (await google_link(client, fake_redis, monkeypatch, sub="g-all")).status_code == 303
    assert (await email_link(client, mailbox, email="all@example.com")).status_code == 204

    assert await linked_providers(client) == {"telegram", "google", "email"}
    assert await account_count(db_session) == 1

    await authenticate(client, telegram_id=9)
    assert await me_id(client) == user_id

    login = await client.post(EMAIL_LOGIN, json={"email": "all@example.com", "password": PASSWORD})
    use_token(client, login)
    assert await me_id(client) == user_id

    assert (await google_login(client, fake_redis, monkeypatch, sub="g-all")).status_code == 303
    assert await account_count(db_session) == 1


async def authenticate_as_existing(client, db_session, user_id: int) -> None:
    """put a bearer token for an already-created account on the client"""
    from app.core.config import get_settings
    from app.modules.auth.service import issue_session_tokens

    user = await db_session.get(User, user_id)
    response, _refresh = await issue_session_tokens(db_session, user, get_settings())
    await db_session.commit()
    client.headers["Authorization"] = f"Bearer {response.access_token}"


# ── duplicate-provider conflicts ────────────────────────────────────


async def test_linking_google_owned_by_another_account_fails_without_merging(
    client, db_session, fake_redis, monkeypatch
):
    other = User(telegram_id=None, primary_provider="google")
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        AuthIdentity(
            user_id=other.id,
            provider="google",
            provider_issuer="https://accounts.google.com",
            provider_subject="taken",
        )
    )
    await db_session.commit()

    await authenticate(client, telegram_id=1)
    resp = await google_link(client, fake_redis, monkeypatch, sub="taken")

    assert resp.headers["location"] == "https://app.example/?auth=error"
    assert await linked_providers(client) == {"telegram"}
    assert await account_count(db_session) == 2  # the two accounts stayed separate


async def test_linking_email_owned_by_another_account_fails(client, db_session, mailbox):
    verify = await email_register(client, mailbox, email="owner@example.com")
    assert verify.status_code == 200

    await authenticate(client, telegram_id=1)
    start = await client.post(
        EMAIL_LINK_START, json={"email": "owner@example.com", "password": PASSWORD}
    )

    assert start.status_code == 409
    assert await linked_providers(client) == {"telegram"}
    assert await account_count(db_session) == 2


async def test_linking_telegram_owned_by_another_account_fails(client, db_session, mailbox):
    from app.modules.auth.linking import LinkError

    await authenticate(client, telegram_id=42)  # account A owns telegram 42

    verify = await email_register(client, mailbox, email="second@example.com")
    assert verify.status_code == 200
    use_token(client, verify)
    second_id = await me_id(client)

    with pytest.raises(LinkError):
        await telegram_link(client, db_session, user_id=second_id, telegram_id=42)

    assert await linked_providers(client) == {"email"}
    assert await account_count(db_session) == 2


async def test_matching_email_never_merges_accounts(
    client, db_session, fake_redis, monkeypatch, mailbox
):
    """The same address on two providers must stay two accounts — email is not a key."""
    verify = await email_register(client, mailbox, email="same@example.com")
    assert verify.status_code == 200

    client.headers.pop("Authorization", None)
    client.cookies.clear()
    assert (
        await google_login(client, fake_redis, monkeypatch, sub="g-same", email="same@example.com")
    ).status_code == 303

    assert await account_count(db_session) == 2
    providers = (await db_session.execute(select(AuthIdentity.provider))).scalars().all()
    assert sorted(providers) == ["email", "google"]


# ── protected primary method ────────────────────────────────────────


async def test_creation_provider_recorded_for_each_entry_point(
    client, db_session, fake_redis, monkeypatch, mailbox
):
    await authenticate(client, telegram_id=1)
    assert (await db_session.get(User, await me_id(client))).primary_provider == "telegram"

    client.headers.pop("Authorization", None)
    client.cookies.clear()
    assert (await google_login(client, fake_redis, monkeypatch, sub="g-primary")).status_code == 303

    client.cookies.clear()
    verify = await email_register(client, mailbox, email="third@example.com")
    assert verify.status_code == 200

    rows = (await db_session.execute(select(User.primary_provider).order_by(User.id))).scalars().all()
    assert rows == ["telegram", "google", "email"]


async def test_primary_is_flagged_in_the_identities_list(client, fake_redis, monkeypatch):
    await authenticate(client, telegram_id=1)
    await google_link(client, fake_redis, monkeypatch, sub="g-flag")

    rows = {r["provider"]: r["is_primary"] for r in (await client.get(IDENTITIES)).json()}
    assert rows == {"telegram": True, "google": False}


async def test_primary_cannot_be_unlinked_even_with_another_method(
    client, db_session, fake_redis, monkeypatch
):
    await authenticate(client, telegram_id=1)
    await google_link(client, fake_redis, monkeypatch, sub="g-protected")

    resp = await client.delete(f"{IDENTITIES}/telegram")

    assert resp.status_code == 400
    assert await linked_providers(client) == {"telegram", "google"}


async def test_secondary_can_be_unlinked(client, fake_redis, monkeypatch):
    await authenticate(client, telegram_id=1)
    await google_link(client, fake_redis, monkeypatch, sub="g-secondary")

    assert (await client.delete(f"{IDENTITIES}/google")).status_code == 204
    assert await linked_providers(client) == {"telegram"}


async def test_google_created_account_cannot_unlink_google(
    client, db_session, fake_redis, monkeypatch, mailbox
):
    """primary follows the creation provider, not the provider type"""
    assert (await google_login(client, fake_redis, monkeypatch, sub="g-owner")).status_code == 303
    identity = (await db_session.execute(select(AuthIdentity))).scalars().one()
    await authenticate_as_existing(client, db_session, identity.user_id)
    assert (await email_link(client, mailbox)).status_code == 204

    assert (await client.delete(f"{IDENTITIES}/google")).status_code == 400
    assert (await client.delete(f"{IDENTITIES}/email")).status_code == 204
    assert await linked_providers(client) == {"google"}


async def test_last_method_is_still_protected_when_primary_is_unknown(client, db_session):
    """legacy rows the backfill could not resolve keep the last-method guard"""
    await authenticate(client, telegram_id=1)
    user = await db_session.get(User, await me_id(client))
    user.primary_provider = None
    await db_session.commit()

    assert (await client.delete(f"{IDENTITIES}/telegram")).status_code == 400
    assert await linked_providers(client) == {"telegram"}


# ── telegram account switching ──────────────────────────────────────


async def test_switching_telegram_id_resolves_to_the_other_account(client, db_session):
    """TG2 authenticating over TG1's live cookie must get TG2's own account.

    The server is the side that gets this right unconditionally: it reads the
    signed init data, never the cookie. What the client must not do is skip
    asking — see the mini-app bootstrap.
    """
    await authenticate(client, telegram_id=1)
    first_id = await me_id(client)
    assert client.cookies.get("refresh_token")

    await authenticate(client, telegram_id=2)  # same client, TG1's cookie still set
    second_id = await me_id(client)

    assert second_id != first_id
    assert await account_count(db_session) == 2
    assert (await db_session.get(User, second_id)).telegram_id == 2


async def test_switched_session_cannot_read_the_previous_accounts_identities(client, mailbox):
    await authenticate(client, telegram_id=1)
    assert (await email_link(client, mailbox, email="first@example.com")).status_code == 204
    assert await linked_providers(client) == {"telegram", "email"}

    await authenticate(client, telegram_id=2)

    # the new account starts with only its own method, whatever the old one had
    assert await linked_providers(client) == {"telegram"}


async def test_previous_access_token_still_only_reads_its_own_account(client):
    first_token = await authenticate(client, telegram_id=1)
    first_id = await me_id(client)

    await authenticate(client, telegram_id=2)
    second_id = await me_id(client)

    # a stale token left over from the switch resolves to its own account, never
    # to whichever account is current
    client.headers["Authorization"] = f"Bearer {first_token}"
    assert await me_id(client) == first_id != second_id

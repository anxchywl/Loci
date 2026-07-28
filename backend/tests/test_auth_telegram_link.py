"""Connecting Telegram to an existing account through a one-time deep link.

The browser and the bot never share a credential, so these tests cover the
token that joins them: it is minted for one account, redeemed once, and proves
nothing on its own after that.
"""

from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.core.security.telegram import TelegramUserData
from app.db.models import AuthIdentity, SecurityAuditEvent, User
from app.modules.auth import linking as linking_service
from app.modules.auth import telegram_link as telegram_link_service
from app.integrations import email as email_integ
from app.modules.auth.linking import LinkError

LINK_START = "/api/v1/auth/telegram/link/start"
IDENTITIES = "/api/v1/auth/identities"
PASSWORD = "a strong enough passphrase"


@pytest.fixture
def mailbox(monkeypatch):
    codes: list[str] = []
    monkeypatch.setattr(
        email_integ, "send_verification_code",
        lambda settings, to, code, lang: codes.append(code),
    )
    return codes


async def register_and_verify(client, mailbox, email: str) -> int:
    """an account with no telegram of its own, signed in on this client"""
    resp = await client.post(
        "/api/v1/auth/email/register", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 202
    verified = await client.post(
        "/api/v1/auth/email/verify", json={"email": email, "code": mailbox[-1]}
    )
    assert verified.status_code == 200
    client.headers["Authorization"] = f"Bearer {verified.json()['access_token']}"
    return verified.json()["user"]["id"]


def _telegram_profile(telegram_id: int = 4242) -> TelegramUserData:
    """what the bot sees on the message that carries the /start payload"""
    return TelegramUserData(
        telegram_id=telegram_id,
        username="mapper",
        first_name="Aru",
        last_name=None,
        photo_url=None,
        language_code="kk",
    )


async def _start_link(client) -> str:
    resp = await client.post(LINK_START)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    url = urlparse(body["url"])
    assert (url.netloc, url.path) == ("t.me", "/loci_app_bot")
    assert body["expires_in"] == telegram_link_service.LINK_TOKEN_TTL_SECONDS
    return parse_qs(url.query)["start"][0]


async def test_pressing_start_links_the_account_that_asked(client, db_session, fake_redis, mailbox):
    user_id = await register_and_verify(client, mailbox, "linker@example.com")
    token = await _start_link(client)

    # the bot's half of the flow: redeem the payload, attach the identity
    assert await telegram_link_service.consume_token(fake_redis, token) == user_id
    await linking_service.link_telegram(db_session, user_id, _telegram_profile())

    identities = (
        await db_session.execute(select(AuthIdentity).where(AuthIdentity.user_id == user_id))
    ).scalars().all()
    assert {i.provider for i in identities} == {"email", "telegram"}
    # notifications address a user by telegram_id, so the link has to fill it in
    user = await db_session.get(User, user_id)
    assert user.telegram_id == 4242

    events = (
        await db_session.execute(
            select(SecurityAuditEvent).where(SecurityAuditEvent.event_type == "identity_linked")
        )
    ).scalars().all()
    assert [e.provider for e in events] == ["telegram"]

    # and the app sees it without being told: the row it polls now lists telegram
    listed = (await client.get(IDENTITIES)).json()
    assert "telegram" in {row["provider"] for row in listed}


async def test_token_is_single_use(client, fake_redis, mailbox):
    await register_and_verify(client, mailbox, "once@example.com")
    token = await _start_link(client)

    assert await telegram_link_service.consume_token(fake_redis, token) is not None
    assert await telegram_link_service.consume_token(fake_redis, token) is None


async def test_token_is_stored_only_as_a_hash(client, fake_redis, mailbox):
    await register_and_verify(client, mailbox, "hashed@example.com")
    token = await _start_link(client)

    # a dump of redis must not hand anyone a working payload
    assert await fake_redis.get(f"tg:link:{token}") is None
    assert len(await fake_redis.keys("tg:link:*")) == 1


async def test_unknown_and_oversized_payloads_link_nothing(fake_redis):
    assert await telegram_link_service.consume_token(fake_redis, "not-a-token") is None
    assert await telegram_link_service.consume_token(fake_redis, "") is None
    assert await telegram_link_service.consume_token(fake_redis, "x" * 200) is None


async def test_pressing_start_twice_is_not_an_error(client, db_session, fake_redis, mailbox):
    user_id = await register_and_verify(client, mailbox, "twice@example.com")
    token = await _start_link(client)
    assert await telegram_link_service.consume_token(fake_redis, token) == user_id

    await linking_service.link_telegram(db_session, user_id, _telegram_profile())
    await linking_service.link_telegram(db_session, user_id, _telegram_profile())

    identities = (
        await db_session.execute(
            select(AuthIdentity).where(
                AuthIdentity.user_id == user_id, AuthIdentity.provider == "telegram"
            )
        )
    ).scalars().all()
    assert len(identities) == 1


async def test_telegram_account_owned_by_someone_else_is_refused(client, db_session, mailbox):
    user_id = await register_and_verify(client, mailbox, "contested@example.com")
    other = User(telegram_id=4242)
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        AuthIdentity(user_id=other.id, provider="telegram", provider_subject="4242")
    )
    await db_session.commit()

    with pytest.raises(LinkError):
        await linking_service.link_telegram(db_session, user_id, _telegram_profile())


async def test_start_refused_when_telegram_is_already_linked(client):
    from tests.test_stories_api import authenticate

    await authenticate(client, telegram_id=777)
    resp = await client.post(LINK_START)
    assert resp.status_code == 409


async def test_start_requires_authentication(client):
    resp = await client.post(LINK_START)
    assert resp.status_code == 401


class _Message:
    """the parts of an aiogram message the /start handler touches"""

    def __init__(self, telegram_id: int = 4242):
        profile = _telegram_profile(telegram_id)
        self.from_user = SimpleNamespace(
            id=profile.telegram_id,
            username=profile.username,
            first_name=profile.first_name,
            last_name=profile.last_name,
            language_code=profile.language_code,
        )
        self.replies: list[str] = []

    async def answer(self, text: str, reply_markup=None) -> None:
        self.replies.append(text)


class _Command:
    def __init__(self, args: str | None):
        self.args = args


@pytest.fixture
def bot_module(monkeypatch, db_session, fake_redis):
    """the bot handler wired to the test session and redis"""
    from app.workers import bot

    async def _sessions():
        yield db_session

    monkeypatch.setattr(bot, "get_redis_client", lambda: fake_redis)
    monkeypatch.setattr(bot, "get_session", _sessions)
    monkeypatch.setattr(bot, "_open_app_keyboard", lambda: None)
    return bot


async def test_bot_start_redeems_the_token_and_links(client, db_session, fake_redis, mailbox, bot_module):
    user_id = await register_and_verify(client, mailbox, "bot@example.com")
    token = await _start_link(client)

    message = _Message()
    await bot_module.handle_start_link(message, _Command(token))

    identity = (
        await db_session.execute(
            select(AuthIdentity).where(
                AuthIdentity.user_id == user_id, AuthIdentity.provider == "telegram"
            )
        )
    ).scalar_one()
    assert identity.provider_subject == "4242"
    assert "connected" in message.replies[-1].lower()


async def test_bot_start_with_a_stale_token_falls_back_to_the_plain_greeting(bot_module):
    message = _Message()
    await bot_module.handle_start_link(message, _Command("expired-or-unknown"))

    assert message.replies == ["Pin your life moments to the map."]


async def test_bot_start_refuses_a_telegram_account_owned_elsewhere(
    client, db_session, fake_redis, mailbox, bot_module
):
    await register_and_verify(client, mailbox, "taken@example.com")
    token = await _start_link(client)
    other = User(telegram_id=4242)
    db_session.add(other)
    await db_session.flush()
    db_session.add(AuthIdentity(user_id=other.id, provider="telegram", provider_subject="4242"))
    await db_session.commit()

    message = _Message()
    await bot_module.handle_start_link(message, _Command(token))

    assert "another Loci account" in message.replies[-1]

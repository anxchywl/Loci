"""One-time deep-link tokens that connect a Telegram account to a Loci account.

The two halves of the flow never share a credential: the browser holds a Loci
session and no Telegram identity, the bot sees a Telegram user and no Loci
session. They are joined by a token the app mints for the authenticated user,
hands to Telegram as the `?start=` payload, and the bot redeems when the user
presses Start.

Only the token's hash is stored, the entry expires within minutes, and
redemption is a single atomic get+delete — so a payload that leaks out of a
chat log links nothing on a second use.
"""

import hashlib
import secrets

from redis.asyncio import Redis

from app.core.config import Settings

LINK_TOKEN_TTL_SECONDS = 600
_PREFIX = "tg:link:"
# telegram caps the /start payload at 64 characters of [A-Za-z0-9_-]; 32 bytes
# url-safe is 43 of them
_TOKEN_BYTES = 32
_MAX_TOKEN_LENGTH = 64


def _key(token: str) -> str:
    return _PREFIX + hashlib.sha256(token.encode()).hexdigest()


async def issue_token(redis: Redis, user_id: int) -> str:
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    await redis.set(_key(token), str(user_id), ex=LINK_TOKEN_TTL_SECONDS)
    return token


async def consume_token(redis: Redis, token: str) -> int | None:
    """Redeem a token at most once, returning the user it was minted for."""
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        return None
    key = _key(token)
    async with redis.pipeline(transaction=True) as pipe:
        pipe.get(key)
        pipe.delete(key)
        raw, _ = await pipe.execute()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def deep_link(settings: Settings, token: str) -> str:
    """The URL that opens the bot — in the installed app when there is one, in
    Telegram Web otherwise, which is t.me's own behaviour."""
    return f"https://t.me/{settings.telegram_bot_username.lstrip('@')}?start={token}"

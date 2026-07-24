"""Single-use, short-lived OAuth transactions kept in Redis.

Holds the nonce, PKCE verifier, and post-login destination between the
authorization redirect and the callback, keyed by the opaque state value. Consume
is atomic (get+delete) so a state can back exactly one callback — this is the
login-CSRF and code-replay guard.
"""

import json

from redis.asyncio import Redis

_PREFIX = "oauth:google:"
TRANSACTION_TTL_SECONDS = 600


async def store_transaction(redis: Redis, state: str, data: dict) -> None:
    await redis.set(_PREFIX + state, json.dumps(data), ex=TRANSACTION_TTL_SECONDS)


async def consume_transaction(redis: Redis, state: str) -> dict | None:
    key = _PREFIX + state
    async with redis.pipeline(transaction=True) as pipe:
        pipe.get(key)
        pipe.delete(key)
        raw, _ = await pipe.execute()
    if not raw:
        return None
    return json.loads(raw)

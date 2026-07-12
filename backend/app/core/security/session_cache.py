"""Redis-backed shortcuts for the per-request auth hot path.

Every authenticated request used to run a session-validity query and write
``last_active_at`` (with a commit) against PostgreSQL. Both are served from
Redis here:

* session validity is cached for ``SESSION_OK_TTL_SECONDS`` — a revoked
  session may therefore outlive revocation by up to that TTL (approved
  trade-off; blocked/deleted users are still rejected immediately by the
  per-request user lookup). Logout invalidates the entry eagerly.
* ``last_active_at`` is written at most once per ``ACTIVITY_MARK_TTL_SECONDS``
  per user.

Redis failures degrade to the old behavior (query/write the database), never
to trusting the client.
"""

import logging
import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

SESSION_OK_TTL_SECONDS = 60
ACTIVITY_MARK_TTL_SECONDS = 300


def _session_key(session_id: uuid.UUID) -> str:
    return f"session-ok:{session_id}"


async def is_session_cached_active(redis: Redis, session_id: uuid.UUID) -> bool:
    try:
        return await redis.get(_session_key(session_id)) is not None
    except RedisError:
        return False


async def cache_session_active(redis: Redis, session_id: uuid.UUID) -> None:
    try:
        await redis.set(_session_key(session_id), "1", ex=SESSION_OK_TTL_SECONDS)
    except RedisError:
        logger.debug("session cache write skipped", exc_info=True)


async def invalidate_session(redis: Redis, session_id: uuid.UUID) -> None:
    try:
        await redis.delete(_session_key(session_id))
    except RedisError:
        # the entry expires within SESSION_OK_TTL_SECONDS anyway
        logger.warning("session cache invalidation failed", exc_info=True)


async def should_record_activity(redis: Redis, user_id: int) -> bool:
    try:
        return bool(
            await redis.set(f"active:{user_id}", "1", nx=True, ex=ACTIVITY_MARK_TTL_SECONDS)
        )
    except RedisError:
        # fall back to recording on every request, as before the cache existed
        return True

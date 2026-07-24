import asyncio
import json
import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.modules.stories.schemas import StoryResponse

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60
LOCK_TTL_SECONDS = 10
LOCK_WAIT_ATTEMPTS = 5
LOCK_WAIT_SECONDS = 0.05


def cache_key(limit: int) -> str:
    return f"trending:v1:{limit}"


async def read(redis: Redis, limit: int) -> list[StoryResponse] | None:
    try:
        raw = await redis.get(cache_key(limit))
        if not raw:
            return None
        return [StoryResponse.model_validate(item) for item in json.loads(raw)]
    except (RedisError, ValueError, TypeError, json.JSONDecodeError):
        return None


async def wait_for_fill(redis: Redis, limit: int) -> list[StoryResponse] | None:
    for _ in range(LOCK_WAIT_ATTEMPTS):
        await asyncio.sleep(LOCK_WAIT_SECONDS)
        cached = await read(redis, limit)
        if cached is not None:
            return cached
    return None


async def acquire_fill_lock(redis: Redis, limit: int) -> bool:
    try:
        return bool(
            await redis.set(
                f"{cache_key(limit)}:lock",
                "1",
                nx=True,
                ex=LOCK_TTL_SECONDS,
            )
        )
    except RedisError:
        return True


async def write(redis: Redis, limit: int, stories: list[StoryResponse]) -> None:
    payload = json.dumps([story.model_dump(mode="json") for story in stories])
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.set(cache_key(limit), payload, ex=CACHE_TTL_SECONDS)
            pipe.delete(f"{cache_key(limit)}:lock")
            await pipe.execute()
    except RedisError:
        logger.debug("trending cache write skipped", exc_info=True)


async def invalidate(redis: Redis) -> None:
    try:
        keys = [key async for key in redis.scan_iter(match="trending:v1:*")]
        if keys:
            await redis.delete(*keys)
    except RedisError:
        logger.debug("trending cache invalidation skipped", exc_info=True)

import time
from typing import Any

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.observability import REDIS_COMMAND_DURATION

_redis_client: Redis | None = None


class InstrumentedRedis(Redis):
    async def execute_command(self, *args: Any, **options: Any) -> Any:
        command = str(args[0]).upper() if args else "UNKNOWN"
        command = command if command.isalpha() and len(command) <= 24 else "OTHER"
        started = time.perf_counter()
        outcome = "success"
        try:
            return await super().execute_command(*args, **options)
        except Exception:
            outcome = "error"
            raise
        finally:
            REDIS_COMMAND_DURATION.labels(command=command, outcome=outcome).observe(
                time.perf_counter() - started
            )


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = InstrumentedRedis.from_url(
            get_settings().redis_dsn,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None

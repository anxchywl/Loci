import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.security.rate_limit import check_rate_limit, client_identifier


@pytest.mark.asyncio
async def test_allows_up_to_limit_then_rejects():
    redis = FakeRedis()
    for _ in range(3):
        await check_rate_limit(redis, "rl:test", "u1", 60, 3)
    with pytest.raises(HTTPException) as exc:
        await check_rate_limit(redis, "rl:test", "u1", 60, 3)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_window_is_not_extended_by_subsequent_requests():
    redis = FakeRedis()
    await check_rate_limit(redis, "rl:test", "u1", 3600, 100)
    # simulate a window that is nearly over
    await redis.expire("rl:test:u1", 5)
    await check_rate_limit(redis, "rl:test", "u1", 3600, 100)
    ttl = await redis.ttl("rl:test:u1")
    assert ttl <= 5, "a request inside the window must not restart it"


@pytest.mark.asyncio
async def test_orphaned_key_without_ttl_is_healed():
    redis = FakeRedis()
    # a crash between INCR and EXPIRE historically left a counter with no TTL
    await redis.set("rl:test:u1", 2)
    await check_rate_limit(redis, "rl:test", "u1", 60, 100)
    ttl = await redis.ttl("rl:test:u1")
    assert 0 < ttl <= 60


async def test_redis_outage_fails_closed_with_service_unavailable():
    class BrokenRedis:
        def pipeline(self, transaction=True):
            raise RedisConnectionError("unavailable")

    with pytest.raises(HTTPException) as exc:
        await check_rate_limit(BrokenRedis(), "rl:test", "u1", 60, 3)

    assert exc.value.status_code == 503


class _FakeRequest:
    def __init__(self, forwarded: str | None, peer: str = "10.0.0.9"):
        self.headers = {"x-forwarded-for": forwarded} if forwarded else {}

        class _Client:
            host = peer

        self.client = _Client()


def test_client_identifier_uses_last_forwarded_entry():
    request = _FakeRequest("6.6.6.6, 203.0.113.7")
    assert client_identifier(request, trust_proxy_headers=True) == "203.0.113.7"


def test_client_identifier_ignores_forwarded_when_untrusted():
    request = _FakeRequest("6.6.6.6")
    assert client_identifier(request, trust_proxy_headers=False) == "10.0.0.9"

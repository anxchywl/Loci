from fastapi import HTTPException, Request, status
from redis.asyncio import Redis
from redis.exceptions import RedisError


async def check_rate_limit(
    redis: Redis,
    key_prefix: str,
    identifier: str,
    window_seconds: int,
    max_requests: int,
) -> None:
    key = f"{key_prefix}:{identifier}"
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            # set expiry only on the first hit so sustained traffic cannot extend the window
            pipe.expire(key, window_seconds, nx=True)
            results = await pipe.execute()
    except RedisError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="rate limiting is temporarily unavailable",
        ) from exc

    count: int = results[0]
    if count > max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate limit exceeded — try again later",
            headers={"Retry-After": str(window_seconds)},
        )


def client_identifier(request: Request, trust_proxy_headers: bool) -> str:
    if trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # trust only the address appended by the reverse proxy
            parts = [part.strip() for part in forwarded.split(",") if part.strip()]
            if parts:
                return parts[-1]
    return request.client.host if request.client else "unknown"

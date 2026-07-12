"""Server-side marker aggregation for low map zooms.

At low zoom a LIMITed pin list caps the map at its newest N stories; grid
aggregation returns every occupied cell with a count instead. The aggregate
scans every discoverable story in view (measured 3.7 s for a world view over
1M rows), so results are cached.

Cache registry — key ``mapagg:v1:{zoom}:{bounds}:{category}``:
owner this module; data scope public (counts of already-discoverable points);
TTL 60 s, expiry-only invalidation (cluster counts may lag moderation actions
by up to a minute); stampede control via a singleflight lock with bounded
waiting; on Redis failure the aggregate is computed directly against
PostgreSQL; privacy: aggregates of public fuzzed/public points only, no
user- or moderation-scoped data ever enters the key or value.
"""

import asyncio
import json
import logging
import math

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import stories as stories_repo
from app.modules.stories.schemas import MapClusterResponse

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60
_LOCK_TTL_SECONDS = 15
_LOCK_WAIT_ATTEMPTS = 20
_LOCK_WAIT_INTERVAL_SECONDS = 0.1
# ~8 cells across a 512px tile keeps cluster density close to the client-side
# clustering it replaces
_CELLS_PER_TILE = 8
MIN_ZOOM = 0
MAX_ZOOM = 10


def cell_degrees(zoom: int) -> float:
    return 360.0 / ((2**zoom) * _CELLS_PER_TILE)


def _snap(value: float, step: float, up: bool) -> float:
    snapped = (math.ceil(value / step) if up else math.floor(value / step)) * step
    return round(snapped, 6)


async def get_clusters(
    db: AsyncSession,
    redis: Redis,
    *,
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    zoom: int,
    category_id: int | None,
) -> list[MapClusterResponse]:
    cell = cell_degrees(zoom)
    # snap the viewport outward to cell boundaries server-side so every client
    # looking at roughly the same area shares one cache entry
    q_min_lat = max(-90.0, _snap(min_lat, cell, up=False))
    q_max_lat = min(90.0, _snap(max_lat, cell, up=True))
    q_min_lon = max(-540.0, _snap(min_lon, cell, up=False))
    q_max_lon = min(540.0, _snap(max_lon, cell, up=True))

    key = (
        f"mapagg:v1:{zoom}:{q_min_lat}:{q_min_lon}:{q_max_lat}:{q_max_lon}:"
        f"{category_id or 0}"
    )

    cached = await _read_cache(redis, key)
    if cached is not None:
        return cached

    lock_key = f"{key}:lock"
    if not await _try_lock(redis, lock_key):
        # someone else is computing this exact viewport; wait briefly for their
        # result, then compute anyway rather than fail
        for _ in range(_LOCK_WAIT_ATTEMPTS):
            await asyncio.sleep(_LOCK_WAIT_INTERVAL_SECONDS)
            cached = await _read_cache(redis, key)
            if cached is not None:
                return cached

    rows = await stories_repo.aggregate_pins_in_bbox(
        db,
        min_lat=q_min_lat,
        min_lon=q_min_lon,
        max_lat=q_max_lat,
        max_lon=q_max_lon,
        cell_degrees=cell,
        category_id=category_id,
    )
    clusters = [
        MapClusterResponse(lat=row["lat"], lon=row["lon"], count=row["count"]) for row in rows
    ]
    await _write_cache(redis, key, clusters)
    try:
        await redis.delete(lock_key)
    except RedisError:
        pass
    return clusters


async def _read_cache(redis: Redis, key: str) -> list[MapClusterResponse] | None:
    try:
        raw = await redis.get(key)
    except RedisError:
        return None
    if not raw:
        return None
    return [MapClusterResponse(**item) for item in json.loads(raw)]


async def _write_cache(redis: Redis, key: str, clusters: list[MapClusterResponse]) -> None:
    try:
        await redis.set(
            key,
            json.dumps([cluster.model_dump() for cluster in clusters]),
            ex=CACHE_TTL_SECONDS,
        )
    except RedisError:
        logger.debug("map cluster cache write skipped", exc_info=True)


async def _try_lock(redis: Redis, lock_key: str) -> bool:
    try:
        return bool(await redis.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS))
    except RedisError:
        return True

from tests.test_interactions_api import create_story
from tests.test_stories_api import authenticate

WORLD = {"min_lat": -85, "min_lon": -180, "max_lat": 85, "max_lon": 180, "zoom": 2}


async def test_clusters_count_discoverable_stories_only(client, db_session):
    await authenticate(client, telegram_id=1)
    await create_story(client, db_session, title="almaty one")
    await create_story(client, db_session, title="almaty two")
    await create_story(client, title="pending never counted")
    await create_story(client, db_session, title="private", visibility="private")

    response = await client.get("/api/v1/stories/map-clusters", params=WORLD)
    assert response.status_code == 200
    clusters = response.json()
    assert sum(cluster["count"] for cluster in clusters) == 2
    assert all(set(c.keys()) == {"lat", "lon", "count"} for c in clusters)


async def test_clusters_cache_serves_within_ttl(client, db_session):
    await authenticate(client, telegram_id=1)
    await create_story(client, db_session, title="cached era")

    first = (await client.get("/api/v1/stories/map-clusters", params=WORLD)).json()
    # a story approved after the cache fills is invisible until the TTL expires —
    # the documented freshness bound of this cache
    await create_story(client, db_session, title="after cache fill")
    second = (await client.get("/api/v1/stories/map-clusters", params=WORLD)).json()
    assert second == first


async def test_clusters_category_filter_uses_distinct_cache_keys(client, db_session):
    await authenticate(client, telegram_id=1)
    await create_story(client, db_session, category_id=1)
    await create_story(client, db_session, category_id=2)

    all_cats = (await client.get("/api/v1/stories/map-clusters", params=WORLD)).json()
    one_cat = (
        await client.get("/api/v1/stories/map-clusters", params={**WORLD, "category_id": 2})
    ).json()
    assert sum(c["count"] for c in all_cats) == 2
    assert sum(c["count"] for c in one_cat) == 1

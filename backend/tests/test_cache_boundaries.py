"""Caching boundaries: nothing private may end up in a shared cache.

The client-side reset stops one account's data outliving a switch in the tab;
these cover the other side of the wire, where a proxy or CDN could hand a stored
response to the next user entirely outside the app's control.
"""

from tests.test_stories_api import authenticate

PRIVATE_ENDPOINTS = (
    "/api/v1/profile/me",
    "/api/v1/auth/identities",
    "/api/v1/auth/sessions",
)


async def test_authenticated_responses_are_never_shared(client):
    await authenticate(client, telegram_id=1)
    for path in PRIVATE_ENDPOINTS:
        response = await client.get(path)
        assert response.status_code == 200, path
        assert "no-store" in response.headers["cache-control"], path
        assert "Authorization" in response.headers.get("vary", ""), path


async def test_authenticated_reads_of_shared_routes_are_not_cacheable(client):
    """a route that is publicly cacheable when anonymous must not stay so once signed in"""
    await authenticate(client, telegram_id=1)
    response = await client.get("/api/v1/stories/trending")
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    assert "Authorization" in response.headers.get("vary", "")


async def test_anonymous_public_reads_stay_cacheable(client):
    response = await client.get("/api/v1/categories")
    assert response.status_code == 200
    assert "public" in response.headers["cache-control"]
    assert "no-store" not in response.headers["cache-control"]


async def test_auth_token_endpoints_are_never_stored(client):
    response = await client.post(
        "/api/v1/auth/telegram", json={"init_data": "obviously-invalid"}
    )
    assert response.status_code == 401
    # the redirect/token endpoints set this themselves; assert it survives
    google = await client.get("/api/v1/auth/google/start", params={"redirect": "/"})
    assert google.headers["cache-control"] == "no-store"


async def test_idempotency_keys_do_not_collide_across_users(client, fake_redis):
    """the private redis namespace includes users.id, so one user's key is not another's"""
    from tests.test_stories_api import story_payload

    await authenticate(client, telegram_id=1)
    first = await client.post(
        "/api/v1/stories", json=story_payload(), headers={"Idempotency-Key": "shared-key"}
    )
    assert first.status_code == 201, first.text

    await authenticate(client, telegram_id=2)
    second = await client.post(
        "/api/v1/stories", json=story_payload(), headers={"Idempotency-Key": "shared-key"}
    )
    # a shared namespace would have replayed the first user's story instead
    assert second.status_code == 201, second.text
    assert second.json()["id"] != first.json()["id"]

    keys = [key.decode() if isinstance(key, bytes) else key for key in await fake_redis.keys("idempotency:*")]
    assert len(keys) == 2
    assert all(":shared-key" in key for key in keys)

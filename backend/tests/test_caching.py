from app.db.repositories import stories as stories_repo
from tests.test_interactions_api import create_story
from tests.test_stories_api import authenticate


async def test_anonymous_trending_uses_shared_cache_and_authenticated_bypasses_it(
    client, db_session, monkeypatch
):
    await authenticate(client, telegram_id=1)
    await create_story(client, db_session, title="cached story")
    client.headers.pop("Authorization")

    original = stories_repo.list_trending
    calls: list[int | None] = []

    async def counted(db, *, viewer_id, limit):
        calls.append(viewer_id)
        return await original(db, viewer_id=viewer_id, limit=limit)

    monkeypatch.setattr(stories_repo, "list_trending", counted)

    first = await client.get("/api/v1/stories/trending")
    second = await client.get("/api/v1/stories/trending")

    assert first.status_code == 200
    assert first.json() == second.json()
    assert calls == [None]
    assert first.headers["cache-control"].startswith("public")
    assert first.headers["vary"] == "Authorization"

    await authenticate(client, telegram_id=2)
    authenticated = await client.get("/api/v1/stories/trending")

    assert authenticated.status_code == 200
    assert authenticated.headers["cache-control"] == "private, no-store"
    assert calls[-1] is not None


async def test_categories_etag_returns_not_modified(client):
    first = await client.get("/api/v1/categories")

    assert first.status_code == 200
    assert first.headers["cache-control"].startswith("public, max-age=86400")
    assert first.headers["etag"].startswith('"')

    not_modified = await client.get(
        "/api/v1/categories",
        headers={"If-None-Match": first.headers["etag"]},
    )

    assert not_modified.status_code == 304
    assert not_modified.content == b""
    assert not_modified.headers["etag"] == first.headers["etag"]

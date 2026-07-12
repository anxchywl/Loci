import math
import uuid

import pytest
from sqlalchemy import func, select, update

from app.core.security.geo import EARTH_RADIUS_M
from app.db.models import Story
from app.db.models.story import ModerationStatus
from tests.factories import build_init_data

ALMATY = (43.238949, 76.889709)


async def approve_story(db_session, story_id: str) -> None:
    """Mark a freshly created (pending) story approved so it becomes publicly
    discoverable — the moderation step every real story now goes through."""
    await db_session.execute(
        update(Story)
        .where(Story.id == uuid.UUID(story_id))
        .values(moderation_status=ModerationStatus.approved)
    )
    await db_session.commit()


async def authenticate(client, telegram_id: int = 500) -> str:
    response = await client.post(
        "/api/v1/auth/telegram", json={"init_data": build_init_data(telegram_id=telegram_id)}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return token


def story_payload(**overrides):
    payload = {
        "category_id": 1,
        "title": "First kiss",
        "body": "It rained the whole evening.",
        "lat": ALMATY[0],
        "lon": ALMATY[1],
        "location_precision": "exact",
    }
    payload.update(overrides)
    return payload


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


async def test_create_story_requires_auth(client):
    response = await client.post("/api/v1/stories", json=story_payload())
    assert response.status_code == 401


async def test_create_exact_story_returns_exact_point(client):
    await authenticate(client)
    response = await client.post("/api/v1/stories", json=story_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["lat"] == pytest.approx(ALMATY[0])
    assert body["lon"] == pytest.approx(ALMATY[1])


async def test_approx_story_never_returns_exact_point(client, db_session):
    await authenticate(client)
    response = await client.post(
        "/api/v1/stories", json=story_payload(location_precision="approx")
    )
    assert response.status_code == 201
    body = response.json()

    distance = haversine_m(ALMATY[0], ALMATY[1], body["lat"], body["lon"])
    assert 250 <= distance <= 750

    await approve_story(db_session, body["id"])
    detail = await client.get(f"/api/v1/stories/{body['id']}")
    assert detail.json()["lat"] == pytest.approx(body["lat"])

    nearby = await client.get(
        "/api/v1/stories/nearby", params={"lat": ALMATY[0], "lon": ALMATY[1], "radius_meters": 5000}
    )
    assert nearby.json()[0]["lat"] == pytest.approx(body["lat"])

    # the exact point is still stored, just never served
    stored = (
        await db_session.execute(
            select(func.ST_Y(Story.location_exact), func.ST_X(Story.location_exact))
        )
    ).one()
    assert stored[0] == pytest.approx(ALMATY[0])
    assert haversine_m(stored[0], stored[1], body["lat"], body["lon"]) >= 250


async def test_anonymous_story_never_exposes_author(client, db_session):
    await authenticate(client)
    created = await client.post("/api/v1/stories", json=story_payload(is_anonymous=True))
    story_id = created.json()["id"]
    assert created.json()["author"] is None

    await approve_story(db_session, story_id)
    detail = await client.get(f"/api/v1/stories/{story_id}")
    assert detail.json()["author"] is None
    assert "author_id" not in detail.text

    trending = await client.get("/api/v1/stories/trending")
    assert trending.json()[0]["author"] is None
    assert "author_id" not in trending.text


async def test_named_story_exposes_author(client):
    await authenticate(client)
    created = await client.post("/api/v1/stories", json=story_payload())
    assert created.json()["author"]["username"] == "loci_mapper"


async def test_private_story_hidden_from_others_and_anonymous_readers(client):
    await authenticate(client, telegram_id=1)
    created = await client.post("/api/v1/stories", json=story_payload(visibility="private"))
    story_id = created.json()["id"]

    owner_view = await client.get(f"/api/v1/stories/{story_id}")
    assert owner_view.status_code == 200

    del client.headers["Authorization"]
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404
    assert (await client.get("/api/v1/stories/trending")).json() == []

    await authenticate(client, telegram_id=2)
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404
    assert (await client.get("/api/v1/stories/trending")).json() == []


async def test_private_story_is_auto_approved_without_review(client):
    await authenticate(client, telegram_id=3)
    private = await client.post("/api/v1/stories", json=story_payload(visibility="private"))
    assert private.status_code == 201
    assert private.json()["moderation_status"] == ModerationStatus.approved.value

    public = await client.post("/api/v1/stories", json=story_payload(visibility="public"))
    assert public.status_code == 201
    assert public.json()["moderation_status"] == ModerationStatus.pending.value


async def test_unknown_category_rejected(client):
    await authenticate(client)
    response = await client.post("/api/v1/stories", json=story_payload(category_id=99))
    assert response.status_code == 400


async def test_title_and_body_limits_enforced(client):
    await authenticate(client)
    assert (await client.post("/api/v1/stories", json=story_payload(title="x" * 121))).status_code == 422
    assert (await client.post("/api/v1/stories", json=story_payload(body="x" * 4001))).status_code == 422
    assert (await client.post("/api/v1/stories", json=story_payload(lat=91))).status_code == 422


async def test_only_author_can_delete_story(client):
    await authenticate(client, telegram_id=1)
    story_id = (await client.post("/api/v1/stories", json=story_payload())).json()["id"]

    await authenticate(client, telegram_id=2)
    assert (await client.delete(f"/api/v1/stories/{story_id}")).status_code == 404

    await authenticate(client, telegram_id=1)
    assert (await client.delete(f"/api/v1/stories/{story_id}")).status_code == 204
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404


async def test_nearby_excludes_out_of_radius_stories(client, db_session):
    await authenticate(client)
    created = await client.post("/api/v1/stories", json=story_payload())
    await approve_story(db_session, created.json()["id"])

    near = await client.get(
        "/api/v1/stories/nearby", params={"lat": ALMATY[0], "lon": ALMATY[1], "radius_meters": 1000}
    )
    assert len(near.json()) == 1

    far = await client.get(
        "/api/v1/stories/nearby", params={"lat": 0.0, "lon": 0.0, "radius_meters": 1000}
    )
    assert far.json() == []


async def test_nearby_wraps_antimeridian(client, db_session):
    await authenticate(client)
    created = await client.post("/api/v1/stories", json=story_payload(lat=-36.5, lon=179.999))
    await approve_story(db_session, created.json()["id"])

    response = await client.get(
        "/api/v1/stories/nearby",
        params={"lat": -36.5, "lon": -179.999, "radius_meters": 1000},
    )
    assert len(response.json()) == 1


async def test_search_matches_title_and_body(client, db_session):
    await authenticate(client)
    created = await client.post(
        "/api/v1/stories", json=story_payload(title="Aurora", body="northern lights")
    )
    await approve_story(db_session, created.json()["id"])

    assert len((await client.get("/api/v1/stories/search", params={"q": "auro"})).json()) == 1
    assert len((await client.get("/api/v1/stories/search", params={"q": "lights"})).json()) == 1
    assert (await client.get("/api/v1/stories/search", params={"q": "zzz"})).json() == []


async def test_search_does_not_leak_private_stories(client):
    await authenticate(client, telegram_id=1)
    await client.post(
        "/api/v1/stories", json=story_payload(title="Secret", visibility="private")
    )
    await authenticate(client, telegram_id=2)
    assert (await client.get("/api/v1/stories/search", params={"q": "Secret"})).json() == []


async def test_categories_endpoint_returns_seeded_twelve(client):
    response = await client.get("/api/v1/categories")
    body = response.json()
    assert len(body) == 12
    assert body[0]["slug"] == "love"
    assert body[0]["color"] == "#E5484D"
    assert body[0]["icon"] == "heart"


async def test_daily_story_limit_enforced(client, monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "story_create_per_day", 2)

    await authenticate(client)
    assert (await client.post("/api/v1/stories", json=story_payload())).status_code == 201
    assert (await client.post("/api/v1/stories", json=story_payload())).status_code == 201
    assert (await client.post("/api/v1/stories", json=story_payload())).status_code == 429

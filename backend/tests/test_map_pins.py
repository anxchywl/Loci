from tests.test_interactions_api import create_story
from tests.test_stories_api import authenticate


async def test_map_pins_returns_slim_discoverable_markers(client, db_session):
    await authenticate(client, telegram_id=1)
    approved = await create_story(client, db_session, title="on the map")
    await create_story(client, title="still pending")
    await create_story(client, db_session, title="private", visibility="private")

    response = await client.get(
        "/api/v1/stories/map",
        params={"min_lat": 42, "min_lon": 76, "max_lat": 44, "max_lon": 78},
    )
    assert response.status_code == 200
    pins = response.json()
    assert [pin["id"] for pin in pins] == [approved]
    # the pin contract carries markers only — no body, author, or counts
    assert set(pins[0].keys()) == {"id", "category_id", "lat", "lon"}


async def test_map_pins_category_filter(client, db_session):
    await authenticate(client, telegram_id=1)
    await create_story(client, db_session, category_id=1)
    other = await create_story(client, db_session, category_id=2)

    response = await client.get(
        "/api/v1/stories/map",
        params={"min_lat": 42, "min_lon": 76, "max_lat": 44, "max_lon": 78, "category_id": 2},
    )
    assert [pin["id"] for pin in response.json()] == [other]


async def test_bbox_across_antimeridian_sees_both_sides(client, db_session):
    await authenticate(client, telegram_id=1)
    west = await create_story(client, db_session, title="fiji side", lat=-17.0, lon=179.5)
    east = await create_story(client, db_session, title="samoa side", lat=-17.0, lon=-179.5)

    # world-wrapped form, as MapLibre getBounds() emits when panning across
    wrapped = await client.get(
        "/api/v1/stories/map",
        params={"min_lat": -20, "min_lon": 179, "max_lat": -15, "max_lon": 181},
    )
    assert {pin["id"] for pin in wrapped.json()} == {west, east}

    # normalized form with min_lon > max_lon
    crossing = await client.get(
        "/api/v1/stories/map",
        params={"min_lat": -20, "min_lon": 179, "max_lat": -15, "max_lon": -179},
    )
    assert {pin["id"] for pin in crossing.json()} == {west, east}

    # a viewport that does not cross must not match either story
    elsewhere = await client.get(
        "/api/v1/stories/map",
        params={"min_lat": -20, "min_lon": 10, "max_lat": -15, "max_lon": 20},
    )
    assert elsewhere.json() == []

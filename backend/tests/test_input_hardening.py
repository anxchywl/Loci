"""Input sanitisation and injection-resistance on user-facing fields."""
from tests.test_stories_api import approve_story, authenticate, story_payload


async def test_title_trimmed_and_spaces_collapsed(client):
    await authenticate(client)
    resp = await client.post(
        "/api/v1/stories",
        json=story_payload(title="   First    kiss   ", body="  ok body  "),
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "First kiss"
    assert resp.json()["body"] == "ok body"


async def test_whitespace_only_title_rejected(client):
    await authenticate(client)
    assert (
        await client.post("/api/v1/stories", json=story_payload(title="     "))
    ).status_code == 422
    assert (
        await client.post("/api/v1/stories", json=story_payload(body="  \n \t "))
    ).status_code == 422


async def test_zero_width_and_control_chars_stripped(client):
    await authenticate(client)
    # zero-width space + bidi override + NUL smuggled into the title
    resp = await client.post(
        "/api/v1/stories",
        json=story_payload(title="a​b‮c\x00d"),
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "abcd"


async def test_body_preserves_paragraphs_but_caps_blank_runs(client):
    await authenticate(client)
    resp = await client.post(
        "/api/v1/stories",
        json=story_payload(body="line one\n\n\n\n\nline two"),
    )
    assert resp.status_code == 201
    assert resp.json()["body"] == "line one\n\nline two"


async def test_comment_is_sanitised(client):
    await authenticate(client, telegram_id=1)
    story_id = (await client.post("/api/v1/stories", json=story_payload())).json()["id"]
    resp = await client.post(
        f"/api/v1/stories/{story_id}/comments", json={"body": "  hi   there  "}
    )
    assert resp.status_code == 201
    assert resp.json()["body"] == "hi there"


async def test_search_ignores_surrounding_and_duplicate_spaces(client, db_session):
    await authenticate(client)
    created = await client.post(
        "/api/v1/stories", json=story_payload(title="Aurora Borealis", body="lights")
    )
    await approve_story(db_session, created.json()["id"])

    # leading/trailing + collapsed internal whitespace still matches
    hit = await client.get(
        "/api/v1/stories/search", params={"q": "  Aurora    Borealis  "}
    )
    assert len(hit.json()) == 1


async def test_search_escapes_like_wildcards(client, db_session):
    await authenticate(client)
    created = await client.post(
        "/api/v1/stories", json=story_payload(title="Aurora", body="lights")
    )
    await approve_story(db_session, created.json()["id"])

    # "%" must be matched literally, not as a wildcard that returns everything
    assert (await client.get("/api/v1/stories/search", params={"q": "%%"})).json() == []
    assert (await client.get("/api/v1/stories/search", params={"q": "a%b"})).json() == []


async def test_search_blank_after_cleaning_returns_empty(client):
    await authenticate(client)
    # two spaces satisfy the min_length=2 query rule but clean down to nothing
    assert (await client.get("/api/v1/stories/search", params={"q": "  "})).json() == []


async def test_sql_injection_in_search_is_inert(client, db_session):
    await authenticate(client)
    created = await client.post(
        "/api/v1/stories", json=story_payload(title="Safe", body="content")
    )
    await approve_story(db_session, created.json()["id"])

    # a classic injection string is treated as a literal search term
    resp = await client.get(
        "/api/v1/stories/search", params={"q": "'; DROP TABLE stories;--"}
    )
    assert resp.status_code == 200
    assert resp.json() == []
    # table still there and queryable
    assert (await client.get("/api/v1/stories/search", params={"q": "Safe"})).json()


async def test_invalid_story_id_rejected(client):
    await authenticate(client)
    assert (await client.get("/api/v1/stories/not-a-uuid")).status_code == 422
    assert (await client.patch("/api/v1/stories/not-a-uuid", json={})).status_code == 422

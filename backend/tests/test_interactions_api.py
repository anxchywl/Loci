from tests.test_stories_api import approve_story, authenticate, story_payload


async def create_story(client, db_session=None, **overrides) -> str:
    response = await client.post("/api/v1/stories", json=story_payload(**overrides))
    assert response.status_code == 201
    story_id = response.json()["id"]
    # approving makes the story readable by other users (reporters, reactors)
    if db_session is not None:
        await approve_story(db_session, story_id)
    return story_id


async def test_reaction_toggle_is_idempotent(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    assert (await client.post(f"/api/v1/stories/{story_id}/reactions")).status_code == 204
    assert (await client.post(f"/api/v1/stories/{story_id}/reactions")).status_code == 204

    detail = (await client.get(f"/api/v1/stories/{story_id}")).json()
    assert detail["reaction_count"] == 1
    assert detail["viewer_reacted"] is True

    assert (await client.delete(f"/api/v1/stories/{story_id}/reactions")).status_code == 204
    detail = (await client.get(f"/api/v1/stories/{story_id}")).json()
    assert detail["reaction_count"] == 0
    assert detail["viewer_reacted"] is False


async def test_reaction_requires_auth(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)
    del client.headers["Authorization"]
    assert (await client.post(f"/api/v1/stories/{story_id}/reactions")).status_code == 401


async def test_cannot_react_to_private_story_of_another_user(client):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, visibility="private")
    await authenticate(client, telegram_id=2)
    assert (await client.post(f"/api/v1/stories/{story_id}/reactions")).status_code == 404


async def test_comment_flow(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    created = await client.post(
        f"/api/v1/stories/{story_id}/comments", json={"body": "I remember this place"}
    )
    assert created.status_code == 201
    comment = created.json()
    assert comment["author"]["username"] == "loci_mapper"

    listed = (await client.get(f"/api/v1/stories/{story_id}/comments")).json()
    assert len(listed) == 1

    detail = (await client.get(f"/api/v1/stories/{story_id}")).json()
    assert detail["comment_count"] == 1


async def test_comment_length_validated(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)
    assert (
        await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": ""})
    ).status_code == 422
    assert (
        await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "x" * 1001})
    ).status_code == 422


async def test_only_comment_author_can_delete(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)
    comment_id = (
        await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "mine"})
    ).json()["id"]

    await authenticate(client, telegram_id=2)
    assert (await client.delete(f"/api/v1/comments/{comment_id}")).status_code == 404

    await authenticate(client, telegram_id=1)
    assert (await client.delete(f"/api/v1/comments/{comment_id}")).status_code == 204


async def test_comments_on_private_story_hidden_from_others(client):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, visibility="private")
    await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "secret"})

    await authenticate(client, telegram_id=2)
    assert (await client.get(f"/api/v1/stories/{story_id}/comments")).status_code == 404


async def test_bookmark_flow_and_profile_listing(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    assert (await client.post(f"/api/v1/stories/{story_id}/bookmark")).status_code == 204
    assert (await client.get(f"/api/v1/stories/{story_id}")).json()["viewer_bookmarked"] is True

    bookmarks = (await client.get("/api/v1/profile/me/bookmarks")).json()
    assert len(bookmarks) == 1

    assert (await client.delete(f"/api/v1/stories/{story_id}/bookmark")).status_code == 204
    assert (await client.get("/api/v1/profile/me/bookmarks")).json() == []


async def test_profile_me_lists_own_anonymous_stories(client):
    await authenticate(client, telegram_id=1)
    await create_story(client, is_anonymous=True)

    mine = (await client.get("/api/v1/profile/me/stories")).json()
    assert len(mine) == 1
    assert mine[0]["is_anonymous"] is True
    assert mine[0]["author"] is None


async def test_story_auto_hides_after_threshold_distinct_reporters(client, db_session, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "report_auto_hide_threshold", 3)

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    for reporter in (2, 3):
        await authenticate(client, telegram_id=reporter)
        assert (
            await client.post(f"/api/v1/stories/{story_id}/report", json={"reason": "spam"})
        ).status_code == 204
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 200

    await authenticate(client, telegram_id=4)
    assert (
        await client.post(f"/api/v1/stories/{story_id}/report", json={"reason": "spam"})
    ).status_code == 204

    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404
    await authenticate(client, telegram_id=1)
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404


async def test_duplicate_reports_by_same_user_do_not_stack(client, db_session, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "report_auto_hide_threshold", 2)

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    await authenticate(client, telegram_id=2)
    for _ in range(3):
        assert (
            await client.post(f"/api/v1/stories/{story_id}/report", json={"reason": "spam"})
        ).status_code == 204

    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 200


async def test_author_self_reports_do_not_count_toward_auto_hide(client, db_session, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "report_auto_hide_threshold", 1)

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)
    assert (
        await client.post(f"/api/v1/stories/{story_id}/report", json={"reason": "oops"})
    ).status_code == 204
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 200

    await authenticate(client, telegram_id=2)
    assert (
        await client.post(f"/api/v1/stories/{story_id}/report", json={"reason": "spam"})
    ).status_code == 204
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404


async def test_comment_auto_hides_after_threshold(client, db_session, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "report_auto_hide_threshold", 2)

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)
    comment_id = (
        await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "abuse"})
    ).json()["id"]

    for reporter in (2, 3):
        await authenticate(client, telegram_id=reporter)
        assert (
            await client.post(f"/api/v1/comments/{comment_id}/report", json={"reason": "abuse"})
        ).status_code == 204

    assert (await client.get(f"/api/v1/stories/{story_id}/comments")).json() == []
    assert (await client.get(f"/api/v1/stories/{story_id}")).json()["comment_count"] == 0


async def test_comment_rate_limit_returns_429(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "comments_per_minute", 2)

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    for _ in range(2):
        assert (
            await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "hi"})
        ).status_code == 201

    limited = await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "hi"})
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "60"


async def test_reaction_rate_limit_returns_429(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "reactions_per_minute", 2)

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    for _ in range(2):
        assert (await client.post(f"/api/v1/stories/{story_id}/reactions")).status_code == 204
    assert (await client.post(f"/api/v1/stories/{story_id}/reactions")).status_code == 429

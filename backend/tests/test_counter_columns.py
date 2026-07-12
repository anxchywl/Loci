from sqlalchemy import text

from tests.test_interactions_api import create_story
from tests.test_stories_api import authenticate


async def _counts(db_session, story_id: str) -> tuple[int, int]:
    row = (
        await db_session.execute(
            text("SELECT reaction_count, comment_count FROM stories WHERE id = :id"),
            {"id": story_id},
        )
    ).one()
    return row[0], row[1]


async def test_reaction_counter_tracks_toggle(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    await client.post(f"/api/v1/stories/{story_id}/reactions")
    await client.post(f"/api/v1/stories/{story_id}/reactions")
    assert (await _counts(db_session, story_id))[0] == 1

    await client.delete(f"/api/v1/stories/{story_id}/reactions")
    await client.delete(f"/api/v1/stories/{story_id}/reactions")
    assert (await _counts(db_session, story_id))[0] == 0


async def test_comment_counter_tracks_create_hide_delete(client, db_session):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client, db_session)

    first = (
        await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "one"})
    ).json()
    await client.post(f"/api/v1/stories/{story_id}/comments", json={"body": "two"})
    assert (await _counts(db_session, story_id))[1] == 2

    # hiding a comment removes it from the visible count exactly once
    from app.db.repositories import comments as comments_repo
    import uuid

    await comments_repo.set_hidden(db_session, uuid.UUID(first["id"]), True)
    await comments_repo.set_hidden(db_session, uuid.UUID(first["id"]), True)
    await db_session.commit()
    assert (await _counts(db_session, story_id))[1] == 1

    # deleting an already-hidden comment must not decrement again
    comment = await comments_repo.get(db_session, uuid.UUID(first["id"]))
    await comments_repo.delete(db_session, comment)
    await db_session.commit()
    assert (await _counts(db_session, story_id))[1] == 1


async def test_trending_orders_by_engagement(client, db_session):
    await authenticate(client, telegram_id=1)
    quiet = await create_story(client, db_session, title="quiet story")
    busy = await create_story(client, db_session, title="busy story")

    await client.post(f"/api/v1/stories/{busy}/reactions")
    await client.post(f"/api/v1/stories/{busy}/comments", json={"body": "hot"})

    trending = (await client.get("/api/v1/stories/trending")).json()
    ids = [story["id"] for story in trending]
    assert ids.index(busy) < ids.index(quiet)
    top = next(story for story in trending if story["id"] == busy)
    assert top["reaction_count"] == 1
    assert top["comment_count"] == 1

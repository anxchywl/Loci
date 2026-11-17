"""Submission pipeline guarantees: what reaches the admin queue, and when."""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.db.models import MediaDeletionJob, PhotoStatus, StoryPhoto
from app.integrations import storage
from tests.test_moderation_api import ADMIN_TG, create_pending
from tests.test_stories_api import authenticate, story_payload


async def _queue_ids(client) -> list[str]:
    await authenticate(client, telegram_id=ADMIN_TG)
    queue = (await client.get("/api/v1/admin/moderation/queue")).json()
    return [item["id"] for item in queue["items"]]


async def _approve(client, story_id: str) -> None:
    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.post(f"/api/v1/admin/moderation/{story_id}/approve")
    assert resp.status_code == 204


async def _start_photo(client, story_id: str) -> str:
    resp = await client.post(
        f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
    )
    assert resp.status_code == 201
    return resp.json()["photo_id"]


def _stub_upload(monkeypatch) -> None:
    from app.workers.tasks import optimize_photo

    monkeypatch.setattr(storage, "get_object_size", lambda key: 1024)
    monkeypatch.setattr(optimize_photo, "delay", lambda photo_id: None)


async def test_editing_private_story_never_enters_admin_queue(client):
    await authenticate(client, telegram_id=1)
    created = await client.post("/api/v1/stories", json=story_payload(visibility="private"))
    story_id = created.json()["id"]
    assert created.json()["moderation_status"] == "approved"

    resp = await client.patch(f"/api/v1/stories/{story_id}", json={"title": "Still mine"})
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "approved"

    assert await _queue_ids(client) == []


async def test_private_pending_story_is_hidden_from_admin_queue(client, db_session):
    from app.db.models import Story
    from app.db.models.story import ModerationStatus

    await authenticate(client, telegram_id=1)
    created = await client.post("/api/v1/stories", json=story_payload(visibility="private"))
    # a legacy row left pending by the old edit path must still stay out of the queue
    await db_session.execute(
        update(Story)
        .where(Story.id == uuid.UUID(created.json()["id"]))
        .values(moderation_status=ModerationStatus.pending)
    )
    await db_session.commit()

    assert await _queue_ids(client) == []


async def test_making_story_private_skips_review_and_public_requeues(client):
    story_id = await create_pending(client, telegram_id=1)

    resp = await client.patch(f"/api/v1/stories/{story_id}", json={"visibility": "private"})
    assert resp.json()["moderation_status"] == "approved"
    assert await _queue_ids(client) == []

    await authenticate(client, telegram_id=1)
    resp = await client.patch(f"/api/v1/stories/{story_id}", json={"visibility": "public"})
    assert resp.json()["moderation_status"] == "pending"
    assert await _queue_ids(client) == [story_id]


async def test_photo_added_after_approval_sends_story_back_to_review(
    client, db_session, monkeypatch
):
    _stub_upload(monkeypatch)
    story_id = await create_pending(client, telegram_id=1, body="findme photo")
    await _approve(client, story_id)

    await authenticate(client, telegram_id=1)
    photo_id = await _start_photo(client, story_id)
    resp = await client.post(f"/api/v1/stories/{story_id}/photos/{photo_id}/complete")
    assert resp.status_code == 202

    mine = (await client.get("/api/v1/profile/me/stories")).json()
    assert mine[0]["moderation_status"] == "pending"

    # off every public surface until an admin has seen the new photo
    await authenticate(client, telegram_id=2)
    assert (await client.get("/api/v1/stories/search", params={"q": "findme"})).json() == []
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404


async def test_photo_on_pending_or_private_story_does_not_change_status(client, monkeypatch):
    _stub_upload(monkeypatch)
    pending_id = await create_pending(client, telegram_id=1)
    photo_id = await _start_photo(client, pending_id)
    await client.post(f"/api/v1/stories/{pending_id}/photos/{photo_id}/complete")

    private = await client.post("/api/v1/stories", json=story_payload(visibility="private"))
    private_id = private.json()["id"]
    photo_id = await _start_photo(client, private_id)
    await client.post(f"/api/v1/stories/{private_id}/photos/{photo_id}/complete")

    statuses = {
        story["id"]: story["moderation_status"]
        for story in (await client.get("/api/v1/profile/me/stories")).json()
    }
    assert statuses == {pending_id: "pending", private_id: "approved"}


async def test_queue_holds_story_back_while_photos_upload(client, db_session):
    story_id = await create_pending(client, telegram_id=1)
    photo_id = uuid.UUID(await _start_photo(client, story_id))

    assert await _queue_ids(client) == []

    await db_session.execute(
        update(StoryPhoto).where(StoryPhoto.id == photo_id).values(status=PhotoStatus.ready)
    )
    await db_session.commit()
    assert await _queue_ids(client) == [story_id]


async def test_abandoned_upload_does_not_hide_story_from_queue_forever(client, db_session):
    story_id = await create_pending(client, telegram_id=1)
    photo_id = uuid.UUID(await _start_photo(client, story_id))
    await db_session.execute(
        update(StoryPhoto)
        .where(StoryPhoto.id == photo_id)
        .values(created_at=datetime.now(UTC) - timedelta(minutes=16))
    )
    await db_session.commit()

    assert await _queue_ids(client) == [story_id]


async def test_admin_ping_waits_for_uploads_then_sends(client, db_session):
    from app.workers.tasks import pending_review_message

    story_id = uuid.UUID(await create_pending(client, telegram_id=1, title="Wow"))
    photo_id = uuid.UUID(await _start_photo(client, str(story_id)))
    now = datetime.now(UTC)

    assert await pending_review_message(db_session, story_id, now) == ("wait", None)

    await db_session.execute(
        update(StoryPhoto).where(StoryPhoto.id == photo_id).values(status=PhotoStatus.ready)
    )
    await db_session.commit()
    outcome, text = await pending_review_message(db_session, story_id, now)
    assert outcome == "send"
    assert "“Wow”" in text and "pending review" in text.lower()


async def test_admin_ping_skipped_once_story_is_moderated(client, db_session):
    from app.workers.tasks import pending_review_message

    story_id = await create_pending(client, telegram_id=1)
    await _approve(client, story_id)
    db_session.expire_all()

    outcome, _ = await pending_review_message(db_session, uuid.UUID(story_id), datetime.now(UTC))
    assert outcome == "skip"


async def test_admin_ping_never_names_an_anonymous_author(client, db_session):
    from app.workers.tasks import pending_review_message

    story_id = await create_pending(client, telegram_id=1, is_anonymous=True)

    outcome, text = await pending_review_message(
        db_session, uuid.UUID(story_id), datetime.now(UTC)
    )
    assert outcome == "send"
    assert "an anonymous author" in text
    assert "Test" not in text


async def test_edit_pings_admins_only_when_story_enters_review(client, monkeypatch):
    from app.core.config import get_settings
    from app.modules import notifications

    pinged: list[str] = []
    monkeypatch.setattr(get_settings(), "notifications_enabled", True)
    monkeypatch.setattr(notifications, "_enqueue", lambda tid, text: None)
    monkeypatch.setattr(notifications, "_enqueue_pending_review", pinged.append)

    story_id = await create_pending(client, telegram_id=1)
    assert pinged == [story_id]

    # editing a story that is already queued must not ping again
    await client.patch(f"/api/v1/stories/{story_id}", json={"title": "Second draft"})
    assert pinged == [story_id]

    await _approve(client, story_id)
    await authenticate(client, telegram_id=1)
    await client.patch(f"/api/v1/stories/{story_id}", json={"title": "Third draft"})
    assert pinged == [story_id, story_id]


async def _story_with_ready_photo(client, db_session) -> tuple[str, StoryPhoto]:
    from app.db.repositories import photos as photos_repo

    story_id = await create_pending(client, telegram_id=1)
    photo_id = uuid.UUID(await _start_photo(client, story_id))
    base = f"stories/{story_id}/{photo_id}"
    await photos_repo.mark_ready(
        db_session,
        photo_id,
        object_key=f"{base}/full.webp",
        thumb_key=f"{base}/thumb.webp",
        width=10,
        height=10,
        content_type="image/webp",
    )
    await db_session.commit()
    return story_id, await photos_repo.get(db_session, photo_id)


async def _queued_keys(db_session) -> set[str]:
    return set((await db_session.execute(select(MediaDeletionJob.object_key))).scalars())


async def test_admin_story_delete_queues_photo_objects_for_deletion(client, db_session):
    story_id, photo = await _story_with_ready_photo(client, db_session)

    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.request(
        "DELETE", f"/api/v1/admin/stories/{story_id}", json={"reason": "spam"}
    )
    assert resp.status_code == 204

    assert {photo.object_key, photo.thumb_key} <= await _queued_keys(db_session)


async def test_reported_story_delete_queues_photo_objects_for_deletion(client, db_session):
    story_id, photo = await _story_with_ready_photo(client, db_session)

    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.post(
        f"/api/v1/admin/reports/{story_id}/resolve", json={"action": "delete", "reason": "spam"}
    )
    assert resp.status_code == 204

    assert {photo.object_key, photo.thumb_key} <= await _queued_keys(db_session)

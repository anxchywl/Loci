from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from app.db.models import (
    AuditLog,
    AuthIdentity,
    Comment,
    MediaDeletionJob,
    Reaction,
    RefreshToken,
    SecurityAuditEvent,
    Story,
    StoryPhoto,
    User,
    UserModerationLog,
)
from tests.test_interactions_api import create_story
from tests.test_stories_api import authenticate

ERASURE_URL = "/api/v1/auth/account"
CONFIRMATION = {"confirmation": "DELETE MY ACCOUNT"}


async def test_account_erasure_requires_exact_phrase(client):
    await authenticate(client, telegram_id=1)

    response = await client.request(
        "DELETE", ERASURE_URL, json={"confirmation": "delete my account"}
    )

    assert response.status_code == 422


async def test_account_erasure_requires_recent_auth(client, db_session):
    await authenticate(client, telegram_id=1)
    await db_session.execute(
        update(RefreshToken).values(
            authenticated_at=datetime.now(UTC) - timedelta(hours=2)
        )
    )
    await db_session.commit()

    response = await client.request("DELETE", ERASURE_URL, json=CONFIRMATION)

    assert response.status_code == 403


async def test_account_erasure_removes_personal_data_and_preserves_audit(
    client, db_session, fake_redis, monkeypatch
):
    from app.workers.tasks import cleanup_deleted_media

    dispatched: list[bool] = []
    monkeypatch.setattr(cleanup_deleted_media, "delay", lambda: dispatched.append(True))

    await authenticate(client, telegram_id=1)
    user_id = (await client.get("/api/v1/profile/me")).json()["id"]
    own_story_id = await create_story(client, db_session)
    db_session.add(
        StoryPhoto(
            story_id=own_story_id,
            object_key=f"stories/{own_story_id}/photo/full.webp",
            thumb_key=f"stories/{own_story_id}/photo/thumb.webp",
            content_type="image/webp",
            status="ready",
        )
    )

    admin = User(telegram_id=9001, first_name="Moderator", is_admin=True)
    db_session.add(admin)
    await db_session.flush()
    db_session.add(
        UserModerationLog(
            user_id=user_id,
            admin_id=admin.id,
            action="warning",
            reason="policy violation",
        )
    )
    db_session.add(
        AuditLog(
            admin_id=admin.id,
            target_user_id=user_id,
            action="warned_user",
            reason="policy violation",
        )
    )
    db_session.add(
        SecurityAuditEvent(user_id=user_id, event_type="identity_linked")
    )
    await db_session.commit()

    await authenticate(client, telegram_id=2)
    other_story_id = await create_story(client, db_session)
    await authenticate(client, telegram_id=1)
    await client.post(
        f"/api/v1/stories/{other_story_id}/comments", json={"body": "remembered"}
    )
    await client.post(f"/api/v1/stories/{other_story_id}/reactions")
    await client.post(f"/api/v1/stories/{other_story_id}/bookmark")
    await client.post(
        f"/api/v1/stories/{other_story_id}/report", json={"reason": "spam"}
    )

    response = await client.request("DELETE", ERASURE_URL, json=CONFIRMATION)

    assert response.status_code == 204
    assert dispatched == [True]
    assert "refresh_token=" in response.headers["set-cookie"]
    assert (await client.get("/api/v1/profile/me")).status_code == 401

    db_session.expire_all()
    user = await db_session.get(User, user_id)
    assert user is not None
    assert user.erased_at is not None
    assert user.deleted_at is not None
    assert user.telegram_id is None
    assert user.username is None
    assert user.first_name is None
    assert user.last_name is None
    assert user.photo_url is None
    assert user.language_code is None
    assert user.is_admin is False

    assert await db_session.get(Story, own_story_id) is None
    remaining_story = await db_session.get(Story, other_story_id)
    assert remaining_story is not None
    assert remaining_story.comment_count == 0
    assert remaining_story.reaction_count == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(Comment).where(Comment.author_id == user_id)
        )
    ).scalar_one() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(Reaction).where(Reaction.user_id == user_id)
        )
    ).scalar_one() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(AuthIdentity).where(AuthIdentity.user_id == user_id)
        )
    ).scalar_one() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == user_id)
        )
    ).scalar_one() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(SecurityAuditEvent).where(
                SecurityAuditEvent.user_id == user_id
            )
        )
    ).scalar_one() == 0

    jobs = list((await db_session.execute(select(MediaDeletionJob))).scalars())
    assert {job.object_key for job in jobs} == {
        f"stories/{own_story_id}/photo/full.webp",
        f"stories/{own_story_id}/photo/thumb.webp",
        f"stories/{own_story_id}/photo/original.jpg",
        f"stories/{own_story_id}/photo/original.png",
        f"stories/{own_story_id}/photo/original.webp",
        f"stories/{own_story_id}/photo/original.heic",
    }
    assert (
        await db_session.execute(
            select(func.count()).select_from(UserModerationLog).where(
                UserModerationLog.user_id == user_id
            )
        )
    ).scalar_one() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(AuditLog).where(
                AuditLog.target_user_id == user_id
            )
        )
    ).scalar_one() == 1


async def test_self_erased_account_cannot_be_restored(client, db_session):
    await authenticate(client, telegram_id=1)
    user_id = (await client.get("/api/v1/profile/me")).json()["id"]
    user = await db_session.get(User, user_id)
    assert user is not None
    now = datetime.now(UTC)
    user.deleted_at = now
    user.erased_at = now

    admin = User(telegram_id=999, is_admin=True)
    db_session.add(admin)
    await db_session.commit()
    await authenticate(client, telegram_id=999)

    response = await client.post(
        f"/api/v1/admin/users/{user_id}/restore", json={"reason": "requested"}
    )

    assert response.status_code == 409


async def test_deleted_media_worker_removes_object_and_job(db_session, monkeypatch):
    from app.integrations import storage
    from app.workers.tasks import _cleanup_deleted_media

    db_session.add(MediaDeletionJob(object_key="stories/deleted/full.webp"))
    await db_session.commit()
    removed: list[str] = []
    invalidated: list[str] = []
    monkeypatch.setattr(storage, "delete_object", removed.append)

    async def invalidate(key: str) -> None:
        invalidated.append(key)

    monkeypatch.setattr(storage, "invalidate_presigned_get_url", invalidate)

    assert await _cleanup_deleted_media() == 1
    db_session.expire_all()
    assert list((await db_session.execute(select(MediaDeletionJob))).scalars()) == []
    assert removed == ["stories/deleted/full.webp"]
    assert invalidated == ["stories/deleted/full.webp"]


async def test_deleted_media_worker_retries_storage_failure(db_session, monkeypatch):
    from app.integrations import storage
    from app.workers.tasks import _cleanup_deleted_media

    db_session.add(MediaDeletionJob(object_key="stories/deleted/retry.webp"))
    await db_session.commit()

    def fail(_key: str) -> None:
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(storage, "delete_object", fail)

    assert await _cleanup_deleted_media() == 0
    db_session.expire_all()
    job = (await db_session.execute(select(MediaDeletionJob))).scalar_one()
    assert job.attempts == 1
    assert job.last_error == "RuntimeError"
    assert job.next_attempt_at > datetime.now(UTC)

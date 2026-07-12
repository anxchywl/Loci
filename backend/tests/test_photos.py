import uuid
from datetime import UTC, datetime, timedelta
from io import BytesIO

import httpx
import pytest
from PIL import Image
from sqlalchemy import update

from app.core.config import get_settings
from app.db.models import PhotoStatus, StoryPhoto
from app.integrations import storage
from app.modules.stories.image_validation import InvalidImageError, decode_image
from tests.test_stories_api import authenticate, story_payload


def _minio_reachable() -> bool:
    try:
        storage.ensure_bucket(get_settings().s3_media_bucket)
        return storage.get_client().bucket_exists(get_settings().s3_media_bucket)
    except Exception:
        return False


needs_minio = pytest.mark.skipif(not _minio_reachable(), reason="minio not running")


def test_uploaded_image_validation_rejects_corrupt_and_spoofed_bytes():
    valid = BytesIO()
    Image.new("RGB", (16, 16), color=(20, 30, 40)).save(valid, format="JPEG")
    decode_image(valid.getvalue(), "image/jpeg").close()

    with pytest.raises(InvalidImageError):
        decode_image(b"not an image", "image/jpeg")

    with pytest.raises(InvalidImageError):
        decode_image(valid.getvalue(), "image/png")


async def create_story(client) -> str:
    response = await client.post("/api/v1/stories", json=story_payload())
    return response.json()["id"]


async def test_upload_url_requires_story_ownership(client):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)

    await authenticate(client, telegram_id=2)
    response = await client.post(
        f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
    )
    assert response.status_code == 404


async def test_upload_rejects_unsupported_content_type(client):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    response = await client.post(
        f"/api/v1/stories/{story_id}/photos", json={"content_type": "application/pdf"}
    )
    assert response.status_code == 422


async def test_proxy_upload_stream_rejects_oversize_without_consuming_photo_slot(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(get_settings(), "max_photos_per_story", 1)
    monkeypatch.setattr(get_settings(), "max_upload_size_mb", 0)
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    first = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
        )
    ).json()

    rejected = await client.put(
        f"/api/v1/stories/{story_id}/photos/{first['photo_id']}/upload",
        content=b"oversized",
    )

    assert rejected.status_code == 400
    failed = await db_session.get(StoryPhoto, uuid.UUID(first["photo_id"]))
    assert failed is not None and failed.status == PhotoStatus.failed
    replacement = await client.post(
        f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
    )
    assert replacement.status_code == 201


async def test_stale_upload_cleanup_selection_excludes_ready_photos(client, db_session):
    from app.db.repositories import photos as photos_repo

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    pending = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
        )
    ).json()
    ready = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/png"}
        )
    ).json()
    old = datetime.now(UTC) - timedelta(hours=25)
    await db_session.execute(
        update(StoryPhoto)
        .where(StoryPhoto.id.in_((uuid.UUID(pending["photo_id"]), uuid.UUID(ready["photo_id"]))))
        .values(created_at=old)
    )
    await db_session.execute(
        update(StoryPhoto)
        .where(StoryPhoto.id == uuid.UUID(ready["photo_id"]))
        .values(status=PhotoStatus.ready)
    )
    await db_session.commit()

    selected = await photos_repo.list_stale_uploads_for_update(
        db_session, datetime.now(UTC) - timedelta(hours=24), 100
    )

    assert [photo.id for photo in selected] == [uuid.UUID(pending["photo_id"])]


@needs_minio
async def test_presigned_url_is_scoped_and_expiring(client):
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)

    response = await client.post(
        f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
    )
    assert response.status_code == 201
    body = response.json()

    assert body["expires_in"] == get_settings().s3_presigned_url_expires_seconds
    assert f"stories/{story_id}/{body['photo_id']}/original.jpg" in body["upload_url"]
    assert "X-Amz-Expires" in body["upload_url"]
    assert f"X-Amz-Expires={body['expires_in']}" in body["upload_url"]


@needs_minio
async def test_photo_limit_enforced(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_photos_per_story", 2)
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)

    for _ in range(2):
        assert (
            await client.post(
                f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
            )
        ).status_code == 201

    limited = await client.post(
        f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
    )
    assert limited.status_code == 400


@needs_minio
async def test_complete_rejects_oversized_upload(client, db_session, monkeypatch):
    from app.db.repositories import photos as photos_repo

    monkeypatch.setattr(get_settings(), "max_upload_size_mb", 0)
    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    created = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
        )
    ).json()

    assert httpx.put(created["upload_url"], content=b"oversized").status_code == 200
    response = await client.post(
        f"/api/v1/stories/{story_id}/photos/{created['photo_id']}/complete"
    )

    assert response.status_code == 400
    photo = await photos_repo.get(db_session, uuid.UUID(created["photo_id"]))
    assert photo.status.value == "failed"
    assert storage.get_object_size(photo.object_key) is None


@needs_minio
async def test_complete_queues_without_decoding_in_api(client, monkeypatch):
    from app.workers.tasks import optimize_photo

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    created = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
        )
    ).json()
    assert httpx.put(created["upload_url"], content=b"worker-validates-this").status_code == 200
    queued: list[str] = []
    monkeypatch.setattr(optimize_photo, "delay", queued.append)
    monkeypatch.setattr(
        storage,
        "get_object_bytes",
        lambda key: pytest.fail("api must not download or decode photo bytes"),
    )

    response = await client.post(
        f"/api/v1/stories/{story_id}/photos/{created['photo_id']}/complete"
    )

    assert response.status_code == 202
    assert queued == [created["photo_id"]]


@needs_minio
async def test_optimize_photo_converts_to_webp_and_marks_ready(client, db_session):
    from app.db.repositories import photos as photos_repo
    from app.workers.tasks import _optimize

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)

    created = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/jpeg"}
        )
    ).json()
    photo_id = uuid.UUID(created["photo_id"])

    source = Image.new("RGB", (3000, 1500), color=(120, 40, 40))
    buffer = BytesIO()
    source.save(buffer, format="JPEG")
    upload = httpx.put(
        created["upload_url"],
        content=buffer.getvalue(),
        headers={"Content-Type": "image/jpeg"},
    )
    assert upload.status_code == 200

    await _optimize(photo_id)

    db_session.expire_all()
    photo = await photos_repo.get(db_session, photo_id)
    assert photo.status.value == "ready"
    assert photo.object_key.endswith("full.webp")
    assert photo.thumb_key.endswith("thumb.webp")
    assert photo.content_type == "image/webp"
    assert photo.width == 2048
    assert photo.height == 1024

    optimized = Image.open(BytesIO(storage.get_object_bytes(photo.object_key)))
    assert optimized.format == "WEBP"

    # the original bytes are removed once the webp pair exists
    with pytest.raises(Exception):
        storage.get_object_bytes(f"stories/{story_id}/{photo_id}/original.jpg")

    detail = (await client.get(f"/api/v1/stories/{story_id}")).json()
    assert len(detail["photos"]) == 1
    assert detail["photos"][0]["width"] == 2048
    assert detail["photos"][0]["thumb_url"]


@needs_minio
async def test_optimize_photo_accepts_heic(client, db_session):
    from pillow_heif import from_pillow

    from app.db.repositories import photos as photos_repo
    from app.workers.tasks import _optimize

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    created = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/heic"}
        )
    ).json()
    photo_id = uuid.UUID(created["photo_id"])

    source = Image.new("RGB", (640, 480), color=(40, 120, 40))
    buffer = BytesIO()
    from_pillow(source).save(buffer)
    assert httpx.put(created["upload_url"], content=buffer.getvalue()).status_code == 200

    await _optimize(photo_id)

    db_session.expire_all()
    photo = await photos_repo.get(db_session, photo_id)
    assert photo.status.value == "ready"
    assert photo.content_type == "image/webp"
    assert photo.width == 640
    assert photo.height == 480


@needs_minio
async def test_optimize_marks_failed_on_corrupt_bytes(client, db_session):
    from app.db.repositories import photos as photos_repo
    from app.workers.tasks import _optimize

    await authenticate(client, telegram_id=1)
    story_id = await create_story(client)
    created = (
        await client.post(
            f"/api/v1/stories/{story_id}/photos", json={"content_type": "image/png"}
        )
    ).json()
    photo_id = uuid.UUID(created["photo_id"])

    httpx.put(created["upload_url"], content=b"not-an-image")

    await _optimize(photo_id)

    db_session.expire_all()
    photo = await photos_repo.get(db_session, photo_id)
    assert photo.status.value == "failed"

    # failed photos never surface on the story
    detail = (await client.get(f"/api/v1/stories/{story_id}")).json()
    assert detail["photos"] == []

"""Admin-only moderation workflow: review queue + approve/reject transitions.

Every state change is a single atomic UPDATE guarded on the current status, so
two admins acting on the same story at once can never both "win" — the second
gets a 409 rather than double-moderating or racing.
"""
import base64
import binascii
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models.story import ModerationStatus
from app.db.repositories import photos as photos_repo
from app.db.repositories import stories as stories_repo
from app.db.repositories import users as users_repo
from app.integrations import storage
from app.modules import notifications
from app.modules.stories.schemas import (
    AuthorResponse,
    ModerationQueueItem,
    ModerationQueueResponse,
    PhotoResponse,
)


def _encode_cursor(created_at: datetime, story_id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}|{story_id}".encode()
    return base64.urlsafe_b64encode(raw).decode()


def _decode_cursor(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        created_str, id_str = raw.split("|", 1)
        return datetime.fromisoformat(created_str), uuid.UUID(id_str)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination cursor"
        ) from exc


def _queue_author(row) -> AuthorResponse | None:
    # anonymity does not hide the author from an admin — moderation needs to know
    # who submitted, so the real author is always shown in the queue.
    if row["author_id"] is None:
        return None
    return AuthorResponse(
        id=row["author_id"],
        username=row["author_username"],
        first_name=row["author_first_name"],
        photo_url=row["author_photo_url"],
    )


async def list_queue(
    db: AsyncSession,
    settings: Settings,
    *,
    status_filter: ModerationStatus,
    limit: int,
    cursor: str | None,
) -> ModerationQueueResponse:
    after = _decode_cursor(cursor)
    # fetch one extra row to know whether a next page exists
    rows = await stories_repo.list_for_moderation(
        db, status=status_filter, limit=limit + 1, after=after
    )
    has_more = len(rows) > limit
    rows = rows[:limit]

    photos_by_story = await photos_repo.list_for_stories(db, [row["id"] for row in rows])
    ttl = settings.s3_presigned_url_expires_seconds

    items = [
        ModerationQueueItem(
            id=row["id"],
            category_id=row["category_id"],
            title=row["title"],
            body=row["body"],
            happened_on=row["happened_on"],
            lat=row["lat"],
            lon=row["lon"],
            location_precision=row["location_precision"],
            visibility=row["visibility"],
            is_anonymous=row["is_anonymous"],
            moderation_status=row["moderation_status"],
            created_at=row["created_at"],
            author=_queue_author(row),
            photos=[
                PhotoResponse(
                    id=photo.id,
                    url=storage.presigned_get_url(photo.object_key, ttl),
                    thumb_url=storage.presigned_get_url(photo.thumb_key, ttl)
                    if photo.thumb_key
                    else None,
                    width=photo.width,
                    height=photo.height,
                )
                for photo in photos_by_story.get(row["id"], [])
            ],
        )
        for row in rows
    ]

    next_cursor = _encode_cursor(rows[-1]["created_at"], rows[-1]["id"]) if has_more and rows else None
    return ModerationQueueResponse(items=items, next_cursor=next_cursor)


async def _notify_author(db: AsyncSession, story_id: uuid.UUID, settings, event, reason=None) -> None:
    story = await stories_repo.get_owned_any(db, story_id)
    if story is None or story.author_id is None:
        return
    author = await users_repo.get_by_id(db, story.author_id)
    notifications.dispatch(
        settings,
        event=event,
        telegram_id=author.telegram_id if author else None,
        title=story.title,
        reason=reason,
    )


async def approve(
    db: AsyncSession, story_id: uuid.UUID, admin_id: int, settings: Settings
) -> None:
    ok = await stories_repo.approve(db, story_id, admin_id)
    if not ok:
        raise _already_moderated()
    await db.commit()
    await _notify_author(db, story_id, settings, notifications.StoryEvent.approved)


async def reject(
    db: AsyncSession, story_id: uuid.UUID, admin_id: int, reason: str, settings: Settings
) -> None:
    ok = await stories_repo.reject(db, story_id, admin_id, reason)
    if not ok:
        raise _already_moderated()
    await db.commit()
    await _notify_author(
        db, story_id, settings, notifications.StoryEvent.rejected, reason=reason
    )


def _already_moderated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Story is not pending review (already moderated, or does not exist)",
    )

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security.geo import fuzz_story_location
from app.db.models.story import LocationPrecision, ModerationStatus, StoryVisibility
from app.db.repositories import categories as categories_repo
from app.db.repositories import comments as comments_repo
from app.db.repositories import photos as photos_repo
from app.db.repositories import stories as stories_repo
from app.db.repositories import users as users_repo
from app.integrations import storage
from app.modules import notifications
from app.modules.stories.schemas import (
    AuthorResponse,
    CommentResponse,
    PhotoResponse,
    StoryCreateRequest,
    StoryResponse,
    StoryUpdateRequest,
)


class StoryNotFound(HTTPException):
    def __init__(self) -> None:
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")


def _author_label(user) -> str:
    # human-readable handle for admin notifications (admins may moderate anonymous
    # stories, so the real author is intentionally shown to them here)
    if user is None:
        return "a user"
    if user.username:
        return f"@{user.username}"
    return user.first_name or f"user #{user.id}"


def _author_from_row(row) -> AuthorResponse | None:
    # anonymous stories must never expose the author id in any response path
    if row["is_anonymous"] or row["author_id"] is None:
        return None
    return AuthorResponse(
        id=row["author_id"],
        username=row["author_username"],
        first_name=row["author_first_name"],
        photo_url=row["author_photo_url"],
    )


def serialize_story(
    row, photos: list[PhotoResponse] | None = None, viewer_id: int | None = None
) -> StoryResponse:
    # the rejection reason is private moderation feedback — only ever shown to the
    # story's own author (My Stories), never leaked on public read paths.
    is_owner = viewer_id is not None and row["author_id"] == viewer_id
    return StoryResponse(
        id=row["id"],
        share_token=row["share_token"],
        category_id=row["category_id"],
        title=row["title"],
        body=row["body"],
        happened_on=row["happened_on"],
        lat=row["lat"],
        lon=row["lon"],
        location_precision=row["location_precision"],
        visibility=row["visibility"],
        is_anonymous=row["is_anonymous"],
        created_at=row["created_at"],
        moderation_status=row["moderation_status"],
        rejection_reason=row["rejection_reason"] if is_owner else None,
        viewer_is_owner=is_owner,
        author=_author_from_row(row),
        reaction_count=row["reaction_count"],
        comment_count=row["comment_count"],
        viewer_reacted=bool(row["viewer_reacted"]),
        viewer_bookmarked=bool(row["viewer_bookmarked"]),
        photos=photos or [],
    )


async def create_story(
    db: AsyncSession,
    author_id: int,
    payload: StoryCreateRequest,
    settings: Settings,
) -> StoryResponse:
    if not await categories_repo.exists(db, payload.category_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown category")

    since = datetime.now(UTC) - timedelta(days=1)
    if await stories_repo.count_by_author_since(db, author_id, since) >= settings.story_create_per_day:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="daily story limit reached",
            headers={"Retry-After": "86400"},
        )

    # private ("only me") stories are never discoverable, so they skip review and
    # are auto-approved on creation; public stories still go through moderation
    is_private = payload.visibility == StoryVisibility.private
    story_id = await stories_repo.create(
        db,
        author_id=author_id,
        category_id=payload.category_id,
        title=payload.title,
        body=payload.body,
        happened_on=payload.happened_on,
        is_anonymous=payload.is_anonymous,
        visibility=payload.visibility,
        precision=payload.location_precision,
        exact_lat=payload.lat,
        exact_lon=payload.lon,
        moderation_status=ModerationStatus.approved if is_private else ModerationStatus.pending,
    )

    # fuzzing happens server-side before the public point is ever readable
    if payload.location_precision == LocationPrecision.approx:
        fuzzed_lat, fuzzed_lon = fuzz_story_location(story_id, payload.lat, payload.lon)
        await stories_repo.set_public_point(db, story_id, fuzzed_lat, fuzzed_lon)

    await db.commit()

    row = await stories_repo.get_for_viewer(db, story_id, author_id)
    if row is None:
        raise StoryNotFound()

    author = await users_repo.get_by_id(db, author_id)
    if not is_private:
        notifications.dispatch(
            settings,
            event=notifications.StoryEvent.submitted,
            telegram_id=author.telegram_id if author else None,
            title=payload.title,
        )
        notifications.dispatch_admins_pending_review(
            settings, title=payload.title, author_label=_author_label(author)
        )
    return serialize_story(row, viewer_id=author_id)


async def update_story(
    db: AsyncSession,
    story_id: uuid.UUID,
    author_id: int,
    payload: StoryUpdateRequest,
    settings: Settings,
) -> StoryResponse:
    story = await stories_repo.get_owned(db, story_id, author_id)
    if story is None:
        raise StoryNotFound()

    changes = payload.model_dump(exclude_unset=True)
    if "category_id" in changes and not await categories_repo.exists(db, changes["category_id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown category")

    await stories_repo.apply_update(db, story, changes)
    await db.commit()

    row = await stories_repo.get_for_viewer(db, story_id, author_id)
    if row is None:
        raise StoryNotFound()
    return serialize_story(row, await _photo_responses(db, story_id, settings), viewer_id=author_id)


async def resubmit_story(
    db: AsyncSession, story_id: uuid.UUID, author_id: int, settings: Settings
) -> StoryResponse:
    ok = await stories_repo.resubmit(db, story_id, author_id)
    if not ok:
        # not the owner, not currently rejected, or already gone
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a rejected story you own can be resubmitted",
        )
    await db.commit()

    row = await stories_repo.get_for_viewer(db, story_id, author_id)
    if row is None:
        raise StoryNotFound()

    author = await users_repo.get_by_id(db, author_id)
    notifications.dispatch(
        settings,
        event=notifications.StoryEvent.resubmitted,
        telegram_id=author.telegram_id if author else None,
        title=row["title"],
    )
    notifications.dispatch_admins_pending_review(
        settings, title=row["title"], author_label=_author_label(author)
    )
    return serialize_story(row, await _photo_responses(db, story_id, settings), viewer_id=author_id)


async def get_story(
    db: AsyncSession, story_id: uuid.UUID, viewer_id: int | None, settings: Settings
) -> StoryResponse:
    row = await stories_repo.get_for_viewer(db, story_id, viewer_id)
    if row is None:
        raise StoryNotFound()
    photos = await _photo_responses(db, story_id, settings)
    return serialize_story(row, photos, viewer_id=viewer_id)


async def get_story_by_token(
    db: AsyncSession, share_token: str, viewer_id: int | None, settings: Settings
) -> StoryResponse:
    # Look up the ID first (ensuring the story exists and is discoverable)
    token_row = await stories_repo.get_by_share_token_discoverable(db, share_token)
    if token_row is None:
        raise StoryNotFound()
    
    # Delegate to get_story to run full visibility and photo retrieval
    return await get_story(db, token_row["id"], viewer_id, settings)


async def delete_story(db: AsyncSession, story_id: uuid.UUID, author_id: int) -> None:
    story = await stories_repo.get_owned(db, story_id, author_id)
    if story is None:
        raise StoryNotFound()
    await stories_repo.delete(db, story)
    await db.commit()


async def _photo_responses(
    db: AsyncSession, story_id: uuid.UUID, settings: Settings
) -> list[PhotoResponse]:
    photos = await photos_repo.list_for_story(db, story_id)
    ttl = settings.s3_presigned_url_expires_seconds
    return [
        PhotoResponse(
            id=photo.id,
            url=storage.presigned_get_url(photo.object_key, ttl),
            thumb_url=storage.presigned_get_url(photo.thumb_key, ttl) if photo.thumb_key else None,
            width=photo.width,
            height=photo.height,
        )
        for photo in photos
    ]


def _serialize_comment(row) -> CommentResponse:
    author = (
        None
        if row["author_id"] is None
        else AuthorResponse(
            id=row["author_id"],
            username=row["author_username"],
            first_name=row["author_first_name"],
            photo_url=row["author_photo_url"],
        )
    )
    return CommentResponse(
        id=row["id"], body=row["body"], created_at=row["created_at"], author=author
    )


async def list_comments(
    db: AsyncSession, story_id: uuid.UUID, viewer_id: int | None, limit: int
) -> list[CommentResponse]:
    await _assert_readable(db, story_id, viewer_id)
    rows = await comments_repo.list_for_story(db, story_id, limit)
    return [_serialize_comment(row) for row in rows]


async def _assert_readable(db: AsyncSession, story_id: uuid.UUID, viewer_id: int | None) -> None:
    # visibility is re-checked on every read; never trusted from the client
    if await stories_repo.get_for_viewer(db, story_id, viewer_id) is None:
        raise StoryNotFound()


async def add_comment(
    db: AsyncSession, story_id: uuid.UUID, author_id: int, body: str
) -> CommentResponse:
    await _assert_readable(db, story_id, author_id)
    comment = await comments_repo.create(db, story_id=story_id, author_id=author_id, body=body)
    await db.commit()
    rows = await comments_repo.list_for_story(db, story_id, limit=1000)
    row = next(r for r in rows if r["id"] == comment.id)
    return _serialize_comment(row)


async def delete_comment(db: AsyncSession, comment_id: uuid.UUID, author_id: int) -> None:
    comment = await comments_repo.get(db, comment_id)
    if comment is None or comment.author_id != author_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await comments_repo.delete(db, comment)
    await db.commit()

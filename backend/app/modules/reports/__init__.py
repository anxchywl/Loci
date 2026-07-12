"""Admin reported-content review workflow.

Turns report signals into a human moderation flow. A story that crosses the
report threshold is auto-hidden (never deleted) and surfaces here for an admin to
Restore, Keep hidden, Delete, or Ignore. Every decision is:

* transaction-safe — state changes commit together with report resolution;
* concurrency-guarded — restore/delete use atomic UPDATE/DELETE guarded on the
  current row, so two admins can't both act;
* auditable — an immutable ``audit_logs`` row records who did what and why. On a
  delete the report reasons are snapshotted into that row, so the moderation
  history survives even though the report rows cascade away with the story.
"""
import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security.text import clean_line
from app.db.models import Story
from app.db.repositories import admin as admin_repo
from app.db.repositories import reports as reports_repo
from app.db.repositories import stories as stories_repo
from app.db.repositories import users as users_repo
from app.integrations import storage
from app.modules import notifications
from app.modules.reports.schemas import (
    ReportDetail,
    ReportedStoriesResponse,
    ReportedStoryDetail,
    ReportedStoryItem,
    ReporterInfo,
)
from app.modules.stories.schemas import AuthorResponse, PhotoResponse

logger = logging.getLogger(__name__)


def _author(author_id, username, first_name, photo_url) -> AuthorResponse | None:
    # anonymity never hides the author from an admin reviewing reports
    if author_id is None:
        return None
    return AuthorResponse(id=author_id, username=username, first_name=first_name, photo_url=photo_url)


def _item_from_row(row: dict, settings: Settings, photos) -> ReportedStoryItem:
    story: Story = row["story"]
    ttl = settings.s3_presigned_url_expires_seconds
    return ReportedStoryItem(
        id=story.id,
        category_id=story.category_id,
        title=story.title,
        body=story.body,
        moderation_status=story.moderation_status,
        is_hidden=story.is_hidden,
        auto_hidden_at=story.auto_hidden_at,
        created_at=story.created_at,
        author=_author(row["author_id"], row["author_username"], row["author_first_name"], row["author_photo_url"]),
        report_count=row["report_count"],
        reporter_count=row["reporter_count"],
        pending_count=row["pending_count"],
        report_threshold=settings.report_auto_hide_threshold,
        latest_report_at=row["latest_report_at"],
        first_report_at=row["first_report_at"],
        photos=[
            PhotoResponse(
                id=photo.id,
                url=storage.presigned_get_url(photo.object_key, ttl),
                thumb_url=storage.presigned_get_url(photo.thumb_key, ttl) if photo.thumb_key else None,
                width=photo.width,
                height=photo.height,
            )
            for photo in photos
        ],
    )


async def list_reported(
    db: AsyncSession,
    settings: Settings,
    *,
    search: str | None,
    filter_by: str,
    sort_by: str,
    limit: int,
    offset: int,
) -> ReportedStoriesResponse:
    from app.db.repositories import photos as photos_repo

    rows = await reports_repo.list_reported_stories(
        db, search=search, filter_by=filter_by, sort_by=sort_by, limit=limit, offset=offset
    )
    total = await reports_repo.count_reported_stories(db, search=search, filter_by=filter_by)
    photos_by_story = await photos_repo.list_for_stories(db, [row["story"].id for row in rows])
    items = [
        _item_from_row(row, settings, photos_by_story.get(row["story"].id, []))
        for row in rows
    ]
    return ReportedStoriesResponse(
        items=items, total=total, limit=limit, offset=offset,
        report_threshold=settings.report_auto_hide_threshold,
    )


async def story_detail(db: AsyncSession, settings: Settings, story_id: uuid.UUID) -> ReportedStoryDetail:
    from app.db.repositories import photos as photos_repo

    story = await db.get(Story, story_id)
    if story is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    author = await users_repo.get_by_id(db, story.author_id) if story.author_id else None
    report_rows = await reports_repo.story_reports(db, story_id)
    photos = (await photos_repo.list_for_stories(db, [story_id])).get(story_id, [])
    pending = sum(1 for r in report_rows if r["report"].status.value == "pending")
    reporters = {r["report"].reporter_id for r in report_rows if r["report"].reporter_id is not None}
    created = [r["report"].created_at for r in report_rows]
    item = _item_from_row(
        {
            "story": story,
            "author_id": author.id if author else None,
            "author_username": author.username if author else None,
            "author_first_name": author.first_name if author else None,
            "author_photo_url": author.photo_url if author else None,
            "report_count": len(report_rows),
            "reporter_count": len(reporters),
            "pending_count": pending,
            "latest_report_at": max(created) if created else None,
            "first_report_at": min(created) if created else None,
        },
        settings,
        photos,
    )
    reports = [
        ReportDetail(
            id=r["report"].id,
            reason=r["report"].reason,
            status=r["report"].status,
            created_at=r["report"].created_at,
            resolved_at=r["report"].resolved_at,
            resolved_by=r["report"].resolved_by,
            resolution_action=r["report"].resolution_action,
            reporter=ReporterInfo(
                id=r["reporter_id"], username=r["reporter_username"], first_name=r["reporter_first_name"]
            ),
        )
        for r in report_rows
    ]
    return ReportedStoryDetail(story=item, reports=reports)


async def _notify(db: AsyncSession, author_id: int | None, title: str, settings: Settings, event, reason=None) -> None:
    if author_id is None:
        return
    author = await users_repo.get_by_id(db, author_id)
    notifications.dispatch(
        settings, event=event, telegram_id=author.telegram_id if author else None, title=title, reason=reason,
    )


async def resolve(
    db: AsyncSession,
    admin_id: int,
    story_id: uuid.UUID,
    action: str,
    reason: str | None,
    settings: Settings,
) -> None:
    reason = clean_line(reason or "") or None
    now = datetime.now(UTC)
    story = await db.get(Story, story_id)
    if story is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    author_id, title = story.author_id, story.title

    if action == "delete":
        # snapshot the report history into the immutable audit log BEFORE the
        # rows cascade away with the story — moderation history is never lost
        report_rows = await reports_repo.story_reports(db, story_id)
        snapshot = {
            "report_count": len(report_rows),
            "reasons": [r["report"].reason for r in report_rows if r["report"].reason],
        }
        await db.delete(story)
        await admin_repo.add_audit(
            db, admin_id=admin_id, action="deleted_reported_story",
            target_user_id=author_id, target_story_id=str(story_id), reason=reason, metadata=snapshot,
        )
        await db.commit()
        await _notify(db, author_id, title, settings, notifications.StoryEvent.removed, reason=reason)
        return

    if action == "restore":
        await stories_repo.restore_from_reports(db, story_id)
        resolved = await reports_repo.resolve_story_reports(db, story_id, admin_id, "restored", now)
        await admin_repo.add_audit(
            db, admin_id=admin_id, action="restored_reported_story",
            target_user_id=author_id, target_story_id=str(story_id), reason=reason,
            metadata={"resolved_reports": resolved},
        )
        await db.commit()
        await _notify(db, author_id, title, settings, notifications.StoryEvent.restored)
        return

    if action == "keep_hidden":
        await stories_repo.set_hidden(db, story_id, True)
        resolved = await reports_repo.resolve_story_reports(db, story_id, admin_id, "kept_hidden", now)
        await admin_repo.add_audit(
            db, admin_id=admin_id, action="kept_reported_story_hidden",
            target_user_id=author_id, target_story_id=str(story_id), reason=reason,
            metadata={"resolved_reports": resolved},
        )
        await db.commit()
        return

    if action == "ignore":
        # dismiss the reports as not actionable; visibility is left untouched
        resolved = await reports_repo.resolve_story_reports(db, story_id, admin_id, "ignored", now)
        await admin_repo.add_audit(
            db, admin_id=admin_id, action="ignored_reports",
            target_user_id=author_id, target_story_id=str(story_id), reason=reason,
            metadata={"resolved_reports": resolved},
        )
        await db.commit()
        return

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown resolution action")

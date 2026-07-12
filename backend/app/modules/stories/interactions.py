import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.repositories import bookmarks as bookmarks_repo
from app.db.repositories import comments as comments_repo
from app.db.repositories import reactions as reactions_repo
from app.db.repositories import reports as reports_repo
from app.db.repositories import stories as stories_repo
from app.db.repositories import users as users_repo
from app.modules import notifications
from app.modules.stories.service import StoryNotFound, _assert_readable

logger = logging.getLogger(__name__)

# a burst of reports in this window is treated as a possible coordinated
# mass-report; it is logged for review and does not by itself change any state.
_MASS_REPORT_WINDOW = timedelta(minutes=10)
_MASS_REPORT_MIN = 8


async def react(db: AsyncSession, story_id: uuid.UUID, user_id: int) -> None:
    await _assert_readable(db, story_id, user_id)
    await reactions_repo.add(db, story_id, user_id)
    await db.commit()


async def unreact(db: AsyncSession, story_id: uuid.UUID, user_id: int) -> None:
    await _assert_readable(db, story_id, user_id)
    await reactions_repo.remove(db, story_id, user_id)
    await db.commit()


async def bookmark(db: AsyncSession, story_id: uuid.UUID, user_id: int) -> None:
    await _assert_readable(db, story_id, user_id)
    await bookmarks_repo.add(db, story_id, user_id)
    await db.commit()


async def unbookmark(db: AsyncSession, story_id: uuid.UUID, user_id: int) -> None:
    await _assert_readable(db, story_id, user_id)
    await bookmarks_repo.remove(db, story_id, user_id)
    await db.commit()


async def report_story(
    db: AsyncSession,
    story_id: uuid.UUID,
    reporter_id: int,
    reason: str | None,
    settings: Settings,
) -> None:
    await _assert_readable(db, story_id, reporter_id)
    # duplicate reports (same reporter, same story) are silently ignored by the
    # partial unique index inside create_for_story — one report per user per story.
    await reports_repo.create_for_story(db, story_id=story_id, reporter_id=reporter_id, reason=reason)

    now = datetime.now(UTC)
    # weighted reporter count is the extension point for future trust/reputation
    # weighting; today every distinct reporter counts as 1.
    reporters = await reports_repo.count_distinct_story_reporters(db, story_id)
    crossed_threshold = False
    if reporters >= settings.report_auto_hide_threshold:
        # only auto-hides a currently-visible story, and stamps auto_hidden_at so
        # the story enters the admin review queue rather than vanishing for good
        crossed_threshold = await stories_repo.auto_hide_for_reports(db, story_id, now)

    # brigading signal: many reports in a short window. Logged for admin review;
    # never auto-acts, so a report ring can't weaponise it.
    recent = await reports_repo.recent_story_report_count(db, story_id, now - _MASS_REPORT_WINDOW)
    if recent >= _MASS_REPORT_MIN:
        logger.warning(
            "possible mass-report on story %s: %d reports within %s",
            story_id, recent, _MASS_REPORT_WINDOW,
        )

    await db.commit()

    # tell the author their story was hidden pending review — only on the
    # transition, so they hear about it once, not on every subsequent report
    if crossed_threshold:
        await _notify_threshold(db, story_id, settings)


async def _notify_threshold(db: AsyncSession, story_id: uuid.UUID, settings: Settings) -> None:
    story = await stories_repo.get_owned_any(db, story_id)
    if story is None or story.author_id is None:
        return
    author = await users_repo.get_by_id(db, story.author_id)
    notifications.dispatch(
        settings,
        event=notifications.StoryEvent.report_threshold,
        telegram_id=author.telegram_id if author else None,
        title=story.title,
    )


async def report_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    reporter_id: int,
    reason: str | None,
    settings: Settings,
) -> None:
    comment = await comments_repo.get(db, comment_id)
    if comment is None or comment.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await _assert_readable(db, comment.story_id, reporter_id)

    await reports_repo.create_for_comment(
        db, comment_id=comment_id, reporter_id=reporter_id, reason=reason
    )
    reporters = await reports_repo.count_distinct_comment_reporters(db, comment_id)
    if reporters >= settings.report_auto_hide_threshold:
        await comments_repo.set_hidden(db, comment_id, True)
    await db.commit()


__all__ = [
    "StoryNotFound",
    "bookmark",
    "react",
    "report_comment",
    "report_story",
    "unbookmark",
    "unreact",
]

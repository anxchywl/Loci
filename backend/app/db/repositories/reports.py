import uuid
from datetime import datetime

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.security.text import escape_like
from app.db.models import Comment, Report, ReportStatus, Story, User


async def create_for_story(
    db: AsyncSession, *, story_id: uuid.UUID, reporter_id: int, reason: str | None
) -> None:
    stmt = (
        postgres_insert(Report)
        .values(story_id=story_id, reporter_id=reporter_id, reason=reason)
        # the unique index is partial, so the predicate must be repeated here
        .on_conflict_do_nothing(
            index_elements=[Report.reporter_id, Report.story_id],
            index_where=Report.story_id.is_not(None),
        )
    )
    await db.execute(stmt)
    await db.flush()


async def create_for_comment(
    db: AsyncSession, *, comment_id: uuid.UUID, reporter_id: int, reason: str | None
) -> None:
    stmt = (
        postgres_insert(Report)
        .values(comment_id=comment_id, reporter_id=reporter_id, reason=reason)
        .on_conflict_do_nothing(
            index_elements=[Report.reporter_id, Report.comment_id],
            index_where=Report.comment_id.is_not(None),
        )
    )
    await db.execute(stmt)
    await db.flush()


async def count_distinct_story_reporters(db: AsyncSession, story_id: uuid.UUID) -> int:
    # a story's own author reporting it must not count toward auto-hide
    author = select(Story.author_id).where(Story.id == story_id).scalar_subquery()
    stmt = (
        select(func.count(func.distinct(Report.reporter_id)))
        .where(
            and_(
                Report.story_id == story_id,
                Report.resolved_at.is_(None),
                Report.reporter_id.is_not(None),
                Report.reporter_id != author,
            )
        )
    )
    return (await db.execute(stmt)).scalar_one()


async def count_distinct_comment_reporters(db: AsyncSession, comment_id: uuid.UUID) -> int:
    author = select(Comment.author_id).where(Comment.id == comment_id).scalar_subquery()
    stmt = (
        select(func.count(func.distinct(Report.reporter_id)))
        .where(
            and_(
                Report.comment_id == comment_id,
                Report.resolved_at.is_(None),
                Report.reporter_id.is_not(None),
                Report.reporter_id != author,
            )
        )
    )
    return (await db.execute(stmt)).scalar_one()


# --- admin reported-content queue -------------------------------------------

# aggregate expression reused by list/count so filters stay consistent
def _story_report_agg():
    return (
        select(
            Report.story_id.label("story_id"),
            func.count().label("report_count"),
            func.count(func.distinct(Report.reporter_id)).label("reporter_count"),
            func.count().filter(Report.status == ReportStatus.pending).label("pending_count"),
            func.max(Report.created_at).label("latest_report_at"),
            func.min(Report.created_at).label("first_report_at"),
        )
        .where(Report.story_id.is_not(None))
        .group_by(Report.story_id)
        .subquery()
    )


def _apply_reported_filters(stmt, agg, *, search: str | None, filter_by: str):
    if filter_by == "hidden":
        stmt = stmt.where(Story.is_hidden.is_(True))
    elif filter_by == "visible":
        stmt = stmt.where(Story.is_hidden.is_(False))
    elif filter_by == "pending":
        stmt = stmt.where(agg.c.pending_count > 0)
    elif filter_by == "resolved":
        stmt = stmt.where(agg.c.pending_count == 0)
    if search:
        like = f"%{escape_like(search.lower())}%"
        stmt = stmt.where(
            or_(func.lower(Story.title).like(like), func.lower(Story.body).like(like))
        )
    return stmt


async def count_reported_stories(db: AsyncSession, *, search: str | None, filter_by: str) -> int:
    agg = _story_report_agg()
    stmt = select(func.count()).select_from(Story).join(agg, agg.c.story_id == Story.id)
    stmt = _apply_reported_filters(stmt, agg, search=search, filter_by=filter_by)
    return int((await db.execute(stmt)).scalar_one())


async def list_reported_stories(
    db: AsyncSession,
    *,
    search: str | None,
    filter_by: str,
    sort_by: str,
    limit: int,
    offset: int,
) -> list[dict]:
    agg = _story_report_agg()
    author = aliased(User)
    stmt = (
        select(
            Story,
            author.id.label("author_id_row"),
            author.username.label("author_username"),
            author.first_name.label("author_first_name"),
            author.photo_url.label("author_photo_url"),
            agg.c.report_count,
            agg.c.reporter_count,
            agg.c.pending_count,
            agg.c.latest_report_at,
            agg.c.first_report_at,
        )
        .join(agg, agg.c.story_id == Story.id)
        .outerjoin(author, author.id == Story.author_id)
    )
    stmt = _apply_reported_filters(stmt, agg, search=search, filter_by=filter_by)
    if sort_by == "newest":
        stmt = stmt.order_by(agg.c.latest_report_at.desc(), Story.id)
    elif sort_by == "hidden":
        # auto-hidden first (most recent hide), then by report volume
        stmt = stmt.order_by(Story.auto_hidden_at.desc().nullslast(), agg.c.report_count.desc(), Story.id)
    else:  # "reports" (default): highest report count first
        stmt = stmt.order_by(agg.c.report_count.desc(), agg.c.latest_report_at.desc(), Story.id)
    stmt = stmt.limit(limit).offset(offset)

    rows = await db.execute(stmt)
    result: list[dict] = []
    for row in rows:
        story = row[0]
        result.append(
            {
                "story": story,
                "author_id": row.author_id_row,
                "author_username": row.author_username,
                "author_first_name": row.author_first_name,
                "author_photo_url": row.author_photo_url,
                "report_count": row.report_count,
                "reporter_count": row.reporter_count,
                "pending_count": row.pending_count,
                "latest_report_at": row.latest_report_at,
                "first_report_at": row.first_report_at,
            }
        )
    return result


async def story_reports(db: AsyncSession, story_id: uuid.UUID) -> list[dict]:
    """Full, permanent report timeline for one story — reporter, reason, state,
    and resolution. Ordered oldest-first so it reads as a history."""
    reporter = aliased(User)
    stmt = (
        select(
            Report,
            reporter.id.label("reporter_uid"),
            reporter.username.label("reporter_username"),
            reporter.first_name.label("reporter_first_name"),
        )
        .outerjoin(reporter, reporter.id == Report.reporter_id)
        .where(Report.story_id == story_id)
        .order_by(Report.created_at.asc())
    )
    rows = await db.execute(stmt)
    return [
        {
            "report": row[0],
            "reporter_id": row.reporter_uid,
            "reporter_username": row.reporter_username,
            "reporter_first_name": row.reporter_first_name,
        }
        for row in rows
    ]


async def resolve_story_reports(
    db: AsyncSession, story_id: uuid.UUID, admin_id: int, action: str, now: datetime
) -> int:
    """Close every not-yet-resolved report on a story with an outcome. Idempotent
    at the row level (already-resolved rows are skipped), so replaying an action
    can't rewrite an earlier resolution. Returns the number of rows resolved."""
    stmt = (
        update(Report)
        .where(Report.story_id == story_id, Report.status != ReportStatus.resolved)
        .values(
            status=ReportStatus.resolved,
            resolved_at=now,
            resolved_by=admin_id,
            resolution_action=action,
        )
    )
    result = await db.execute(stmt)
    return result.rowcount or 0


async def recent_story_report_count(db: AsyncSession, story_id: uuid.UUID, since: datetime) -> int:
    """How many reports a story received since ``since`` — the raw signal for
    mass-report / brigading detection."""
    stmt = select(func.count()).where(
        Report.story_id == story_id, Report.created_at >= since
    )
    return int((await db.execute(stmt)).scalar_one())


# --- dashboard analytics ----------------------------------------------------


async def report_analytics(db: AsyncSession, start: datetime, end: datetime) -> dict:
    pending_reports = int(
        (await db.execute(select(func.count()).where(Report.status == ReportStatus.pending, Report.story_id.is_not(None)))).scalar_one()
    )
    auto_hidden = int(
        (await db.execute(select(func.count()).select_from(Story).where(Story.auto_hidden_at.is_not(None), Story.is_hidden.is_(True)))).scalar_one()
    )
    resolved_reports = int(
        (await db.execute(select(func.count()).where(Report.status == ReportStatus.resolved, Report.resolved_at >= start, Report.resolved_at <= end))).scalar_one()
    )
    # average time from a report being filed to it being resolved, in seconds
    avg_seconds = (
        await db.execute(
            select(func.avg(func.extract("epoch", Report.resolved_at - Report.created_at)))
            .where(Report.resolved_at.is_not(None), Report.resolved_at >= start, Report.resolved_at <= end)
        )
    ).scalar_one()
    category_rows = await db.execute(
        select(Story.category_id, func.count().label("count"))
        .join(Report, Report.story_id == Story.id)
        .group_by(Story.category_id)
        .order_by(func.count().desc())
        .limit(5)
    )
    return {
        "pending_reports": pending_reports,
        "auto_hidden_stories": auto_hidden,
        "resolved_reports": resolved_reports,
        "avg_review_seconds": float(avg_seconds) if avg_seconds is not None else None,
        "most_reported_categories": [
            {"category_id": row.category_id, "count": row.count} for row in category_rows
        ],
    }

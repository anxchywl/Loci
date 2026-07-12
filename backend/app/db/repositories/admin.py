import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog, Bookmark, Comment, Report, Story, User, UserModerationLog
from app.db.models.refresh_token import RefreshToken
from app.db.models.story import ModerationStatus


def _display_name(user: User) -> str:
    return " ".join(part for part in (user.first_name, user.last_name) if part) or user.username or f"#{user.id}"


def _status(user: User) -> str:
    if user.deleted_at is not None:
        return "deleted"
    return "blocked" if user.is_blocked else "active"


async def count_users(db: AsyncSession, query: str | None, status_filter: str | None) -> int:
    stmt = select(func.count()).select_from(User)
    stmt = _filter_users(stmt, query, status_filter)
    return int((await db.execute(stmt)).scalar_one())


def _filter_users(stmt, query: str | None, status_filter: str | None):
    if status_filter == "active":
        stmt = stmt.where(User.is_blocked.is_(False), User.deleted_at.is_(None))
    elif status_filter == "blocked":
        stmt = stmt.where(User.is_blocked.is_(True), User.deleted_at.is_(None))
    elif status_filter == "deleted":
        stmt = stmt.where(User.deleted_at.is_not(None))
    if query:
        needle = query.strip().lower()
        pattern = f"%{needle}%"
        stmt = stmt.where(
            or_(
                cast(User.id, String).ilike(pattern),
                cast(User.telegram_id, String).ilike(pattern),
                func.lower(User.username).ilike(pattern),
                func.lower(User.first_name).ilike(pattern),
                func.lower(User.last_name).ilike(pattern),
                func.lower(func.concat(User.first_name, " ", User.last_name)).ilike(pattern),
            )
        )
    return stmt


async def list_users(
    db: AsyncSession,
    query: str | None,
    status_filter: str | None,
    sort_by: str,
    sort_order: str,
    limit: int,
    offset: int,
) -> list[User]:
    sort_columns = {
        "created_at": User.created_at,
        "last_active_at": User.last_active_at,
        "uid": User.id,
        "telegram_id": User.telegram_id,
        "username": User.username,
    }
    column = sort_columns.get(sort_by, User.created_at)
    stmt = _filter_users(select(User), query, status_filter)
    stmt = stmt.order_by(column.desc() if sort_order == "desc" else column.asc(), User.id.asc())
    return list((await db.execute(stmt.limit(limit).offset(offset))).scalars().all())


async def story_counts(db: AsyncSession, user_ids: list[int]) -> dict[int, dict[str, int]]:
    if not user_ids:
        return {}
    rows = await db.execute(
        select(
            Story.author_id,
            func.count().label("all"),
            func.count().filter(Story.moderation_status == ModerationStatus.approved).label("approved"),
            func.count().filter(Story.moderation_status == ModerationStatus.pending).label("pending"),
            func.count().filter(Story.moderation_status == ModerationStatus.rejected).label("rejected"),
        ).where(Story.author_id.in_(user_ids)).group_by(Story.author_id)
    )
    return {row.author_id: {"all": row.all, "approved": row.approved, "pending": row.pending, "rejected": row.rejected} for row in rows}


async def bookmark_counts(db: AsyncSession, user_ids: list[int]) -> dict[int, int]:
    rows = await db.execute(select(Bookmark.user_id, func.count()).where(Bookmark.user_id.in_(user_ids)).group_by(Bookmark.user_id))
    return {row[0]: row[1] for row in rows}


async def report_counts(db: AsyncSession, user_ids: list[int]) -> dict[int, int]:
    story_rows = await db.execute(
        select(Story.author_id, func.count()).join(Report, Report.story_id == Story.id).where(Story.author_id.in_(user_ids)).group_by(Story.author_id)
    )
    comment_rows = await db.execute(
        select(Story.author_id, func.count())
        .join(Comment, Comment.story_id == Story.id)
        .join(Report, Report.comment_id == Comment.id)
        .where(Story.author_id.in_(user_ids))
        .group_by(Story.author_id)
    )
    counts = {user_id: 0 for user_id in user_ids}
    for row in story_rows:
        counts[row[0]] += row[1]
    for row in comment_rows:
        counts[row[0]] += row[1]
    return counts


async def story_report_counts(db: AsyncSession, story_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Number of reports filed against each of the given stories."""
    if not story_ids:
        return {}
    rows = await db.execute(
        select(Report.story_id, func.count())
        .where(Report.story_id.in_(story_ids))
        .group_by(Report.story_id)
    )
    return {row[0]: row[1] for row in rows}


async def get_user(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def list_sessions(db: AsyncSession, user_id: int, now: datetime) -> list[RefreshToken]:
    stmt = select(RefreshToken).where(RefreshToken.user_id == user_id).order_by(RefreshToken.last_used_at.desc()).limit(50)
    return list((await db.execute(stmt)).scalars().all())


async def list_moderation_history(db: AsyncSession, user_id: int) -> list[UserModerationLog]:
    stmt = select(UserModerationLog).where(UserModerationLog.user_id == user_id).order_by(UserModerationLog.created_at.desc()).limit(100)
    return list((await db.execute(stmt)).scalars().all())


async def add_audit(db: AsyncSession, *, admin_id: int, action: str, target_user_id: int | None = None, target_story_id: str | None = None, reason: str | None = None, metadata: dict | None = None) -> None:
    db.add(AuditLog(admin_id=admin_id, target_user_id=target_user_id, target_story_id=target_story_id, action=action, reason=reason, metadata_json=metadata))


async def list_audit_logs(db: AsyncSession, limit: int, offset: int) -> tuple[int, list[AuditLog]]:
    total = int((await db.execute(select(func.count()).select_from(AuditLog))).scalar_one())
    rows = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset))
    return total, list(rows.scalars().all())


def range_bounds(from_date: date, to_date: date) -> tuple[datetime, datetime]:
    return datetime.combine(from_date, time.min, tzinfo=timezone.utc), datetime.combine(to_date, time.max, tzinfo=timezone.utc)

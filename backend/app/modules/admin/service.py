import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import AuditLog, Story, User, UserModerationLog
from app.db.repositories import admin as admin_repo
from app.db.repositories import refresh_tokens as refresh_repo
from app.modules.admin.schemas import (
    AdminDashboardResponse,
    AdminUserItem,
    AdminUserProfile,
    SessionItem,
    UserModerationItem,
)


def _item(user: User, settings: Settings, counts: dict[str, int], saved: int, reports: int, warnings: int) -> AdminUserItem:
    return AdminUserItem(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        display_name=admin_repo._display_name(user),
        photo_url=user.photo_url,
        created_at=user.created_at,
        last_active_at=user.last_active_at,
        status=admin_repo._status(user),
        is_admin=user.telegram_id in settings.admin_ids,
        stories_count=counts.get("all", 0),
        approved_stories=counts.get("approved", 0),
        pending_stories=counts.get("pending", 0),
        rejected_stories=counts.get("rejected", 0),
        saved_stories_count=saved,
        reports_received=reports,
        warnings=warnings,
    )


async def list_users(db: AsyncSession, settings: Settings, query: str | None, status_filter: str | None, sort_by: str, sort_order: str, limit: int, offset: int):
    users = await admin_repo.list_users(db, query, status_filter, sort_by, sort_order, limit, offset)
    counts = await admin_repo.story_counts(db, [u.id for u in users])
    saved = await admin_repo.bookmark_counts(db, [u.id for u in users])
    reports = await admin_repo.report_counts(db, [u.id for u in users])
    warning_rows = await db.execute(select(UserModerationLog.user_id, func.count()).where(UserModerationLog.action == "warning", UserModerationLog.user_id.in_([u.id for u in users])).group_by(UserModerationLog.user_id)) if users else []
    warnings = {row[0]: row[1] for row in warning_rows}
    return [_item(u, settings, counts.get(u.id, {}), saved.get(u.id, 0), reports.get(u.id, 0), warnings.get(u.id, 0)) for u in users]


async def get_profile(db: AsyncSession, settings: Settings, user_id: int) -> AdminUserProfile:
    user = await admin_repo.get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    counts = (await admin_repo.story_counts(db, [user_id])).get(user_id, {})
    saved = (await admin_repo.bookmark_counts(db, [user_id])).get(user_id, 0)
    reports = (await admin_repo.report_counts(db, [user_id])).get(user_id, 0)
    history = await admin_repo.list_moderation_history(db, user_id)
    warnings = sum(log.action == "warning" for log in history)
    sessions = await admin_repo.list_sessions(db, user_id, datetime.now(UTC))
    item = _item(user, settings, counts, saved, reports, warnings)
    return AdminUserProfile(
        **item.model_dump(),
        first_name=user.first_name,
        last_name=user.last_name,
        language_code=user.language_code,
        blocked_at=user.blocked_at,
        blocked_reason=user.blocked_reason,
        sessions=[SessionItem(id=str(s.id), created_at=s.created_at, last_used_at=s.last_used_at, user_agent_summary=s.user_agent_summary, device_type=s.device_type, browser=s.browser, operating_system=s.operating_system, active=s.revoked_at is None and s.expires_at > datetime.now(UTC)) for s in sessions],
        moderation_history=[UserModerationItem.model_validate(log, from_attributes=True) for log in history],
    )


async def moderate_user(db: AsyncSession, admin_id: int, user_id: int, action: str, reason: str) -> None:
    if admin_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins cannot moderate themselves")
    target = await admin_repo.get_user(db, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    now = datetime.now(UTC)
    expected = action == "unblock"
    result = await db.execute(
        update(User)
        .where(User.id == user_id, User.is_blocked.is_(expected), User.deleted_at.is_(None))
        .values(
            is_blocked=not expected,
            blocked_at=None if expected else now,
            blocked_reason=reason,
            blocked_by=None if expected else admin_id,
        )
        .returning(User.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User restriction state changed")
    if action == "block":
        await refresh_repo.revoke_all_for_user(db, user_id, now)
    db.add(UserModerationLog(user_id=user_id, admin_id=admin_id, action=action, reason=reason))
    await admin_repo.add_audit(db, admin_id=admin_id, action=f"{action}_user", target_user_id=user_id, reason=reason)
    await db.commit()


async def add_warning(db: AsyncSession, admin_id: int, user_id: int, reason: str) -> None:
    if await admin_repo.get_user(db, user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.add(UserModerationLog(user_id=user_id, admin_id=admin_id, action="warning", reason=reason))
    await admin_repo.add_audit(db, admin_id=admin_id, action="warned_user", target_user_id=user_id, reason=reason)
    await db.commit()


async def set_deleted(db: AsyncSession, admin_id: int, user_id: int, reason: str, deleted: bool) -> None:
    target = await admin_repo.get_user(db, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target.deleted_at = None if not deleted else datetime.now(UTC)
    if deleted:
        await refresh_repo.revoke_all_for_user(db, user_id, datetime.now(UTC))
    await admin_repo.add_audit(db, admin_id=admin_id, action="deleted_user" if deleted else "restored_user", target_user_id=user_id, reason=reason)
    await db.commit()


async def delete_story(db: AsyncSession, admin_id: int, story_id: uuid.UUID, reason: str) -> None:
    story = await db.get(Story, story_id)
    if story is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    target_user_id = story.author_id
    await db.delete(story)
    await admin_repo.add_audit(db, admin_id=admin_id, action="deleted_story", target_user_id=target_user_id, target_story_id=str(story_id), reason=reason)
    await db.commit()


async def list_audit_logs(db: AsyncSession, limit: int, offset: int):
    return await admin_repo.list_audit_logs(db, limit, offset)


async def dashboard(db: AsyncSession, from_date: date, to_date: date) -> AdminDashboardResponse:
    start, end = admin_repo.range_bounds(from_date, to_date)
    total_users = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
    active_users = int((await db.execute(select(func.count()).select_from(User).where(User.last_active_at >= start, User.last_active_at <= end, User.deleted_at.is_(None)))).scalar_one())
    new_users = int((await db.execute(select(func.count()).select_from(User).where(User.created_at >= start, User.created_at <= end))).scalar_one())
    pending = int((await db.execute(select(func.count()).select_from(Story).where(Story.moderation_status == "pending"))).scalar_one())
    approved = int((await db.execute(select(func.count()).select_from(Story).where(Story.moderation_status == "approved", Story.moderated_at >= start, Story.moderated_at <= end))).scalar_one())
    rejected = int((await db.execute(select(func.count()).select_from(Story).where(Story.moderation_status == "rejected", Story.moderated_at >= start, Story.moderated_at <= end))).scalar_one())
    published = int((await db.execute(select(func.count()).select_from(Story).where(Story.moderation_status == "approved", Story.created_at <= end))).scalar_one())
    recent = list((await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10))).scalars().all())
    from app.db.repositories import reports as reports_repo

    report_stats = await reports_repo.report_analytics(db, start, end)
    deleted_after_reports = int((await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.action == "deleted_reported_story", AuditLog.created_at >= start, AuditLog.created_at <= end)
    )).scalar_one())
    restored_after_review = int((await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.action == "restored_reported_story", AuditLog.created_at >= start, AuditLog.created_at <= end)
    )).scalar_one())
    activity_rows = await db.execute(
        select(func.date_trunc("day", User.last_active_at).label("period"), func.count(func.distinct(User.id)).label("count"))
        .where(User.last_active_at >= start, User.last_active_at <= end, User.deleted_at.is_(None))
        .group_by("period").order_by("period")
    )
    moderation_rows = await db.execute(
        select(func.date_trunc("day", Story.moderated_at).label("period"), Story.moderation_status, func.count().label("count"))
        .where(Story.moderated_at >= start, Story.moderated_at <= end)
        .group_by("period", Story.moderation_status).order_by("period")
    )
    return AdminDashboardResponse(
        from_date=from_date, to_date=to_date, total_users=total_users, active_users=active_users, new_users=new_users,
        pending_moderation=pending, approved_stories=approved, rejected_stories=rejected, published_stories=published,
        pending_reports=report_stats["pending_reports"],
        auto_hidden_stories=report_stats["auto_hidden_stories"],
        resolved_reports=report_stats["resolved_reports"],
        deleted_after_reports=deleted_after_reports,
        restored_after_review=restored_after_review,
        avg_review_seconds=report_stats["avg_review_seconds"],
        most_reported_categories=report_stats["most_reported_categories"],
        activity=[{"period": row.period.date().isoformat(), "count": row.count} for row in activity_rows],
        moderation=[{"period": row.period.date().isoformat(), "status": str(row.moderation_status), "count": row.count} for row in moderation_rows],
        recent_actions=[{"id": a.id, "admin_id": a.admin_id, "action": a.action, "target_user_id": a.target_user_id, "created_at": a.created_at.isoformat()} for a in recent],
    )

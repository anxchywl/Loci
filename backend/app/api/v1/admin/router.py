import uuid
from typing import Annotated

from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db_session
from app.core.config import Settings, get_settings
from app.db.models import User
from app.db.models.story import ModerationStatus
from app.modules import moderation
from app.modules import reports as reports_service
from app.modules.reports.schemas import (
    ReportedStoriesResponse,
    ReportedStoryDetail,
    ResolveReportsRequest,
)
from app.modules.stories.schemas import ModerationQueueResponse, RejectRequest
from app.modules.admin import service as admin_service
from app.modules.admin.schemas import (
    AdminDashboardResponse,
    AdminStoryDeleteRequest,
    AdminUserActionRequest,
    AdminUserProfile,
    AdminUsersResponse,
    AuditLogItem,
    AuditLogsResponse,
)
from app.modules.stories import service as story_service
from app.db.repositories import stories as stories_repo

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_QUEUE_LIMIT = 50


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def dashboard(
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> AdminDashboardResponse:
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=29))
    if start > end:
        raise HTTPException(status_code=400, detail="Invalid date range")
    return await admin_service.dashboard(db, start, end)


@router.get("/users", response_model=AdminUsersResponse)
async def users(
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[str | None, Query(alias="status", pattern="^(active|blocked|deleted)?$")] = None,
    sort_by: Annotated[str, Query(pattern="^(created_at|last_active_at|uid|telegram_id|username)$")] = "created_at",
    sort_order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUsersResponse:
    q = q.strip() if q else None
    status_filter = status_filter or None
    items = await admin_service.list_users(db, settings, q, status_filter, sort_by, sort_order, limit, offset)
    from app.db.repositories import admin as admin_repo
    total = await admin_repo.count_users(db, q, status_filter)
    return AdminUsersResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserProfile)
async def user_profile(
    user_id: int,
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminUserProfile:
    return await admin_service.get_profile(db, settings, user_id)


@router.post("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block_user(user_id: int, payload: AdminUserActionRequest, admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)]) -> Response:
    await admin_service.moderate_user(db, admin.id, user_id, "block", payload.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/unblock", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(user_id: int, payload: AdminUserActionRequest, admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)]) -> Response:
    await admin_service.moderate_user(db, admin.id, user_id, "unblock", payload.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/warning", status_code=status.HTTP_204_NO_CONTENT)
async def warn_user(user_id: int, payload: AdminUserActionRequest, admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)]) -> Response:
    await admin_service.add_warning(db, admin.id, user_id, payload.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, payload: AdminUserActionRequest, admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)]) -> Response:
    await admin_service.set_deleted(db, admin.id, user_id, payload.reason, True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def restore_user(user_id: int, payload: AdminUserActionRequest, admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)]) -> Response:
    await admin_service.set_deleted(db, admin.id, user_id, payload.reason, False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/{user_id}/stories")
async def user_stories(user_id: int, _admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)], settings: Annotated[Settings, Depends(get_settings)], moderation_status: Annotated[ModerationStatus | None, Query(alias="status")] = None):
    from app.db.repositories import admin as admin_repo

    rows = await stories_repo.list_by_author(db, author_id=user_id, viewer_id=user_id, limit=100, include_anonymous=True)
    if moderation_status is not None:
        rows = [row for row in rows if row["moderation_status"] == moderation_status]
    report_counts = await admin_repo.story_report_counts(db, [row["id"] for row in rows])
    return [
        {
            **story_service.serialize_story(row, viewer_id=user_id).model_dump(mode="json"),
            "report_count": report_counts.get(row["id"], 0),
        }
        for row in rows
    ]


@router.delete("/stories/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_any_story(story_id: uuid.UUID, payload: AdminStoryDeleteRequest, admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)]) -> Response:
    await admin_service.delete_story(db, admin.id, story_id, payload.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/audit-logs", response_model=AuditLogsResponse)
async def audit_logs(_admin: Annotated[User, Depends(get_current_admin)], db: Annotated[AsyncSession, Depends(get_db_session)], limit: Annotated[int, Query(ge=1, le=100)] = 50, offset: Annotated[int, Query(ge=0)] = 0) -> AuditLogsResponse:
    total, logs = await admin_service.list_audit_logs(db, limit, offset)
    return AuditLogsResponse(items=[AuditLogItem.model_validate(log, from_attributes=True) for log in logs], total=total, limit=limit, offset=offset)


@router.get("/moderation/queue", response_model=ModerationQueueResponse)
async def moderation_queue(
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    status_filter: Annotated[ModerationStatus, Query(alias="status")] = ModerationStatus.pending,
    limit: Annotated[int, Query(ge=1, le=MAX_QUEUE_LIMIT)] = 20,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> ModerationQueueResponse:
    return await moderation.list_queue(
        db, settings, status_filter=status_filter, limit=limit, cursor=cursor
    )


@router.post("/moderation/{story_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_story(
    story_id: uuid.UUID,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await moderation.approve(db, story_id, admin.id, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/moderation/{story_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_story(
    story_id: uuid.UUID,
    payload: RejectRequest,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await moderation.reject(db, story_id, admin.id, payload.reason, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/reports", response_model=ReportedStoriesResponse)
async def reported_stories(
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    filter_by: Annotated[str, Query(alias="filter", pattern="^(all|hidden|visible|pending|resolved)$")] = "all",
    sort_by: Annotated[str, Query(alias="sort", pattern="^(reports|newest|hidden)$")] = "reports",
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ReportedStoriesResponse:
    search = q.strip() if q and q.strip() else None
    return await reports_service.list_reported(
        db, settings, search=search, filter_by=filter_by, sort_by=sort_by, limit=limit, offset=offset
    )


@router.get("/reports/{story_id}", response_model=ReportedStoryDetail)
async def reported_story_detail(
    story_id: uuid.UUID,
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ReportedStoryDetail:
    return await reports_service.story_detail(db, settings, story_id)


@router.post("/reports/{story_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def resolve_reports(
    story_id: uuid.UUID,
    payload: ResolveReportsRequest,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await reports_service.resolve(db, admin.id, story_id, payload.action, payload.reason, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.stories.schemas import ModerationQueueItem


class AdminPage(BaseModel):
    total: int
    limit: int
    offset: int


class AdminUserItem(BaseModel):
    id: int
    telegram_id: int | None
    username: str | None
    display_name: str
    photo_url: str | None
    created_at: datetime
    last_active_at: datetime | None
    status: Literal["active", "blocked", "deleted"]
    is_admin: bool
    erased_at: datetime | None
    stories_count: int
    approved_stories: int
    pending_stories: int
    rejected_stories: int
    saved_stories_count: int
    reports_received: int
    warnings: int


class AdminUsersResponse(AdminPage):
    items: list[AdminUserItem]


class SessionItem(BaseModel):
    id: str
    created_at: datetime
    last_used_at: datetime
    user_agent_summary: str | None
    device_type: str | None
    browser: str | None
    operating_system: str | None
    active: bool


class UserModerationItem(BaseModel):
    id: int
    user_id: int
    admin_id: int
    action: str
    reason: str
    created_at: datetime


class AdminUserProfile(AdminUserItem):
    first_name: str | None
    last_name: str | None
    language_code: str | None
    blocked_at: datetime | None
    blocked_reason: str | None
    sessions: list[SessionItem]
    moderation_history: list[UserModerationItem]


class AdminUserActionRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AdminStoryDeleteRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AdminDashboardResponse(BaseModel):
    from_date: date
    to_date: date
    total_users: int
    active_users: int
    new_users: int
    pending_moderation: int
    approved_stories: int
    rejected_stories: int
    published_stories: int
    # reported-content analytics
    pending_reports: int
    auto_hidden_stories: int
    resolved_reports: int
    deleted_after_reports: int
    restored_after_review: int
    avg_review_seconds: float | None
    most_reported_categories: list[dict[str, int]]
    activity: list[dict[str, int | str]]
    moderation: list[dict[str, int | str]]
    recent_actions: list[dict[str, int | str | None]]


class AuditLogItem(BaseModel):
    id: int
    admin_id: int
    target_user_id: int | None
    target_story_id: str | None
    action: str
    reason: str | None
    metadata_json: dict | None
    created_at: datetime


class AuditLogsResponse(AdminPage):
    items: list[AuditLogItem]


class AdminStoriesResponse(AdminPage):
    items: list[ModerationQueueItem]

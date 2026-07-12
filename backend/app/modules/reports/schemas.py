import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.db.models.report import ReportStatus
from app.db.models.story import ModerationStatus
from app.modules.stories.schemas import AuthorResponse, PhotoResponse

RESOLUTION_REASON_MAX = 500


class ReportedStoryItem(BaseModel):
    """One row in the reported-content queue: the story plus its report signal."""

    id: uuid.UUID
    category_id: int
    title: str
    body: str
    moderation_status: ModerationStatus
    is_hidden: bool
    auto_hidden_at: datetime | None
    created_at: datetime
    author: AuthorResponse | None
    report_count: int
    reporter_count: int
    pending_count: int
    report_threshold: int
    latest_report_at: datetime | None
    first_report_at: datetime | None
    photos: list[PhotoResponse] = []


class ReportedStoriesResponse(BaseModel):
    items: list[ReportedStoryItem]
    total: int
    limit: int
    offset: int
    report_threshold: int


class ReporterInfo(BaseModel):
    # admin-only endpoint, so the reporter identity is always included
    id: int | None
    username: str | None
    first_name: str | None


class ReportDetail(BaseModel):
    id: uuid.UUID
    reason: str | None
    status: ReportStatus
    created_at: datetime
    resolved_at: datetime | None
    resolved_by: int | None
    resolution_action: str | None
    reporter: ReporterInfo


class ReportedStoryDetail(BaseModel):
    story: ReportedStoryItem
    reports: list[ReportDetail]


ResolutionAction = Literal["restore", "keep_hidden", "delete", "ignore"]


class ResolveReportsRequest(BaseModel):
    action: ResolutionAction
    reason: str | None = Field(default=None, max_length=RESOLUTION_REASON_MAX)

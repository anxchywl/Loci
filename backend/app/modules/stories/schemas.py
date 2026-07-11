import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.validation import LineStr, MultilineStr
from app.db.models.story import LocationPrecision, ModerationStatus, StoryVisibility

TITLE_MAX = 120
BODY_MAX = 4000
COMMENT_MAX = 1000
REJECTION_REASON_MAX = 500

TitleStr = LineStr(1, TITLE_MAX)
BodyStr = MultilineStr(1, BODY_MAX)
CommentStr = MultilineStr(1, COMMENT_MAX)


class AuthorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None
    first_name: str | None
    photo_url: str | None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    color: str
    icon: str
    position: int


class StoryCreateRequest(BaseModel):
    category_id: int = Field(ge=1)
    title: TitleStr
    body: BodyStr
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    location_precision: LocationPrecision
    visibility: StoryVisibility = StoryVisibility.public
    is_anonymous: bool = False
    happened_on: date | None = None


class StoryUpdateRequest(BaseModel):
    # every field optional — only what's provided is changed; editing re-queues review
    category_id: int | None = Field(default=None, ge=1)
    title: TitleStr | None = None
    body: BodyStr | None = None
    visibility: StoryVisibility | None = None
    is_anonymous: bool | None = None
    happened_on: date | None = None


class PhotoResponse(BaseModel):
    id: uuid.UUID
    url: str
    thumb_url: str | None
    width: int | None
    height: int | None


class StoryResponse(BaseModel):
    id: uuid.UUID
    category_id: int
    title: str
    body: str
    happened_on: date | None
    lat: float
    lon: float
    location_precision: LocationPrecision
    visibility: StoryVisibility
    is_anonymous: bool
    created_at: datetime
    moderation_status: ModerationStatus
    # only ever populated for the owner's own view (My Stories); null for public reads
    rejection_reason: str | None = None
    author: AuthorResponse | None
    reaction_count: int
    comment_count: int
    viewer_reacted: bool
    viewer_bookmarked: bool
    photos: list[PhotoResponse] = []


class CommentCreateRequest(BaseModel):
    body: CommentStr


class CommentResponse(BaseModel):
    id: uuid.UUID
    body: str
    created_at: datetime
    author: AuthorResponse | None


class ReportCreateRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PhotoUploadRequest(BaseModel):
    content_type: str = Field(pattern=r"^image/(jpeg|png|webp|heic)$")


class PhotoUploadResponse(BaseModel):
    photo_id: uuid.UUID
    upload_url: str
    expires_in: int


# --- moderation ---------------------------------------------------------------


class RejectRequest(BaseModel):
    reason: LineStr(1, REJECTION_REASON_MAX)


class ModerationQueueItem(BaseModel):
    """Full detail an admin needs to decide, including the exact author id."""

    id: uuid.UUID
    category_id: int
    title: str
    body: str
    happened_on: date | None
    lat: float
    lon: float
    location_precision: LocationPrecision
    visibility: StoryVisibility
    is_anonymous: bool
    moderation_status: ModerationStatus
    created_at: datetime
    author: AuthorResponse | None
    photos: list[PhotoResponse] = []


class ModerationQueueResponse(BaseModel):
    items: list[ModerationQueueItem]
    # opaque cursor for the next page; null when there are no more rows
    next_cursor: str | None = None

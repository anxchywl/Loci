import enum
import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoryVisibility(str, enum.Enum):
    public = "public"
    private = "private"


class LocationPrecision(str, enum.Enum):
    exact = "exact"
    approx = "approx"


class ModerationStatus(str, enum.Enum):
    # every story starts pending; only approved stories are ever discoverable
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    share_token: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False
    )
    # nullable so anonymous stories survive account deletion unlinkable
    author_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    happened_on: Mapped[date | None] = mapped_column(Date)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    visibility: Mapped[StoryVisibility] = mapped_column(
        Enum(StoryVisibility, name="story_visibility"),
        nullable=False,
        server_default=StoryVisibility.public.value,
    )
    location_precision: Mapped[LocationPrecision] = mapped_column(
        Enum(LocationPrecision, name="location_precision"), nullable=False
    )
    # exact is what the author pinned; never serialized when precision is approx
    location_exact: Mapped[object] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False), nullable=False
    )
    # the only geometry queries ever read; equals exact, or the server-side fuzzed point
    location_public: Mapped[object] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False), nullable=False
    )
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # set when reports auto-hide a story; distinguishes report-driven hiding from
    # any other hide and drives the "auto-hidden" state in the reported queue.
    # cleared when an admin restores the story.
    auto_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # moderation gate — a story is public only when approved (and not hidden by reports)
    moderation_status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, name="moderation_status"),
        nullable=False,
        server_default=ModerationStatus.pending.value,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # the admin (user id) who last approved/rejected; kept for audit, nulled if they leave
    moderated_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_stories_location_public", "location_public", postgresql_using="gist"),
        Index("ix_stories_created_at", "created_at"),
        # supports the moderation queue (pending, oldest first) and discovery filters
        Index("ix_stories_moderation_status_created_at", "moderation_status", "created_at"),
    )

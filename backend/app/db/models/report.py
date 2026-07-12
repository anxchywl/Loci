import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Enum, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReportStatus(str, enum.Enum):
    # a report is filed pending; an admin may mark it reviewed while triaging, and
    # resolved once an action (restore/keep/delete/ignore) has been recorded.
    pending = "pending"
    reviewed = "reviewed"
    resolved = "resolved"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    reporter_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    story_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE")
    )
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="report_status"),
        nullable=False,
        server_default=ReportStatus.pending.value,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # resolution audit — who closed it, with what outcome, and when. Never cleared,
    # so the moderation history of a report is permanent.
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    resolution_action: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "(story_id IS NULL) != (comment_id IS NULL)", name="exactly_one_target"
        ),
        Index(
            "uq_reports_reporter_story",
            "reporter_id",
            "story_id",
            unique=True,
            postgresql_where=text("story_id IS NOT NULL"),
        ),
        Index(
            "uq_reports_reporter_comment",
            "reporter_id",
            "comment_id",
            unique=True,
            postgresql_where=text("comment_id IS NOT NULL"),
        ),
        # the reported-content queue scans reports grouped by story, filtering on status
        Index("ix_reports_story_status", "story_id", "status"),
        Index("ix_reports_created_at", "created_at"),
    )

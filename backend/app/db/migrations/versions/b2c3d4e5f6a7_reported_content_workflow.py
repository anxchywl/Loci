"""reported content moderation workflow

Adds report resolution state (status/resolved_by/resolution_action) and a
story.auto_hidden_at marker so report-driven hiding becomes an admin-reviewable
state rather than a permanent auto-hide.

Revision ID: b2c3d4e5f6a7
Revises: 7c8d9e0f1a2b
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "7c8d9e0f1a2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    report_status = sa.Enum("pending", "reviewed", "resolved", name="report_status")
    report_status.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "reports",
        sa.Column("status", report_status, server_default="pending", nullable=False),
    )
    op.add_column("reports", sa.Column("resolved_by", sa.BigInteger(), nullable=True))
    op.add_column("reports", sa.Column("resolution_action", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_reports_resolved_by_users", "reports", "users", ["resolved_by"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_reports_story_status", "reports", ["story_id", "status"])
    op.create_index("ix_reports_created_at", "reports", ["created_at"])
    # already-resolved rows (resolved_at set before this migration) become "resolved"
    op.execute("UPDATE reports SET status = 'resolved' WHERE resolved_at IS NOT NULL")

    op.add_column("stories", sa.Column("auto_hidden_at", sa.DateTime(timezone=True), nullable=True))
    # backfill: stories currently hidden are treated as auto-hidden pending review
    op.execute("UPDATE stories SET auto_hidden_at = now() WHERE is_hidden = true AND auto_hidden_at IS NULL")


def downgrade() -> None:
    op.drop_column("stories", "auto_hidden_at")
    op.drop_index("ix_reports_created_at", table_name="reports")
    op.drop_index("ix_reports_story_status", table_name="reports")
    op.drop_constraint("fk_reports_resolved_by_users", "reports", type_="foreignkey")
    op.drop_column("reports", "resolution_action")
    op.drop_column("reports", "resolved_by")
    op.drop_column("reports", "status")
    sa.Enum(name="report_status").drop(op.get_bind(), checkfirst=True)

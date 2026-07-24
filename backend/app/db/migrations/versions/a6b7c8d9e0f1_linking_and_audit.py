"""session auth-time, security audit events, and link_email challenge purpose

Revision ID: a6b7c8d9e0f1
Revises: f4a5b6c7d8e9
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # when the session last actually authenticated (not just refreshed) — powers
    # the recent-auth gate on sensitive actions. backfill existing sessions to
    # their creation time.
    op.add_column(
        "refresh_tokens", sa.Column("authenticated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute("UPDATE refresh_tokens SET authenticated_at = created_at WHERE authenticated_at IS NULL")

    # allow email to be added to an existing account as a link challenge
    op.drop_constraint(op.f("ck_email_challenges_purpose_known"), "email_challenges", type_="check")
    op.create_check_constraint(
        op.f("ck_email_challenges_purpose_known"),
        "email_challenges",
        "purpose IN ('register', 'reset', 'link_email')",
    )

    op.create_table(
        "security_audit_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("ip_hash", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_security_audit_events_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_security_audit_events")),
    )
    op.create_index(
        "ix_security_audit_events_user_created",
        "security_audit_events",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_security_audit_events_user_created", table_name="security_audit_events")
    op.drop_table("security_audit_events")
    op.drop_constraint(op.f("ck_email_challenges_purpose_known"), "email_challenges", type_="check")
    op.create_check_constraint(
        op.f("ck_email_challenges_purpose_known"),
        "email_challenges",
        "purpose IN ('register', 'reset')",
    )
    op.drop_column("refresh_tokens", "authenticated_at")

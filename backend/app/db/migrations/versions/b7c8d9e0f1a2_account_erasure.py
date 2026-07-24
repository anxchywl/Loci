"""add account erasure state and durable media cleanup

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a6b7c8d9e0f1"
branch_labels: Union[str, list[str], None] = None
depends_on: Union[str, list[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("erased_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_erased_at", "users", ["erased_at"])
    op.create_table(
        "media_deletion_jobs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key"),
    )
    op.create_index(
        "ix_media_deletion_jobs_next_attempt_at",
        "media_deletion_jobs",
        ["next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_media_deletion_jobs_next_attempt_at", table_name="media_deletion_jobs")
    op.drop_table("media_deletion_jobs")
    op.drop_index("ix_users_erased_at", table_name="users")
    op.drop_column("users", "erased_at")

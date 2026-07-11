"""admin dashboard, user restrictions, and session metadata

Revision ID: 7c8d9e0f1a2b
Revises: a1b2c3d4e5f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7c8d9e0f1a2b"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("is_blocked", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("blocked_reason", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("blocked_by", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_users_blocked_by_users", "users", "users", ["blocked_by"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_users_last_active_at", "users", ["last_active_at"])
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"])
    op.create_index("ix_users_username_lower", "users", [sa.text("lower(username)")], postgresql_using="btree")
    op.create_index("ix_users_first_name_lower", "users", [sa.text("lower(first_name)")], postgresql_using="btree")
    op.create_index("ix_users_last_name_lower", "users", [sa.text("lower(last_name)")], postgresql_using="btree")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE INDEX ix_users_username_trgm ON users USING gin (lower(username) gin_trgm_ops)")
    op.execute("CREATE INDEX ix_users_first_name_trgm ON users USING gin (lower(first_name) gin_trgm_ops)")
    op.execute("CREATE INDEX ix_users_last_name_trgm ON users USING gin (lower(last_name) gin_trgm_ops)")

    op.add_column("refresh_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.add_column("refresh_tokens", sa.Column("user_agent_summary", sa.Text(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("device_type", sa.Text(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("browser", sa.Text(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("operating_system", sa.Text(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("ip_hash", sa.Text(), nullable=True))

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("admin_id", sa.BigInteger(), nullable=False),
        sa.Column("target_user_id", sa.BigInteger(), nullable=True),
        sa.Column("target_story_id", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["admin_id"])
    op.create_index("ix_audit_logs_target_user_id", "audit_logs", ["target_user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    op.create_table(
        "user_moderation_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("admin_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_moderation_logs_user_created", "user_moderation_logs", ["user_id", "created_at"])

    op.execute("""
    CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs is append-only';
    END;
    $$ LANGUAGE plpgsql;
    """)
    op.execute("""
    CREATE TRIGGER audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation()")
    op.drop_index("ix_user_moderation_logs_user_created", table_name="user_moderation_logs")
    op.drop_table("user_moderation_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_table("audit_logs")
    for column in ("ip_hash", "operating_system", "browser", "device_type", "user_agent_summary", "last_used_at"):
        op.drop_column("refresh_tokens", column)
    op.execute("DROP INDEX IF EXISTS ix_users_username_trgm")
    op.execute("DROP INDEX IF EXISTS ix_users_first_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_users_last_name_trgm")
    op.drop_index("ix_users_last_name_lower", table_name="users")
    op.drop_index("ix_users_first_name_lower", table_name="users")
    op.drop_index("ix_users_username_lower", table_name="users")
    op.drop_index("ix_users_deleted_at", table_name="users")
    op.drop_index("ix_users_last_active_at", table_name="users")
    op.drop_constraint("fk_users_blocked_by_users", "users", type_="foreignkey")
    for column in ("deleted_at", "blocked_by", "blocked_reason", "blocked_at", "is_blocked", "last_active_at"):
        op.drop_column("users", column)

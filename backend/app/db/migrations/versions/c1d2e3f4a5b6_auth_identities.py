"""provider-independent auth identities

Separates the Loci account (users.id) from the credential used to sign in. Adds
the auth_identities table and a provider-independent users.is_admin flag, then
backfills one telegram identity for every existing user without touching users.id
or any content ownership. Admin authorization still reads ADMIN_TELEGRAM_IDS in
this phase; the is_admin column is populated and made authoritative in phase 2.

Revision ID: c1d2e3f4a5b6
Revises: a8b9c0d1e2f3
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import context, op

from app.db.identity_backfill import TELEGRAM_IDENTITY_BACKFILL_SQL

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _scalar(conn, sql: str) -> int:
    return int(conn.execute(sa.text(sql)).scalar_one())


def upgrade() -> None:
    conn = op.get_bind()
    offline = context.is_offline_mode()

    users_with_telegram = None
    if not offline:
        # pre-migration validation requires a live connection
        duplicate_telegram_ids = _scalar(
            conn,
            "SELECT count(*) FROM (SELECT telegram_id FROM users "
            "WHERE telegram_id IS NOT NULL GROUP BY telegram_id HAVING count(*) > 1) d",
        )
        if duplicate_telegram_ids:
            raise RuntimeError(
                f"aborting: {duplicate_telegram_ids} duplicate telegram_id(s) in users"
            )
        users_with_telegram = _scalar(
            conn, "SELECT count(*) FROM users WHERE telegram_id IS NOT NULL"
        )

    op.add_column(
        "users",
        sa.Column(
            "is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )

    op.create_table(
        "auth_identities",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_issuer", sa.Text(), nullable=True),
        sa.Column("provider_subject", sa.Text(), nullable=False),
        sa.Column("verified_email", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "last_used_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "provider IN ('telegram', 'google', 'email')",
            name=op.f("ck_auth_identities_provider_known"),
        ),
        sa.CheckConstraint(
            "(provider = 'google') = (provider_issuer IS NOT NULL)",
            name=op.f("ck_auth_identities_issuer_only_for_google"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_identities_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_identities")),
        sa.UniqueConstraint(
            "user_id", "provider", name="uq_auth_identities_user_provider"
        ),
    )
    op.create_index(
        op.f("ix_auth_identities_user_id"), "auth_identities", ["user_id"], unique=False
    )
    op.create_index(
        "uq_auth_identities_telegram_subject",
        "auth_identities",
        ["provider", "provider_subject"],
        unique=True,
        postgresql_where=sa.text("provider = 'telegram'"),
    )
    op.create_index(
        "uq_auth_identities_email_subject",
        "auth_identities",
        ["provider", "provider_subject"],
        unique=True,
        postgresql_where=sa.text("provider = 'email'"),
    )
    op.create_index(
        "uq_auth_identities_google_issuer_subject",
        "auth_identities",
        ["provider_issuer", "provider_subject"],
        unique=True,
        postgresql_where=sa.text("provider = 'google'"),
    )

    op.execute(TELEGRAM_IDENTITY_BACKFILL_SQL)

    if not offline:
        # post-migration validation requires a live connection
        telegram_identities = _scalar(
            conn, "SELECT count(*) FROM auth_identities WHERE provider = 'telegram'"
        )
        if telegram_identities != users_with_telegram:
            raise RuntimeError(
                "aborting: telegram identity count "
                f"({telegram_identities}) != users with telegram_id ({users_with_telegram})"
            )
        unmatched = _scalar(
            conn,
            "SELECT count(*) FROM auth_identities ai "
            "JOIN users u ON u.id = ai.user_id "
            "WHERE ai.provider = 'telegram' AND ai.provider_subject <> u.telegram_id::text",
        )
        if unmatched:
            raise RuntimeError(
                f"aborting: {unmatched} telegram identit(ies) do not match users.telegram_id"
            )


def downgrade() -> None:
    # safe only while no non-telegram identities exist; once a google/email-only
    # user is created, dropping this table orphans them — restore from the
    # pre-deploy dump instead of downgrading.
    op.drop_index(
        "uq_auth_identities_google_issuer_subject", table_name="auth_identities"
    )
    op.drop_index("uq_auth_identities_email_subject", table_name="auth_identities")
    op.drop_index("uq_auth_identities_telegram_subject", table_name="auth_identities")
    op.drop_index(op.f("ix_auth_identities_user_id"), table_name="auth_identities")
    op.drop_table("auth_identities")
    op.drop_column("users", "is_admin")

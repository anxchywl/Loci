"""protected primary sign-in method: the provider an account was created with

Unlinking may remove a secondary method but never the one the account was
created with, so that provider has to be recorded rather than inferred at
request time. Backfilled from each user's earliest auth identity; left NULL only
for users with no identity at all, where there is nothing to protect.

Revision ID: e1f2a3b4c5d6
Revises: c9d0e1f2a3b4
Create Date: 2026-08-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.primary_provider_backfill import PRIMARY_PROVIDER_BACKFILL_SQL

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("primary_provider", sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f("ck_users_primary_provider_known"),
        "users",
        "primary_provider IS NULL OR primary_provider IN ('telegram', 'google', 'email')",
    )
    op.execute(PRIMARY_PROVIDER_BACKFILL_SQL)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_users_primary_provider_known"), "users", type_="check")
    op.drop_column("users", "primary_provider")

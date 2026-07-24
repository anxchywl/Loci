"""make users.telegram_id nullable

Google- and email-only accounts have no Telegram id. By this phase resolution goes
through auth_identities (not the telegram_id column), notifications are null-safe,
and admin display tolerates a null, so relaxing the constraint is safe. The unique
constraint stays — PostgreSQL permits multiple NULLs.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "telegram_id", existing_type=sa.BigInteger(), nullable=True)


def downgrade() -> None:
    # fails if any non-telegram account exists (telegram_id IS NULL) — that is
    # correct: those accounts cannot satisfy a NOT NULL telegram_id
    op.alter_column("users", "telegram_id", existing_type=sa.BigInteger(), nullable=False)

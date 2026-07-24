"""backfill users.is_admin from the transitional ADMIN_TELEGRAM_IDS

One-time transition: snapshot the current Telegram-id admin allowlist into the
provider-independent users.is_admin flag so existing admins keep access when
authorization switches off the environment variable. After this, the env var is
no longer consulted on the request path; new admins are bootstrapped from
INITIAL_ADMIN_TELEGRAM_ID at first Telegram auth.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.config import get_settings

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    admin_ids = sorted(get_settings().admin_ids)
    if not admin_ids:
        return
    conn = op.get_bind()
    # ids are validated ints (frozenset[int]) so inlining is injection-safe and
    # avoids driver array-binding differences
    id_list = ",".join(str(i) for i in admin_ids)
    conn.execute(
        sa.text(f"UPDATE users SET is_admin = true WHERE telegram_id IN ({id_list})")
    )


def downgrade() -> None:
    # a data backfill cannot be reliably reversed (prior per-user is_admin state is
    # unknown); the column itself is dropped by the c1d2e3f4a5b6 downgrade
    pass

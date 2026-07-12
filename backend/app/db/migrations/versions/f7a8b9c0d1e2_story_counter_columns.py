"""story_counter_columns

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-12

Trending ordered by correlated count subqueries seq-scans every discoverable
story (measured 5.95 s over 1M rows). Denormalized reaction/comment counters
maintained by the repositories plus a partial expression index bring it to
~2 ms. The backfill runs in one statement; at current production size that is
instant, and for large datasets it should be run during a maintenance window.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stories",
        sa.Column("reaction_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "stories",
        sa.Column("comment_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        UPDATE stories s SET
          reaction_count = coalesce(r.c, 0),
          comment_count = coalesce(c.c, 0)
        FROM (SELECT id FROM stories) ids
        LEFT JOIN (SELECT story_id, count(*) c FROM reactions GROUP BY 1) r
          ON r.story_id = ids.id
        LEFT JOIN (SELECT story_id, count(*) c FROM comments WHERE NOT is_hidden GROUP BY 1) c
          ON c.story_id = ids.id
        WHERE s.id = ids.id
        """
    )
    with op.get_context().autocommit_block():
        op.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_stories_trending
            ON stories ((reaction_count + comment_count) DESC, created_at DESC)
            WHERE moderation_status = 'approved'
              AND visibility = 'public'
              AND is_hidden = false
            """
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_stories_trending")
    op.drop_column("stories", "comment_count")
    op.drop_column("stories", "reaction_count")

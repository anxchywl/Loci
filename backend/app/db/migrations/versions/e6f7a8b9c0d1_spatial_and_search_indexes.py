"""spatial_and_search_indexes

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-12

Nearby queries cast location_public to geography, which the geometry GiST
index cannot serve (measured 2.2 s over 1M rows without, 56 ms with a
functional geography index). Search uses ILIKE over title and body, which
needs trigram GIN indexes (measured 1.8 s -> 15 ms).
"""
from typing import Sequence, Union

from alembic import op


revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_stories_location_public_geog "
            "ON stories USING gist ((location_public::geography))"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_stories_title_trgm "
            "ON stories USING gin (title gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_stories_body_trgm "
            "ON stories USING gin (body gin_trgm_ops)"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_stories_body_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_stories_title_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_stories_location_public_geog")

"""story moderation

Revision ID: a1b2c3d4e5f6
Revises: f13829eb8bfe
Create Date: 2026-07-11 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f13829eb8bfe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


moderation_status = sa.Enum('pending', 'approved', 'rejected', name='moderation_status')


def upgrade() -> None:
    bind = op.get_bind()
    moderation_status.create(bind, checkfirst=True)

    # new stories default to pending so nothing goes public without review
    op.add_column(
        'stories',
        sa.Column(
            'moderation_status',
            moderation_status,
            server_default='pending',
            nullable=False,
        ),
    )
    op.add_column('stories', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column('stories', sa.Column('moderated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('stories', sa.Column('moderated_by', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        op.f('fk_stories_moderated_by_users'),
        'stories',
        'users',
        ['moderated_by'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_stories_moderation_status_created_at',
        'stories',
        ['moderation_status', 'created_at'],
        unique=False,
    )

    # stories that existed before moderation were already public — grandfather them in
    op.execute("UPDATE stories SET moderation_status = 'approved'")


def downgrade() -> None:
    op.drop_index('ix_stories_moderation_status_created_at', table_name='stories')
    op.drop_constraint(op.f('fk_stories_moderated_by_users'), 'stories', type_='foreignkey')
    op.drop_column('stories', 'moderated_by')
    op.drop_column('stories', 'moderated_at')
    op.drop_column('stories', 'rejection_reason')
    op.drop_column('stories', 'moderation_status')
    moderation_status.drop(op.get_bind(), checkfirst=True)

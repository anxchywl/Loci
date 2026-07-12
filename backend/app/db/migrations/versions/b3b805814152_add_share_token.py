"""add_share_token

Revision ID: b3b805814152
Revises: b2c3d4e5f6a7
Create Date: 2026-07-12 15:49:44.016786

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3b805814152'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import secrets
    op.add_column('stories', sa.Column('share_token', sa.String(length=32), nullable=True))
    
    from alembic import context
    if not context.is_offline_mode():
        bind = op.get_bind()
        stories = bind.execute(sa.text("SELECT id FROM stories")).fetchall()
        for row in stories:
            token = secrets.token_urlsafe(16)
            bind.execute(
                sa.text("UPDATE stories SET share_token = :token WHERE id = :id"),
                {"token": token, "id": row[0]}
            )
        
    op.alter_column('stories', 'share_token', nullable=False)
    op.create_index(op.f('ix_stories_share_token'), 'stories', ['share_token'], unique=True)

def downgrade() -> None:
    op.drop_index(op.f('ix_stories_share_token'), table_name='stories')
    op.drop_column('stories', 'share_token')

import uuid

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Reaction, Story


async def _bump_reaction_count(db: AsyncSession, story_id: uuid.UUID, delta: int) -> None:
    # update atomically and prevent counter underflow
    await db.execute(
        update(Story)
        .where(Story.id == story_id)
        .values(reaction_count=func.greatest(Story.reaction_count + delta, 0))
    )


async def add(db: AsyncSession, story_id: uuid.UUID, user_id: int) -> None:
    stmt = (
        postgres_insert(Reaction)
        .values(story_id=story_id, user_id=user_id, type="heart")
        .on_conflict_do_nothing(index_elements=[Reaction.story_id, Reaction.user_id])
        .returning(Reaction.story_id)
    )
    inserted = (await db.execute(stmt)).scalar_one_or_none() is not None
    if inserted:
        await _bump_reaction_count(db, story_id, 1)
    await db.flush()


async def remove(db: AsyncSession, story_id: uuid.UUID, user_id: int) -> None:
    result = await db.execute(
        sql_delete(Reaction).where(Reaction.story_id == story_id, Reaction.user_id == user_id)
    )
    if result.rowcount > 0:
        await _bump_reaction_count(db, story_id, -1)
    await db.flush()

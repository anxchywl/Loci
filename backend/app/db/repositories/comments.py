import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Comment, Story, User

COMMENT_READ_COLUMNS = (
    Comment.id,
    Comment.body,
    Comment.created_at,
    Comment.author_id,
    User.username.label("author_username"),
    User.first_name.label("author_first_name"),
    User.photo_url.label("author_photo_url"),
)


async def _bump_comment_count(db: AsyncSession, story_id: uuid.UUID, delta: int) -> None:
    # only visible comments contribute to the public counter
    await db.execute(
        update(Story)
        .where(Story.id == story_id)
        .values(comment_count=func.greatest(Story.comment_count + delta, 0))
    )


async def create(db: AsyncSession, *, story_id: uuid.UUID, author_id: int, body: str) -> Comment:
    comment = Comment(story_id=story_id, author_id=author_id, body=body)
    db.add(comment)
    await _bump_comment_count(db, story_id, 1)
    await db.flush()
    return comment


async def get(db: AsyncSession, comment_id: uuid.UUID) -> Comment | None:
    return await db.get(Comment, comment_id)


async def get_row(db: AsyncSession, comment_id: uuid.UUID):
    result = await db.execute(
        select(*COMMENT_READ_COLUMNS)
        .outerjoin(User, User.id == Comment.author_id)
        .where(Comment.id == comment_id)
    )
    return result.mappings().one_or_none()


async def list_for_story(db: AsyncSession, story_id: uuid.UUID, limit: int):
    result = await db.execute(
        select(*COMMENT_READ_COLUMNS)
        .outerjoin(User, User.id == Comment.author_id)
        .where(Comment.story_id == story_id, Comment.is_hidden.is_(False))
        .order_by(Comment.created_at)
        .limit(limit)
    )
    return result.mappings().all()


async def delete(db: AsyncSession, comment: Comment) -> None:
    if not comment.is_hidden:
        await _bump_comment_count(db, comment.story_id, -1)
    await db.delete(comment)
    await db.flush()


async def set_hidden(db: AsyncSession, comment_id: uuid.UUID, hidden: bool) -> None:
    comment = await db.get(Comment, comment_id)
    if comment is None or comment.is_hidden == hidden:
        return
    comment.is_hidden = hidden
    await _bump_comment_count(db, comment.story_id, -1 if hidden else 1)
    await db.flush()

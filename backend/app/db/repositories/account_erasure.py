import uuid
from datetime import datetime

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AuthIdentity,
    Bookmark,
    Comment,
    EmailChallenge,
    MediaDeletionJob,
    PasswordCredential,
    Reaction,
    RefreshToken,
    Report,
    SecurityAuditEvent,
    Story,
    StoryPhoto,
    User,
)


async def erase_user(db: AsyncSession, user_id: int, now: datetime) -> list[uuid.UUID]:
    user = (
        await db.execute(select(User).where(User.id == user_id).with_for_update())
    ).scalar_one()

    session_ids = list(
        (
            await db.execute(
                select(RefreshToken.session_id)
                .where(RefreshToken.user_id == user_id)
                .distinct()
            )
        ).scalars()
    )
    email_rows = await db.execute(
        select(AuthIdentity.verified_email).where(
            AuthIdentity.user_id == user_id,
            AuthIdentity.provider == "email",
            AuthIdentity.verified_email.is_not(None),
        )
    )
    emails = {email for email in email_rows.scalars() if email}

    photo_rows = await db.execute(
        select(StoryPhoto.object_key, StoryPhoto.thumb_key)
        .join(Story, Story.id == StoryPhoto.story_id)
        .where(Story.author_id == user_id)
    )
    object_keys: set[str] = set()
    for row in photo_rows:
        object_keys.update(key for key in (row.object_key, row.thumb_key) if key)
        base = row.object_key.rsplit("/", 1)[0]
        object_keys.update(
            f"{base}/original.{extension}"
            for extension in ("jpg", "png", "webp", "heic")
        )
    if object_keys:
        await db.execute(
            insert(MediaDeletionJob)
            .values([{"object_key": key} for key in object_keys])
            .on_conflict_do_nothing(index_elements=[MediaDeletionJob.object_key])
        )

    comment_counts = (
        await db.execute(
            select(Comment.story_id, func.count().label("count"))
            .join(Story, Story.id == Comment.story_id)
            .where(Comment.author_id == user_id, Story.author_id != user_id)
            .group_by(Comment.story_id)
        )
    ).all()
    reaction_counts = (
        await db.execute(
            select(Reaction.story_id, func.count().label("count"))
            .join(Story, Story.id == Reaction.story_id)
            .where(Reaction.user_id == user_id, Story.author_id != user_id)
            .group_by(Reaction.story_id)
        )
    ).all()

    await db.execute(delete(Report).where(Report.reporter_id == user_id))
    await db.execute(delete(Comment).where(Comment.author_id == user_id))
    await db.execute(delete(Reaction).where(Reaction.user_id == user_id))
    await db.execute(delete(Bookmark).where(Bookmark.user_id == user_id))
    await db.execute(delete(Story).where(Story.author_id == user_id))

    for story_id, count in comment_counts:
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(comment_count=func.greatest(Story.comment_count - count, 0))
        )
    for story_id, count in reaction_counts:
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(reaction_count=func.greatest(Story.reaction_count - count, 0))
        )

    challenge_filter = EmailChallenge.user_id == user_id
    if emails:
        challenge_filter = or_(challenge_filter, EmailChallenge.email.in_(emails))
    await db.execute(delete(EmailChallenge).where(challenge_filter))
    await db.execute(delete(SecurityAuditEvent).where(SecurityAuditEvent.user_id == user_id))
    await db.execute(delete(PasswordCredential).where(PasswordCredential.user_id == user_id))
    await db.execute(delete(AuthIdentity).where(AuthIdentity.user_id == user_id))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))

    user.telegram_id = None
    user.username = None
    user.first_name = None
    user.last_name = None
    user.language_code = None
    user.photo_url = None
    user.last_active_at = None
    user.is_admin = False
    user.is_blocked = False
    user.blocked_at = None
    user.blocked_reason = None
    user.blocked_by = None
    user.deleted_at = now
    user.erased_at = now
    await db.flush()
    return session_ids

import uuid
from datetime import date, datetime

from geoalchemy2 import Geography
from sqlalchemy import Select, and_, cast, false, func, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Bookmark, Reaction, Story, StoryVisibility, User
from app.db.models.story import LocationPrecision, ModerationStatus

# location_exact is never selected on any read path; when precision is exact the
# public column already holds the same point
STORY_READ_COLUMNS = (
    Story.id,
    Story.share_token,
    Story.author_id,
    Story.category_id,
    Story.title,
    Story.body,
    Story.happened_on,
    Story.is_anonymous,
    Story.visibility,
    Story.location_precision,
    Story.moderation_status,
    Story.rejection_reason,
    Story.created_at,
    func.ST_Y(Story.location_public).label("lat"),
    func.ST_X(Story.location_public).label("lon"),
    User.username.label("author_username"),
    User.first_name.label("author_first_name"),
    User.photo_url.label("author_photo_url"),
)


def _counts(viewer_id: int | None):
    # stored counters avoid per-row aggregation on discovery reads
    reactions = Story.reaction_count.label("reaction_count")
    comments = Story.comment_count.label("comment_count")
    if viewer_id is None:
        return (
            reactions,
            comments,
            false().label("viewer_reacted"),
            false().label("viewer_bookmarked"),
        )

    reacted = (
        select(func.count() > 0)
        .select_from(Reaction)
        .where(and_(Reaction.story_id == Story.id, Reaction.user_id == viewer_id))
        .correlate(Story)
        .scalar_subquery()
        .label("viewer_reacted")
    )
    bookmarked = (
        select(func.count() > 0)
        .select_from(Bookmark)
        .where(and_(Bookmark.story_id == Story.id, Bookmark.user_id == viewer_id))
        .correlate(Story)
        .scalar_subquery()
        .label("viewer_bookmarked")
    )
    return reactions, comments, reacted, bookmarked


# a story is publicly discoverable only once an admin has approved it, it is
# public, and it has not been auto-hidden by reports. This single predicate gates
# the map, nearby, bbox, trending, search and every other public read path.
_DISCOVERABLE = and_(
    Story.moderation_status == ModerationStatus.approved,
    Story.visibility == StoryVisibility.public,
    Story.is_hidden.is_(False),
)


def _visible_to(viewer_id: int | None):
    # public reads see only approved+public stories; an author additionally sees
    # their own story at any moderation status (so My Stories can show pending and
    # rejected ones), but a story auto-hidden by reports stays hidden even from its
    # author until an admin acts, and other people's private/pending stay invisible.
    if viewer_id is None:
        return _DISCOVERABLE
    return or_(_DISCOVERABLE, and_(Story.author_id == viewer_id, Story.is_hidden.is_(False)))


def _base_select(viewer_id: int | None) -> Select:
    reactions, comments, reacted, bookmarked = _counts(viewer_id)
    return (
        select(*STORY_READ_COLUMNS, reactions, comments, reacted, bookmarked)
        .outerjoin(User, User.id == Story.author_id)
        .where(_visible_to(viewer_id))
    )


def _discoverable_select(viewer_id: int | None) -> Select:
    # public discovery surfaces (map/search/trending) never leak an author's own
    # pending or rejected stories, so they always use the strict predicate.
    reactions, comments, reacted, bookmarked = _counts(viewer_id)
    return (
        select(*STORY_READ_COLUMNS, reactions, comments, reacted, bookmarked)
        .outerjoin(User, User.id == Story.author_id)
        .where(_DISCOVERABLE)
    )


async def create(
    db: AsyncSession,
    *,
    author_id: int,
    category_id: int,
    title: str,
    body: str,
    happened_on: date | None,
    is_anonymous: bool,
    visibility: StoryVisibility,
    precision: LocationPrecision,
    exact_lat: float,
    exact_lon: float,
    moderation_status: ModerationStatus = ModerationStatus.pending,
) -> uuid.UUID:
    import secrets
    story = Story(
        share_token=secrets.token_urlsafe(16),
        author_id=author_id,
        category_id=category_id,
        title=title,
        body=body,
        happened_on=happened_on,
        is_anonymous=is_anonymous,
        visibility=visibility,
        moderation_status=moderation_status,
        location_precision=precision,
        location_exact=func.ST_SetSRID(func.ST_MakePoint(exact_lon, exact_lat), 4326),
        location_public=func.ST_SetSRID(func.ST_MakePoint(exact_lon, exact_lat), 4326),
    )
    db.add(story)
    await db.flush()
    return story.id


async def set_public_point(db: AsyncSession, story_id: uuid.UUID, lat: float, lon: float) -> None:
    story = await db.get(Story, story_id)
    assert story is not None
    story.location_public = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    await db.flush()


async def get_owned(db: AsyncSession, story_id: uuid.UUID, author_id: int) -> Story | None:
    story = await db.get(Story, story_id)
    if story is None or story.author_id != author_id:
        return None
    return story


async def get_owned_any(db: AsyncSession, story_id: uuid.UUID) -> Story | None:
    """Load a story ignoring visibility — for admin/notification code paths only."""
    return await db.get(Story, story_id)


async def get_for_viewer(db: AsyncSession, story_id: uuid.UUID, viewer_id: int | None):
    stmt = _base_select(viewer_id).where(Story.id == story_id)
    return (await db.execute(stmt)).mappings().one_or_none()


async def get_by_share_token_discoverable(db: AsyncSession, share_token: str):
    stmt = (
        select(Story.id, Story.title, Story.body, Story.category_id)
        .where(Story.share_token == share_token)
        .where(_DISCOVERABLE)
    )
    return (await db.execute(stmt)).mappings().one_or_none()


async def list_nearby(
    db: AsyncSession,
    *,
    viewer_id: int | None,
    lat: float,
    lon: float,
    radius_meters: int,
    category_id: int | None,
    limit: int,
):
    point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    # geography cast makes the radius metric and wraps the antimeridian correctly
    story_geog = cast(Story.location_public, Geography)
    point_geog = cast(point, Geography)
    stmt = _discoverable_select(viewer_id).where(func.ST_DWithin(story_geog, point_geog, radius_meters))
    if category_id is not None:
        stmt = stmt.where(Story.category_id == category_id)
    stmt = stmt.order_by(func.ST_Distance(story_geog, point_geog)).limit(limit)
    return (await db.execute(stmt)).mappings().all()


def _normalize_lon(lon: float) -> float:
    return ((lon + 180.0) % 360.0) - 180.0


def _bbox_condition(min_lat: float, min_lon: float, max_lat: float, max_lon: float):
    """build an antimeridian-safe viewport predicate"""
    if max_lon - min_lon >= 360.0:
        min_lon, max_lon = -180.0, 180.0
    else:
        min_lon = _normalize_lon(min_lon)
        max_lon = _normalize_lon(max_lon)
    if min_lon <= max_lon:
        envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        return func.ST_Intersects(Story.location_public, envelope)
    west = func.ST_MakeEnvelope(min_lon, min_lat, 180.0, max_lat, 4326)
    east = func.ST_MakeEnvelope(-180.0, min_lat, max_lon, max_lat, 4326)
    return or_(
        func.ST_Intersects(Story.location_public, west),
        func.ST_Intersects(Story.location_public, east),
    )


async def list_in_bbox(
    db: AsyncSession,
    *,
    viewer_id: int | None,
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    category_id: int | None,
    limit: int,
):
    stmt = _discoverable_select(viewer_id).where(
        _bbox_condition(min_lat, min_lon, max_lat, max_lon)
    )
    if category_id is not None:
        stmt = stmt.where(Story.category_id == category_id)
    stmt = stmt.order_by(Story.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).mappings().all()


async def list_pins_in_bbox(
    db: AsyncSession,
    *,
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    category_id: int | None,
    limit: int,
):
    """fetch only fields rendered by map markers"""
    stmt = (
        select(
            Story.id,
            Story.category_id,
            func.ST_Y(Story.location_public).label("lat"),
            func.ST_X(Story.location_public).label("lon"),
        )
        .where(_DISCOVERABLE)
        .where(_bbox_condition(min_lat, min_lon, max_lat, max_lon))
    )
    if category_id is not None:
        stmt = stmt.where(Story.category_id == category_id)
    stmt = stmt.order_by(Story.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).mappings().all()


async def aggregate_pins_in_bbox(
    db: AsyncSession,
    *,
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    cell_degrees: float,
    category_id: int | None,
):
    """aggregate low-zoom markers without truncating counts"""
    cell = func.ST_SnapToGrid(Story.location_public, cell_degrees)
    centroid = func.ST_Centroid(func.ST_Collect(Story.location_public))
    stmt = (
        select(
            func.ST_Y(centroid).label("lat"),
            func.ST_X(centroid).label("lon"),
            func.count().label("count"),
        )
        .where(_DISCOVERABLE)
        .where(_bbox_condition(min_lat, min_lon, max_lat, max_lon))
        .group_by(cell)
    )
    if category_id is not None:
        stmt = stmt.where(Story.category_id == category_id)
    return (await db.execute(stmt)).mappings().all()


async def list_trending(db: AsyncSession, *, viewer_id: int | None, limit: int):
    reactions, comments, reacted, bookmarked = _counts(viewer_id)
    stmt = (
        select(*STORY_READ_COLUMNS, reactions, comments, reacted, bookmarked)
        .outerjoin(User, User.id == Story.author_id)
        .where(_DISCOVERABLE)
        # preserve the trending index order
        .order_by((Story.reaction_count + Story.comment_count).desc(), Story.created_at.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).mappings().all()


async def search(db: AsyncSession, *, viewer_id: int | None, query: str, limit: int):
    # query is passed as a bound parameter (never string-interpolated into SQL);
    # LIKE metacharacters are escaped so user input matches literally.
    from app.core.security.text import escape_like

    pattern = f"%{escape_like(query)}%"
    stmt = (
        _discoverable_select(viewer_id)
        .where(
            or_(
                Story.title.ilike(pattern, escape="\\"),
                Story.body.ilike(pattern, escape="\\"),
            )
        )
        .order_by(Story.created_at.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).mappings().all()


async def list_by_author(
    db: AsyncSession,
    *,
    author_id: int,
    viewer_id: int | None,
    limit: int,
    include_anonymous: bool = False,
):
    stmt = _base_select(viewer_id).where(Story.author_id == author_id)
    # a user's anonymous stories are listed only on their own profile
    if not include_anonymous:
        stmt = stmt.where(Story.is_anonymous.is_(False))
    stmt = stmt.order_by(Story.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).mappings().all()


async def list_bookmarked(db: AsyncSession, *, viewer_id: int, limit: int):
    stmt = (
        _base_select(viewer_id)
        .join(Bookmark, Bookmark.story_id == Story.id)
        .where(Bookmark.user_id == viewer_id)
        .order_by(Bookmark.created_at.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).mappings().all()


async def delete(db: AsyncSession, story: Story) -> None:
    await db.delete(story)
    await db.flush()


async def count_by_author_since(db: AsyncSession, author_id: int, since) -> int:
    stmt = (
        select(func.count())
        .select_from(Story)
        .where(and_(Story.author_id == author_id, Story.created_at >= since))
    )
    return (await db.execute(stmt)).scalar_one()


async def lock_author_for_story_creation(db: AsyncSession, author_id: int) -> None:
    await db.execute(select(func.pg_advisory_xact_lock(author_id)))


async def set_hidden(db: AsyncSession, story_id: uuid.UUID, hidden: bool) -> None:
    story = await db.get(Story, story_id)
    if story is not None:
        story.is_hidden = hidden
        await db.flush()


async def auto_hide_for_reports(db: AsyncSession, story_id: uuid.UUID, now: datetime) -> bool:
    """Hide a story because it crossed the report threshold, stamping when it
    happened. Only acts on a currently-visible story, so the timestamp reflects
    the first auto-hide and a later report can't reset it. Returns True if it
    transitioned from visible to hidden."""
    stmt = (
        update(Story)
        .where(Story.id == story_id, Story.is_hidden.is_(False))
        .values(is_hidden=True, auto_hidden_at=now)
    )
    return (await db.execute(stmt)).rowcount > 0


async def restore_from_reports(db: AsyncSession, story_id: uuid.UUID) -> bool:
    """Admin restore: make a reported/auto-hidden story visible again and clear
    the auto-hide marker. Atomic UPDATE so two admins can't both 'win'."""
    stmt = (
        update(Story)
        .where(Story.id == story_id)
        .values(is_hidden=False, auto_hidden_at=None)
    )
    return (await db.execute(stmt)).rowcount > 0


# --- moderation ---------------------------------------------------------------

_QUEUE_COLUMNS = (
    Story.id,
    Story.share_token,
    Story.author_id,
    Story.category_id,
    Story.title,
    Story.body,
    Story.happened_on,
    Story.is_anonymous,
    Story.visibility,
    Story.location_precision,
    Story.moderation_status,
    Story.created_at,
    func.ST_Y(Story.location_public).label("lat"),
    func.ST_X(Story.location_public).label("lon"),
    User.username.label("author_username"),
    User.first_name.label("author_first_name"),
    User.photo_url.label("author_photo_url"),
)


async def list_for_moderation(
    db: AsyncSession,
    *,
    status: ModerationStatus,
    limit: int,
    after: tuple[datetime, uuid.UUID] | None,
):
    """Keyset-paginated queue, oldest first. Keyset (created_at, id) is stable
    even as rows are approved/rejected out from under a paging admin."""
    stmt = (
        select(*_QUEUE_COLUMNS)
        .outerjoin(User, User.id == Story.author_id)
        .where(Story.moderation_status == status)
    )
    if after is not None:
        stmt = stmt.where(tuple_(Story.created_at, Story.id) > after)
    stmt = stmt.order_by(Story.created_at.asc(), Story.id.asc()).limit(limit)
    return (await db.execute(stmt)).mappings().all()


async def approve(db: AsyncSession, story_id: uuid.UUID, admin_id: int) -> bool:
    """Atomic pending -> approved. Returns False if the story was already
    moderated (or gone), which prevents a double / racing approval."""
    stmt = (
        update(Story)
        .where(
            Story.id == story_id,
            Story.moderation_status == ModerationStatus.pending,
        )
        .values(
            moderation_status=ModerationStatus.approved,
            rejection_reason=None,
            moderated_by=admin_id,
            moderated_at=func.now(),
        )
        .returning(Story.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def reject(db: AsyncSession, story_id: uuid.UUID, admin_id: int, reason: str | None) -> bool:
    """Atomic pending -> rejected with optional moderation feedback."""
    stmt = (
        update(Story)
        .where(
            Story.id == story_id,
            Story.moderation_status == ModerationStatus.pending,
        )
        .values(
            moderation_status=ModerationStatus.rejected,
            rejection_reason=reason,
            moderated_by=admin_id,
            moderated_at=func.now(),
        )
        .returning(Story.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def resubmit(db: AsyncSession, story_id: uuid.UUID, author_id: int) -> bool:
    """Atomic rejected -> pending by the owner. Returns False if the story is
    not the caller's, not currently rejected, or gone."""
    stmt = (
        update(Story)
        .where(
            Story.id == story_id,
            Story.author_id == author_id,
            Story.moderation_status == ModerationStatus.rejected,
        )
        .values(
            moderation_status=ModerationStatus.pending,
            rejection_reason=None,
            moderated_by=None,
            moderated_at=None,
        )
        .returning(Story.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def apply_update(db: AsyncSession, story: Story, changes: dict) -> None:
    """Apply owner edits to a loaded story and send it back to review."""
    for field, value in changes.items():
        setattr(story, field, value)
    # any content edit re-enters moderation so changes are reviewed before going public
    story.moderation_status = ModerationStatus.pending
    story.rejection_reason = None
    story.moderated_by = None
    story.moderated_at = None
    await db.flush()

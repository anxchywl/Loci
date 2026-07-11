import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_optional_user, get_redis
from app.core.config import Settings, get_settings
from app.core.security.rate_limit import check_rate_limit, client_identifier
from app.core.security.text import clean_line
from app.db.models import User
from app.db.repositories import stories as stories_repo
from app.modules.stories import interactions, photos, service
from app.modules.stories.schemas import (
    CommentCreateRequest,
    CommentResponse,
    PhotoUploadRequest,
    PhotoUploadResponse,
    ReportCreateRequest,
    StoryCreateRequest,
    StoryResponse,
    StoryUpdateRequest,
)

router = APIRouter(prefix="/stories", tags=["stories"])

MAX_LIMIT = 100


@router.post("", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
async def create_story(
    payload: StoryCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StoryResponse:
    await check_rate_limit(
        redis, "rl:story", str(user.id), 86400, settings.story_create_per_day
    )
    return await service.create_story(db, user.id, payload, settings)


@router.get("/nearby", response_model=list[StoryResponse])
async def nearby(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    radius_meters: Annotated[int, Query(ge=1, le=50_000)] = 5000,
    category_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 50,
) -> list[StoryResponse]:
    rows = await stories_repo.list_nearby(
        db,
        viewer_id=viewer.id if viewer else None,
        lat=lat,
        lon=lon,
        radius_meters=radius_meters,
        category_id=category_id,
        limit=limit,
    )
    return [service.serialize_story(row) for row in rows]


@router.get("/bbox", response_model=list[StoryResponse])
async def in_bbox(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    min_lat: Annotated[float, Query(ge=-90, le=90)],
    min_lon: Annotated[float, Query(ge=-180, le=180)],
    max_lat: Annotated[float, Query(ge=-90, le=90)],
    max_lon: Annotated[float, Query(ge=-180, le=180)],
    category_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 100,
) -> list[StoryResponse]:
    rows = await stories_repo.list_in_bbox(
        db,
        viewer_id=viewer.id if viewer else None,
        min_lat=min_lat,
        min_lon=min_lon,
        max_lat=max_lat,
        max_lon=max_lon,
        category_id=category_id,
        limit=limit,
    )
    return [service.serialize_story(row) for row in rows]


@router.get("/trending", response_model=list[StoryResponse])
async def trending(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 20,
) -> list[StoryResponse]:
    rows = await stories_repo.list_trending(db, viewer_id=viewer.id if viewer else None, limit=limit)
    return [service.serialize_story(row) for row in rows]


@router.get("/search", response_model=list[StoryResponse])
async def search(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 30,
) -> list[StoryResponse]:
    identifier = str(viewer.id) if viewer else client_identifier(request, settings.trust_proxy_headers)
    await check_rate_limit(redis, "rl:search", identifier, 60, 30)

    # normalise before querying: trim, collapse whitespace, strip control/zero-width
    # characters. A query that is empty or too short after cleaning yields no rows
    # rather than an error, so "   " or a lone character never hits the database.
    q = clean_line(q)
    if len(q) < 2:
        return []
    rows = await stories_repo.search(
        db, viewer_id=viewer.id if viewer else None, query=q, limit=limit
    )
    return [service.serialize_story(row) for row in rows]


@router.get("/{story_id}", response_model=StoryResponse)
async def get_story(
    story_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StoryResponse:
    return await service.get_story(db, story_id, viewer.id if viewer else None, settings)


@router.patch("/{story_id}", response_model=StoryResponse)
async def update_story(
    story_id: uuid.UUID,
    payload: StoryUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StoryResponse:
    return await service.update_story(db, story_id, user.id, payload, settings)


@router.post("/{story_id}/resubmit", response_model=StoryResponse)
async def resubmit_story(
    story_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StoryResponse:
    return await service.resubmit_story(db, story_id, user.id, settings)


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(
    story_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    await service.delete_story(db, story_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{story_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    story_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 50,
) -> list[CommentResponse]:
    return await service.list_comments(db, story_id, viewer.id if viewer else None, limit)


@router.post("/{story_id}/comments", response_model=CommentResponse, status_code=201)
async def add_comment(
    story_id: uuid.UUID,
    payload: CommentCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CommentResponse:
    await check_rate_limit(
        redis, "rl:comment", str(user.id), 60, settings.comments_per_minute
    )
    return await service.add_comment(db, story_id, user.id, payload.body)


@router.post("/{story_id}/reactions", status_code=status.HTTP_204_NO_CONTENT)
async def react(
    story_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await check_rate_limit(redis, "rl:react", str(user.id), 60, settings.reactions_per_minute)
    await interactions.react(db, story_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{story_id}/reactions", status_code=status.HTTP_204_NO_CONTENT)
async def unreact(
    story_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await check_rate_limit(redis, "rl:react", str(user.id), 60, settings.reactions_per_minute)
    await interactions.unreact(db, story_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{story_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
async def bookmark(
    story_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await check_rate_limit(redis, "rl:bookmark", str(user.id), 60, settings.reactions_per_minute)
    await interactions.bookmark(db, story_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{story_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
async def unbookmark(
    story_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await check_rate_limit(redis, "rl:bookmark", str(user.id), 60, settings.reactions_per_minute)
    await interactions.unbookmark(db, story_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{story_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_story(
    story_id: uuid.UUID,
    payload: ReportCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await check_rate_limit(redis, "rl:report", str(user.id), 86400, settings.reports_per_day)
    await interactions.report_story(db, story_id, user.id, payload.reason, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{story_id}/photos", response_model=PhotoUploadResponse, status_code=201)
async def create_photo_upload_url(
    story_id: uuid.UUID,
    payload: PhotoUploadRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PhotoUploadResponse:
    await check_rate_limit(redis, "rl:upload", str(user.id), 3600, settings.upload_urls_per_hour)
    return await photos.create_upload_url(db, story_id, user.id, payload.content_type, settings)


@router.post("/{story_id}/photos/{photo_id}/complete", status_code=status.HTTP_202_ACCEPTED)
async def complete_photo_upload(
    story_id: uuid.UUID,
    photo_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await check_rate_limit(redis, "rl:upload", str(user.id), 3600, settings.upload_urls_per_hour)
    await photos.complete_upload(db, story_id, photo_id, user.id, settings)
    return Response(status_code=status.HTTP_202_ACCEPTED)

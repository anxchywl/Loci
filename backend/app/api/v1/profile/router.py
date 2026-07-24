from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.db.models import User
from app.db.repositories import stories as stories_repo
from app.modules.auth.schemas import UserResponse
from app.modules.stories import service
from app.modules.stories.schemas import StoryResponse

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    response = UserResponse.model_validate(user)
    response.is_admin = user.is_admin
    return response


@router.get("/me/stories", response_model=list[StoryResponse])
async def my_stories(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[StoryResponse]:
    rows = await stories_repo.list_by_author(
        db, author_id=user.id, viewer_id=user.id, limit=limit, include_anonymous=True
    )
    # viewer_id == owner so each row carries its moderation status and, when
    # rejected, the reason — this is the My Stories screen
    return [service.serialize_story(row, viewer_id=user.id) for row in rows]


@router.get("/me/bookmarks", response_model=list[StoryResponse])
async def my_bookmarks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[StoryResponse]:
    rows = await stories_repo.list_bookmarked(db, viewer_id=user.id, limit=limit)
    return [service.serialize_story(row) for row in rows]

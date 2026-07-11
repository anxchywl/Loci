import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db_session
from app.core.config import Settings, get_settings
from app.db.models import User
from app.db.models.story import ModerationStatus
from app.modules import moderation
from app.modules.stories.schemas import ModerationQueueResponse, RejectRequest

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_QUEUE_LIMIT = 50


@router.get("/moderation/queue", response_model=ModerationQueueResponse)
async def moderation_queue(
    _admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    status_filter: Annotated[ModerationStatus, Query(alias="status")] = ModerationStatus.pending,
    limit: Annotated[int, Query(ge=1, le=MAX_QUEUE_LIMIT)] = 20,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> ModerationQueueResponse:
    return await moderation.list_queue(
        db, settings, status_filter=status_filter, limit=limit, cursor=cursor
    )


@router.post("/moderation/{story_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_story(
    story_id: uuid.UUID,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await moderation.approve(db, story_id, admin.id, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/moderation/{story_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_story(
    story_id: uuid.UUID,
    payload: RejectRequest,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    await moderation.reject(db, story_id, admin.id, payload.reason, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

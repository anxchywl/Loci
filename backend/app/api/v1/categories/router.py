import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.db.repositories import categories as categories_repo
from app.modules.stories.schemas import CategoryResponse

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    response: Response,
    if_none_match: Annotated[str | None, Header()] = None,
) -> list[CategoryResponse] | Response:
    categories = await categories_repo.list_all(db)
    payload = [CategoryResponse.model_validate(category) for category in categories]
    serialized = json.dumps(
        [category.model_dump(mode="json") for category in payload],
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    etag = f'"{hashlib.sha256(serialized).hexdigest()}"'
    cache_control = "public, max-age=86400, stale-while-revalidate=604800"
    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": cache_control},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_control
    return payload

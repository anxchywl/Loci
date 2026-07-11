from fastapi import APIRouter

from app.api.v1.admin.router import router as admin_router
from app.api.v1.auth.router import router as auth_router
from app.api.v1.categories.router import router as categories_router
from app.api.v1.comments.router import router as comments_router
from app.api.v1.profile.router import router as profile_router
from app.api.v1.stories.router import router as stories_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(categories_router)
api_v1_router.include_router(stories_router)
api_v1_router.include_router(comments_router)
api_v1_router.include_router(profile_router)
api_v1_router.include_router(admin_router)

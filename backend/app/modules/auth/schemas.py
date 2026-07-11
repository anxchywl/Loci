from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TelegramAuthRequest(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    photo_url: str | None
    language_code: str | None
    is_admin: bool = False


class TokenResponse(BaseModel):
    access_token: str
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime
    user: UserResponse


class RefreshResponse(BaseModel):
    access_token: str
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime

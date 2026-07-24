from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security.text import clean_line


class ProfileUpdate(BaseModel):
    # the name the user wants shown; canonicalized before persistence
    display_name: str = Field(min_length=1, max_length=50)

    @field_validator("display_name")
    @classmethod
    def _clean(cls, value: str) -> str:
        cleaned = clean_line(value)
        if not cleaned:
            raise ValueError("display name cannot be blank")
        return cleaned


class TelegramAuthRequest(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


# password bounds are validated in depth by core.security.password; Field caps the
# request size so an oversized body is rejected before hashing
class EmailRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class EmailVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class EmailResendRequest(BaseModel):
    email: EmailStr


class EmailLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class PasswordResetRequestBody(BaseModel):
    email: EmailStr


class PasswordResetConfirmBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=1, max_length=256)


class MessageResponse(BaseModel):
    detail: str


class AuthProvidersResponse(BaseModel):
    google: bool
    email: bool = True


class EmailLinkStartRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class EmailLinkVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class AccountErasureRequest(BaseModel):
    confirmation: Literal["DELETE MY ACCOUNT"]


class IdentitySummary(BaseModel):
    provider: str
    email: str | None
    created_at: datetime
    last_used_at: datetime


class SessionSummary(BaseModel):
    id: str
    current: bool
    active: bool
    created_at: datetime
    last_used_at: datetime
    device_type: str | None
    device_model: str | None = None
    browser: str | None
    browser_version: str | None = None
    operating_system: str | None
    os_version: str | None = None
    # the app was opened inside a native client's webview rather than a browser
    in_app: bool = False


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    display_name: str | None
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


class GoogleStartResponse(BaseModel):
    authorization_url: str

"""The user-chosen display name: settable, provider-proof, and shown on stories."""

import pytest

from tests.factories import build_init_data
from tests.test_stories_api import authenticate, story_payload

PROFILE = "/api/v1/profile/me"


async def test_set_display_name_updates_profile(client):
    await authenticate(client, telegram_id=1)
    resp = await client.patch(PROFILE, json={"display_name": "  Aru  M.  "})
    assert resp.status_code == 200
    # collapsed and trimmed, then echoed back
    assert resp.json()["display_name"] == "Aru M."
    assert (await client.get(PROFILE)).json()["display_name"] == "Aru M."


async def test_blank_display_name_is_rejected(client):
    await authenticate(client, telegram_id=1)
    assert (await client.patch(PROFILE, json={"display_name": "   "})).status_code == 422
    assert (await client.patch(PROFILE, json={"display_name": ""})).status_code == 422


async def test_display_name_removes_hidden_controls_but_keeps_literal_punctuation(client):
    await authenticate(client, telegram_id=1)
    resp = await client.patch(
        PROFILE,
        json={"display_name": "  Robert\u200b'); DROP TABLE users;--  "},
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Robert'); DROP TABLE users;--"


async def test_account_erasure_confirmation_rejects_whitespace_and_injection():
    from pydantic import ValidationError

    from app.modules.auth.schemas import AccountErasureRequest

    with pytest.raises(ValidationError):
        AccountErasureRequest(confirmation=" DELETE MY ACCOUNT ")
    with pytest.raises(ValidationError):
        AccountErasureRequest(confirmation="DELETE MY ACCOUNT'; DROP TABLE users;--")


async def test_display_name_survives_telegram_relogin(client):
    # telegram overwrites first_name on every login; the chosen name must not be
    # clobbered, since it lives in its own column
    await authenticate(client, telegram_id=1)
    await client.patch(PROFILE, json={"display_name": "Chosen"})
    await client.post(
        "/api/v1/auth/telegram", json={"init_data": build_init_data(telegram_id=1)}
    )
    me = (await client.get(PROFILE)).json()
    assert me["display_name"] == "Chosen"


async def test_story_author_reflects_display_name(client):
    await authenticate(client, telegram_id=1)
    await client.patch(PROFILE, json={"display_name": "Storyteller"})
    created = await client.post("/api/v1/stories", json=story_payload())
    assert created.status_code == 201
    author = created.json()["author"]
    assert author["display_name"] == "Storyteller"

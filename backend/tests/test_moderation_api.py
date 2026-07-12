"""End-to-end coverage for the moderation workflow and admin authorization."""
from tests.test_stories_api import authenticate, story_payload

ADMIN_TG = 999  # matches ADMIN_TELEGRAM_IDS in conftest


async def create_pending(client, telegram_id: int = 1, **overrides) -> str:
    await authenticate(client, telegram_id=telegram_id)
    resp = await client.post("/api/v1/stories", json=story_payload(**overrides))
    assert resp.status_code == 201
    body = resp.json()
    # a brand new story is always pending and never public
    assert body["moderation_status"] == "pending"
    return body["id"]


async def test_new_story_is_pending_and_not_discoverable(client):
    story_id = await create_pending(client, title="Hidden gem", body="findme please")

    # invisible on every public surface while pending
    assert (await client.get("/api/v1/stories/trending")).json() == []
    assert (await client.get("/api/v1/stories/search", params={"q": "findme"})).json() == []
    nearby = await client.get(
        "/api/v1/stories/nearby",
        params={"lat": 43.238949, "lon": 76.889709, "radius_meters": 5000},
    )
    assert nearby.json() == []

    # but the author sees it in My Stories with its status
    mine = (await client.get("/api/v1/profile/me/stories")).json()
    assert len(mine) == 1
    assert mine[0]["id"] == story_id
    assert mine[0]["moderation_status"] == "pending"


async def test_non_admin_cannot_access_moderation(client):
    await authenticate(client, telegram_id=1)
    assert (await client.get("/api/v1/admin/moderation/queue")).status_code == 403
    story_id = await create_pending(client)
    assert (
        await client.post(f"/api/v1/admin/moderation/{story_id}/approve")
    ).status_code == 403


async def test_moderation_requires_auth(client):
    resp = await client.get("/api/v1/admin/moderation/queue")
    assert resp.status_code == 401


async def test_admin_approve_makes_story_public(client):
    story_id = await create_pending(client, title="Aurora", body="northern findme")

    await authenticate(client, telegram_id=ADMIN_TG)
    # queue shows the pending story with its author revealed to the admin
    queue = (await client.get("/api/v1/admin/moderation/queue")).json()
    assert [item["id"] for item in queue["items"]] == [story_id]
    assert queue["items"][0]["author"]["id"] is not None

    assert (
        await client.post(f"/api/v1/admin/moderation/{story_id}/approve")
    ).status_code == 204

    # now discoverable to everyone
    await authenticate(client, telegram_id=2)
    assert len((await client.get("/api/v1/stories/search", params={"q": "findme"})).json()) == 1
    detail = (await client.get(f"/api/v1/stories/{story_id}")).json()
    assert detail["moderation_status"] == "approved"


async def test_double_approval_conflicts(client):
    story_id = await create_pending(client)
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (await client.post(f"/api/v1/admin/moderation/{story_id}/approve")).status_code == 204
    # a second moderation of the same story loses the race
    assert (await client.post(f"/api/v1/admin/moderation/{story_id}/approve")).status_code == 409
    assert (
        await client.post(
            f"/api/v1/admin/moderation/{story_id}/reject", json={"reason": "late"}
        )
    ).status_code == 409


async def test_reject_allows_optional_reason(client):
    story_id = await create_pending(client)
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (
        await client.post(f"/api/v1/admin/moderation/{story_id}/reject", json={})
    ).status_code == 204

    story_id = await create_pending(client)
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (
        await client.post(f"/api/v1/admin/moderation/{story_id}/reject", json={"reason": "   "})
    ).status_code == 204


async def test_rejection_reason_visible_to_owner_only(client):
    story_id = await create_pending(client, telegram_id=1)
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (
        await client.post(
            f"/api/v1/admin/moderation/{story_id}/reject",
            json={"reason": "Contains personal data"},
        )
    ).status_code == 204

    # owner sees the rejection and its reason in My Stories
    await authenticate(client, telegram_id=1)
    mine = (await client.get("/api/v1/profile/me/stories")).json()
    assert mine[0]["moderation_status"] == "rejected"
    assert mine[0]["rejection_reason"] == "Contains personal data"

    # a different user cannot see the story at all (never mind the reason)
    await authenticate(client, telegram_id=2)
    assert (await client.get(f"/api/v1/stories/{story_id}")).status_code == 404


async def test_owner_can_resubmit_rejected_story(client):
    story_id = await create_pending(client, telegram_id=1)
    await authenticate(client, telegram_id=ADMIN_TG)
    await client.post(
        f"/api/v1/admin/moderation/{story_id}/reject", json={"reason": "fix wording"}
    )

    await authenticate(client, telegram_id=1)
    resp = await client.post(f"/api/v1/stories/{story_id}/resubmit")
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "pending"
    assert resp.json()["rejection_reason"] is None

    # cannot resubmit again while pending
    assert (await client.post(f"/api/v1/stories/{story_id}/resubmit")).status_code == 409


async def test_non_owner_cannot_resubmit(client):
    story_id = await create_pending(client, telegram_id=1)
    await authenticate(client, telegram_id=ADMIN_TG)
    await client.post(f"/api/v1/admin/moderation/{story_id}/reject", json={"reason": "no"})

    await authenticate(client, telegram_id=2)
    assert (await client.post(f"/api/v1/stories/{story_id}/resubmit")).status_code == 409


async def test_editing_requeues_to_pending(client):
    story_id = await create_pending(client, telegram_id=1)
    await authenticate(client, telegram_id=ADMIN_TG)
    await client.post(f"/api/v1/admin/moderation/{story_id}/approve")

    # owner edits an approved story -> it goes back to pending review
    await authenticate(client, telegram_id=1)
    resp = await client.patch(f"/api/v1/stories/{story_id}", json={"title": "Edited title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Edited title"
    assert resp.json()["moderation_status"] == "pending"

    # and it drops off public discovery again
    await authenticate(client, telegram_id=2)
    assert (await client.get("/api/v1/stories/trending")).json() == []


async def test_only_owner_can_edit(client):
    story_id = await create_pending(client, telegram_id=1)
    await authenticate(client, telegram_id=2)
    assert (
        await client.patch(f"/api/v1/stories/{story_id}", json={"title": "hijack"})
    ).status_code == 404


async def test_queue_pagination_with_cursor(client):
    ids = [await create_pending(client, telegram_id=1) for _ in range(3)]

    await authenticate(client, telegram_id=ADMIN_TG)
    page1 = (await client.get("/api/v1/admin/moderation/queue", params={"limit": 2})).json()
    assert len(page1["items"]) == 2
    assert page1["next_cursor"] is not None

    page2 = (
        await client.get(
            "/api/v1/admin/moderation/queue",
            params={"limit": 2, "cursor": page1["next_cursor"]},
        )
    ).json()
    assert len(page2["items"]) == 1
    assert page2["next_cursor"] is None

    seen = [i["id"] for i in page1["items"]] + [i["id"] for i in page2["items"]]
    assert sorted(seen) == sorted(ids)


async def test_bad_cursor_rejected(client):
    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.get(
        "/api/v1/admin/moderation/queue", params={"cursor": "not-a-cursor"}
    )
    assert resp.status_code == 400


async def test_submission_notifies_admins_without_emoji(client, monkeypatch):
    from app.core.config import get_settings
    from app.modules import notifications

    sent: list[tuple[int, str]] = []
    monkeypatch.setattr(get_settings(), "notifications_enabled", True)
    monkeypatch.setattr(notifications, "_enqueue", lambda tid, text: sent.append((tid, text)))

    await create_pending(client, telegram_id=1, title="Wow")

    # the author is notified, and every admin gets a pending-review ping
    author_msgs = [text for tid, text in sent if tid != ADMIN_TG]
    admin_msgs = [text for tid, text in sent if tid == ADMIN_TG]
    assert author_msgs and "pending review" in author_msgs[0].lower()
    assert admin_msgs and "pending review" in admin_msgs[0].lower()
    # no emoji anywhere in the outgoing text
    assert all(ch.isascii() or ch in "“”—" for msg in sent for ch in msg[1])


async def test_viewer_is_owner_flag(client):
    story_id = await create_pending(client, telegram_id=1)
    # owner sees the flag set on their own story
    assert (await client.get(f"/api/v1/stories/{story_id}")).json()["viewer_is_owner"] is True

    await authenticate(client, telegram_id=ADMIN_TG)
    await client.post(f"/api/v1/admin/moderation/{story_id}/approve")
    # a different viewer of the now-public story is not the owner
    await authenticate(client, telegram_id=2)
    assert (await client.get(f"/api/v1/stories/{story_id}")).json()["viewer_is_owner"] is False


async def test_is_admin_flag_exposed(client):
    await authenticate(client, telegram_id=ADMIN_TG)
    assert (await client.get("/api/v1/profile/me")).json()["is_admin"] is True

    await authenticate(client, telegram_id=1)
    assert (await client.get("/api/v1/profile/me")).json()["is_admin"] is False

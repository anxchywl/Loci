"""Reported-content review workflow: queue, resolution states, and admin actions."""
from app.core.config import get_settings
from tests.test_moderation_api import ADMIN_TG
from tests.test_stories_api import approve_story, authenticate, story_payload


async def _reported_story(client, db_session, *, reporters=(2, 3, 4), threshold=3) -> str:
    monkey_threshold(threshold)
    await authenticate(client, telegram_id=1)
    story_id = (await client.post("/api/v1/stories", json=story_payload())).json()["id"]
    await approve_story(db_session, story_id)
    for tg in reporters:
        await authenticate(client, telegram_id=tg)
        await client.post(f"/api/v1/stories/{story_id}/report", json={"reason": f"spam {tg}"})
    return story_id


def monkey_threshold(value: int) -> None:
    get_settings().report_auto_hide_threshold = value


async def test_reported_queue_lists_auto_hidden_story(client, db_session):
    story_id = await _reported_story(client, db_session)

    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.get("/api/v1/admin/reports")
    assert resp.status_code == 200
    body = resp.json()
    assert body["report_threshold"] == 3
    item = next(i for i in body["items"] if i["id"] == story_id)
    assert item["report_count"] == 3
    assert item["reporter_count"] == 3
    assert item["pending_count"] == 3
    assert item["is_hidden"] is True
    assert item["auto_hidden_at"] is not None


async def test_report_detail_shows_reporters_and_reasons(client, db_session):
    story_id = await _reported_story(client, db_session)
    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.get(f"/api/v1/admin/reports/{story_id}")
    assert resp.status_code == 200
    reports = resp.json()["reports"]
    assert len(reports) == 3
    assert all(r["status"] == "pending" for r in reports)
    assert {r["reason"] for r in reports} == {"spam 2", "spam 3", "spam 4"}
    assert all(r["reporter"]["id"] is not None for r in reports)


async def test_restore_makes_story_visible_and_resolves_reports(client, db_session):
    story_id = await _reported_story(client, db_session)
    await authenticate(client, telegram_id=ADMIN_TG)

    resp = await client.post(f"/api/v1/admin/reports/{story_id}/resolve", json={"action": "restore"})
    assert resp.status_code == 204

    detail = (await client.get(f"/api/v1/admin/reports/{story_id}")).json()
    assert detail["story"]["is_hidden"] is False
    assert detail["story"]["auto_hidden_at"] is None
    assert all(r["status"] == "resolved" for r in detail["reports"])
    assert all(r["resolution_action"] == "restored" for r in detail["reports"])
    assert all(r["resolved_by"] is not None for r in detail["reports"])


async def test_ignore_resolves_without_changing_visibility(client, db_session):
    story_id = await _reported_story(client, db_session)
    await authenticate(client, telegram_id=ADMIN_TG)
    await client.post(f"/api/v1/admin/reports/{story_id}/resolve", json={"action": "ignore"})

    detail = (await client.get(f"/api/v1/admin/reports/{story_id}")).json()
    assert detail["story"]["is_hidden"] is True  # unchanged
    assert all(r["resolution_action"] == "ignored" for r in detail["reports"])


async def test_delete_removes_story_and_writes_audit(client, db_session):
    story_id = await _reported_story(client, db_session)
    await authenticate(client, telegram_id=ADMIN_TG)
    resp = await client.post(
        f"/api/v1/admin/reports/{story_id}/resolve",
        json={"action": "delete", "reason": "clear violation"},
    )
    assert resp.status_code == 204
    assert (await client.get(f"/api/v1/admin/reports/{story_id}")).status_code == 404

    logs = (await client.get("/api/v1/admin/audit-logs")).json()["items"]
    entry = next(log for log in logs if log["action"] == "deleted_reported_story")
    assert entry["target_story_id"] == story_id
    assert entry["reason"] == "clear violation"


async def test_reports_endpoints_require_admin(client, db_session):
    story_id = await _reported_story(client, db_session)
    await authenticate(client, telegram_id=2)  # ordinary user
    assert (await client.get("/api/v1/admin/reports")).status_code == 403
    assert (await client.post(f"/api/v1/admin/reports/{story_id}/resolve", json={"action": "restore"})).status_code == 403


async def test_dashboard_includes_report_analytics(client, db_session):
    await _reported_story(client, db_session)
    await authenticate(client, telegram_id=ADMIN_TG)
    data = (await client.get("/api/v1/admin/dashboard")).json()
    assert data["pending_reports"] >= 3
    assert data["auto_hidden_stories"] >= 1
    assert "avg_review_seconds" in data
    assert isinstance(data["most_reported_categories"], list)

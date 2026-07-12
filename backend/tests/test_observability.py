import os

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.observability import _mark_dead_metric_processes, database_operation
from app.main import app


def test_metrics_use_route_templates_without_raw_paths():
    story_id = "00000000-0000-0000-0000-000000000001"
    client = TestClient(app)
    client.get("/health")
    client.get(f"/not-a-route/{story_id}")

    response = client.get("/metrics")

    assert response.status_code == 200
    assert 'route="/health"' in response.text
    assert 'route="unmatched"' in response.text
    assert story_id not in response.text


def test_metrics_token_is_enforced(monkeypatch):
    monkeypatch.setattr(get_settings(), "metrics_token", "scrape-secret")
    client = TestClient(app)

    assert client.get("/metrics").status_code == 401
    allowed = client.get(
        "/metrics", headers={"Authorization": "Bearer scrape-secret"}
    )
    assert allowed.status_code == 200


def test_database_operation_has_bounded_labels():
    assert database_operation(" SELECT * FROM stories") == "SELECT"
    assert database_operation("WITH visible AS (SELECT 1) SELECT * FROM visible") == "OTHER"
    assert database_operation("VACUUM stories") == "OTHER"


def test_dead_metric_processes_are_marked(monkeypatch):
    marked: list[tuple[int, str]] = []
    monkeypatch.setattr(os, "listdir", lambda path: ["gauge_livesum_101.db", "counter_202.db"])

    def fake_kill(pid: int, signal: int) -> None:
        if pid == 101:
            raise ProcessLookupError

    monkeypatch.setattr(os, "kill", fake_kill)
    monkeypatch.setattr(
        "app.core.observability.multiprocess.mark_process_dead",
        lambda pid, path: marked.append((pid, path)),
    )

    _mark_dead_metric_processes("/metrics")

    assert marked == [(101, "/metrics")]

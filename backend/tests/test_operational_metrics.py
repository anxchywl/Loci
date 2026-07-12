import os
import time

import pytest
from fakeredis.aioredis import FakeRedis

from app.core.operational_metrics import render_operational_metrics


@pytest.mark.asyncio
async def test_operational_metrics_have_bounded_labels_and_backup_freshness(tmp_path):
    redis = FakeRedis(decode_responses=True)
    await redis.rpush("images", "one", "two")
    await redis.hset(
        "metrics:workers:v1:outcomes", "photos.optimize|success", 3
    )
    backup = tmp_path / "loci-20260713.dump"
    backup.write_bytes(b"backup")
    timestamp = time.time() - 60
    os.utime(backup, (timestamp, timestamp))

    rendered = (await render_operational_metrics(redis, tmp_path)).decode()

    assert 'celery_queue_depth{queue="images"} 2' in rendered
    assert (
        'celery_task_outcomes_total{task="photos.optimize",outcome="success"} 3'
        in rendered
    )
    assert "loci_backup_size_bytes 6" in rendered
    assert 'loci_operational_metrics_scrape_success{source="backup"} 1' in rendered
    assert backup.name not in rendered


@pytest.mark.asyncio
async def test_operational_metrics_report_missing_backup_without_failing(tmp_path):
    rendered = (await render_operational_metrics(FakeRedis(), tmp_path)).decode()

    assert "loci_backup_age_seconds -1.0" in rendered
    assert 'loci_operational_metrics_scrape_success{source="backup"} 0' in rendered

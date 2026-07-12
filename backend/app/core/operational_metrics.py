from __future__ import annotations

import logging
import time
from pathlib import Path

from redis import Redis
from redis.asyncio import Redis as AsyncRedis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_TASKS = frozenset(
    {
        "photos.optimize",
        "notifications.telegram",
        "maintenance.cleanup_refresh_tokens",
        "maintenance.cleanup_stale_photos",
    }
)
_OUTCOMES = frozenset({"success", "invalid", "failed"})
_QUEUES = ("images", "notifications", "maintenance")
_OUTCOME_KEY = "metrics:workers:v1:outcomes"
_DURATION_COUNT_KEY = "metrics:workers:v1:duration_count"
_DURATION_SUM_KEY = "metrics:workers:v1:duration_sum_ms"


def record_worker_task(task: str, outcome: str, duration_seconds: float) -> None:
    if task not in _TASKS or outcome not in _OUTCOMES:
        raise ValueError("unsupported worker metric label")
    field = f"{task}|{outcome}"
    client: Redis | None = None
    try:
        client = Redis.from_url(get_settings().redis_dsn, socket_timeout=1)
        with client.pipeline(transaction=False) as pipeline:
            pipeline.hincrby(_OUTCOME_KEY, field, 1)
            pipeline.hincrby(_DURATION_COUNT_KEY, task, 1)
            pipeline.hincrbyfloat(
                _DURATION_SUM_KEY, task, max(duration_seconds, 0.0) * 1000
            )
            pipeline.execute()
    except Exception:
        logger.warning("worker metric recording failed", exc_info=True)
    finally:
        if client is not None:
            client.close()


async def render_operational_metrics(
    redis: AsyncRedis, backup_dir: Path = Path("/backups")
) -> bytes:
    lines = [
        "# HELP celery_queue_depth Pending Celery tasks by queue.",
        "# TYPE celery_queue_depth gauge",
    ]
    redis_ok = 1
    try:
        depths = [await redis.llen(queue) for queue in _QUEUES]
        outcomes = await redis.hgetall(_OUTCOME_KEY)
        duration_counts = await redis.hgetall(_DURATION_COUNT_KEY)
        duration_sums = await redis.hgetall(_DURATION_SUM_KEY)
    except Exception:
        redis_ok = 0
        depths = [0] * len(_QUEUES)
        outcomes = {}
        duration_counts = {}
        duration_sums = {}

    for queue, depth in zip(_QUEUES, depths, strict=True):
        lines.append(f'celery_queue_depth{{queue="{queue}"}} {int(depth)}')

    lines.extend(
        [
            "# HELP celery_task_outcomes_total Worker task outcomes.",
            "# TYPE celery_task_outcomes_total counter",
        ]
    )
    for task in sorted(_TASKS):
        for outcome in sorted(_OUTCOMES):
            value = outcomes.get(f"{task}|{outcome}", 0)
            lines.append(
                f'celery_task_outcomes_total{{task="{task}",outcome="{outcome}"}} {int(value)}'
            )

    lines.extend(
        [
            "# HELP celery_task_duration_seconds Worker task cumulative duration.",
            "# TYPE celery_task_duration_seconds summary",
        ]
    )
    for task in sorted(_TASKS):
        count = int(duration_counts.get(task, 0))
        duration = float(duration_sums.get(task, 0)) / 1000
        lines.append(f'celery_task_duration_seconds_count{{task="{task}"}} {count}')
        lines.append(f'celery_task_duration_seconds_sum{{task="{task}"}} {duration}')

    backup_age, backup_size, backup_ok = _newest_backup(backup_dir)
    lines.extend(
        [
            "# HELP loci_backup_age_seconds Age of the newest local database backup.",
            "# TYPE loci_backup_age_seconds gauge",
            f"loci_backup_age_seconds {backup_age}",
            "# HELP loci_backup_size_bytes Size of the newest local database backup.",
            "# TYPE loci_backup_size_bytes gauge",
            f"loci_backup_size_bytes {backup_size}",
            "# HELP loci_operational_metrics_scrape_success Whether operational metric sources were readable.",
            "# TYPE loci_operational_metrics_scrape_success gauge",
            f'loci_operational_metrics_scrape_success{{source="redis"}} {redis_ok}',
            f'loci_operational_metrics_scrape_success{{source="backup"}} {backup_ok}',
        ]
    )
    return ("\n".join(lines) + "\n").encode()


def _newest_backup(backup_dir: Path) -> tuple[float, int, int]:
    try:
        backups = list(backup_dir.glob("loci-*.dump")) + list(
            backup_dir.glob("loci-*.dump.age")
        )
        newest = max(backups, key=lambda path: path.stat().st_mtime)
        stat = newest.stat()
        return max(time.time() - stat.st_mtime, 0.0), stat.st_size, 1
    except (OSError, ValueError):
        return -1.0, 0, 0

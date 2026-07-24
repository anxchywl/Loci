from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "loci",
    broker=settings.celery_broker_dsn,
    backend=settings.celery_result_backend_dsn,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # isolate image bursts from notifications
    task_routes={
        "photos.*": {"queue": "images"},
        "notifications.*": {"queue": "notifications"},
        "maintenance.*": {"queue": "maintenance"},
    },
    task_default_queue="images",
    # bound tasks without a narrower limit
    task_time_limit=300,
    result_expires=3600,
    beat_schedule={
        "cleanup-expired-refresh-tokens": {
            "task": "maintenance.cleanup_refresh_tokens",
            "schedule": 86_400.0,
        },
        "cleanup-stale-photos": {
            "task": "maintenance.cleanup_stale_photos",
            "schedule": 86_400.0,
        },
        "cleanup-deleted-media": {
            "task": "maintenance.cleanup_deleted_media",
            "schedule": 300.0,
        },
    },
)

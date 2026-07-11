"""Best-effort Telegram notifications for story lifecycle events.

Dispatch is fire-and-forget: it enqueues a Celery task and never raises into the
request path, so a broker hiccup can't fail a submission or a moderation action.
The actual send happens in ``app.workers.tasks.send_telegram_message``.
"""
import enum
import logging

from app.core.config import Settings

logger = logging.getLogger(__name__)


class StoryEvent(str, enum.Enum):
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    resubmitted = "resubmitted"


_MESSAGES = {
    StoryEvent.submitted: "📝 Your story “{title}” was submitted and is pending review.",
    StoryEvent.approved: "✅ Your story “{title}” was approved and is now on the map.",
    StoryEvent.rejected: "🚫 Your story “{title}” was rejected.\n\nReason: {reason}",
    StoryEvent.resubmitted: "🔁 Your story “{title}” was resubmitted and is pending review.",
}


def render_message(event: StoryEvent, title: str, reason: str | None) -> str:
    return _MESSAGES[event].format(title=title, reason=reason or "—")


def dispatch(
    settings: Settings,
    *,
    event: StoryEvent,
    telegram_id: int | None,
    title: str,
    reason: str | None = None,
) -> None:
    if not settings.notifications_enabled or not telegram_id:
        return
    text = render_message(event, title, reason)
    try:
        # imported lazily so the API process never hard-depends on Celery wiring
        from app.workers.celery_app import celery_app

        celery_app.send_task("notifications.telegram", args=[telegram_id, text])
    except Exception:  # pragma: no cover - broker failures must not break requests
        logger.exception("failed to enqueue telegram notification for %s", telegram_id)

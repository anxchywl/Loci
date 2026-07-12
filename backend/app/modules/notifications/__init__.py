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
    # reported-content workflow
    report_threshold = "report_threshold"
    restored = "restored"
    removed = "removed"


_MESSAGES = {
    StoryEvent.submitted: "Your story “{title}” was submitted and is pending review. It will appear on the map once our team approves it — please give us a little time.",
    StoryEvent.approved: "Your story “{title}” was approved and is now on the map.",
    StoryEvent.rejected: "Your story “{title}” was rejected.\n\nReason: {reason}",
    StoryEvent.resubmitted: "Your story “{title}” was resubmitted and is pending review.",
    StoryEvent.report_threshold: "Your story “{title}” has been temporarily hidden after several reports and is now waiting for a moderator to review it.",
    StoryEvent.restored: "Your story “{title}” was reviewed by a moderator and is back on the map.",
    StoryEvent.removed: "Your story “{title}” was removed by a moderator after review.\n\nReason: {reason}",
}


def render_message(event: StoryEvent, title: str, reason: str | None) -> str:
    return _MESSAGES[event].format(title=title, reason=reason or "—")


def _enqueue(telegram_id: int, text: str) -> None:
    try:
        # imported lazily so the API process never hard-depends on Celery wiring
        from app.workers.celery_app import celery_app

        celery_app.send_task("notifications.telegram", args=[telegram_id, text])
    except Exception:  # pragma: no cover - broker failures must not break requests
        logger.exception("failed to enqueue telegram notification for %s", telegram_id)


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
    _enqueue(telegram_id, render_message(event, title, reason))


def dispatch_admins_pending_review(
    settings: Settings, *, title: str, author_label: str
) -> None:
    """Tell every configured admin that a story is waiting in the moderation
    queue. Fire-and-forget, one message per admin telegram id."""
    if not settings.notifications_enabled:
        return
    text = (
        f"New story pending review: “{title}” by {author_label}. "
        f"Open the moderation queue to approve or reject it."
    )
    for admin_id in settings.admin_ids:
        _enqueue(admin_id, text)

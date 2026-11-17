"""Best-effort Telegram notifications for story lifecycle events.

Dispatch is fire-and-forget: it enqueues a Celery task and never raises into the
request path, so a broker hiccup can't fail a submission or a moderation action.
The actual send happens in ``app.workers.tasks.send_telegram_message``.
"""
import enum
import logging
import uuid

from app.core.config import Settings

logger = logging.getLogger(__name__)

# the admin ping waits this long so photos uploaded right after creation are in
# the queue by the time a moderator opens it
PENDING_REVIEW_DELAY_SECONDS = 60


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


def author_label(user, *, anonymous: bool = False) -> str:
    if anonymous:
        return "an anonymous author"
    if user is None:
        return "a user"
    if user.display_name:
        return user.display_name
    return " ".join(part for part in (user.first_name, user.last_name) if part) or "a user"


def render_admin_pending_review(title: str, label: str) -> str:
    return (
        f"New story pending review: “{title}” by {label}. "
        f"Open the moderation queue to approve or reject it."
    )


def _enqueue_pending_review(story_id: str) -> None:
    try:
        from app.workers.celery_app import celery_app

        # only the story id travels through the broker; the worker re-reads the
        # story so an anonymous author never enters a task payload
        celery_app.send_task(
            "notifications.admin_pending_review",
            args=[story_id],
            countdown=PENDING_REVIEW_DELAY_SECONDS,
        )
    except Exception:  # pragma: no cover - broker failures must not break requests
        logger.exception("failed to enqueue pending-review notification")


def dispatch_admins_pending_review(settings: Settings, *, story_id: uuid.UUID) -> None:
    """Schedule the admin ping for a story that entered the moderation queue.
    The worker sends it once the story's photo uploads have settled."""
    if not settings.notifications_enabled or not settings.admin_ids:
        return
    _enqueue_pending_review(str(story_id))

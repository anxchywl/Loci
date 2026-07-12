"""Lightweight, dependency-free observability helpers.

Provides two things used across the photo-upload pipeline:

* ``log_event`` — structured logging. Emits a single log record whose message is
  the event name and whose ``extra`` carries typed fields, so log processors can
  index ``path``/``outcome``/``duration_ms`` without regex-parsing prose.
* an in-process Prometheus-style metric registry (counters + histograms) exposed
  as text by ``render_metrics``. The ``/metrics`` endpoint scrapes this, so an
  unexpected rise in the proxy-fallback rate is visible without new infra.

The registry is process-local. Under multiple workers each process exposes its
own numbers; a Prometheus scrape aggregates them across targets as usual.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict

# duration buckets in seconds, tuned for image uploads (sub-second to ~30s)
_DURATION_BUCKETS: tuple[float, ...] = (0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30)

_Labels = tuple[tuple[str, str], ...]

_lock = threading.Lock()
_counters: dict[tuple[str, _Labels], float] = defaultdict(float)
_hist_bucket: dict[tuple[str, _Labels, float], float] = defaultdict(float)
_hist_sum: dict[tuple[str, _Labels], float] = defaultdict(float)
_hist_count: dict[tuple[str, _Labels], float] = defaultdict(float)

# metric_name -> help/type, so the exposition output is valid Prometheus text
_counter_meta: dict[str, str] = {}
_hist_meta: dict[str, str] = {}


def _labels(labels: dict[str, str] | None) -> _Labels:
    if not labels:
        return ()
    return tuple(sorted(labels.items()))


def counter(name: str, *, help: str, labels: dict[str, str] | None = None, value: float = 1.0) -> None:
    with _lock:
        _counter_meta.setdefault(name, help)
        _counters[(name, _labels(labels))] += value


def observe(name: str, seconds: float, *, help: str, labels: dict[str, str] | None = None) -> None:
    key_labels = _labels(labels)
    with _lock:
        _hist_meta.setdefault(name, help)
        _hist_sum[(name, key_labels)] += seconds
        _hist_count[(name, key_labels)] += 1
        for bound in _DURATION_BUCKETS:
            if seconds <= bound:
                _hist_bucket[(name, key_labels, bound)] += 1


def _format_labels(labels: _Labels, extra: tuple[tuple[str, str], ...] = ()) -> str:
    pairs = list(labels) + list(extra)
    if not pairs:
        return ""
    inner = ",".join(f'{k}="{v}"' for k, v in pairs)
    return "{" + inner + "}"


def render_metrics() -> str:
    """Render the registry as Prometheus text exposition format."""
    lines: list[str] = []
    with _lock:
        for name, help_text in sorted(_counter_meta.items()):
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} counter")
            for (metric, labels), value in sorted(_counters.items()):
                if metric == name:
                    lines.append(f"{name}{_format_labels(labels)} {value}")
        for name, help_text in sorted(_hist_meta.items()):
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} histogram")
            series = {labels for (metric, labels) in _hist_count if metric == name}
            for labels in sorted(series):
                cumulative = 0.0
                for bound in _DURATION_BUCKETS:
                    cumulative = _hist_bucket.get((name, labels, bound), 0.0)
                    le = ("le", _format_float(bound))
                    lines.append(f"{name}_bucket{_format_labels(labels, (le,))} {cumulative}")
                count = _hist_count[(name, labels)]
                lines.append(f"{name}_bucket{_format_labels(labels, (('le', '+Inf'),))} {count}")
                lines.append(f"{name}_sum{_format_labels(labels)} {_hist_sum[(name, labels)]}")
                lines.append(f"{name}_count{_format_labels(labels)} {count}")
    return "\n".join(lines) + "\n"


def _format_float(value: float) -> str:
    return str(int(value)) if value == int(value) else str(value)


def log_event(
    logger: logging.Logger,
    event: str,
    *,
    level: int = logging.INFO,
    **fields: object,
) -> None:
    """Emit a structured log record: the message is ``event``, fields go to extra.

    Field values are namespaced under ``ctx`` in ``extra`` to avoid colliding
    with reserved ``LogRecord`` attributes (``name``, ``msg``, ``args`` ...).
    """
    logger.log(level, event, extra={"event": event, "ctx": fields})

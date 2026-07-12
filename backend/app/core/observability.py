from __future__ import annotations

import logging
import os
import re
import time
from functools import lru_cache
from typing import Any

from fastapi import Request, Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    multiprocess,
)
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

_DURATION_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30)
_METRIC_NAME = re.compile(r"^[a-zA-Z_:][a-zA-Z0-9_:]*$")

HTTP_REQUESTS = Counter(
    "http_requests_total",
    "HTTP requests completed",
    ("method", "route", "status"),
)
HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ("method", "route"),
    buckets=_DURATION_BUCKETS,
)
HTTP_RESPONSE_SIZE = Histogram(
    "http_response_size_bytes",
    "HTTP response size from Content-Length",
    ("method", "route"),
    buckets=(256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304),
)
HTTP_REQUEST_SIZE = Histogram(
    "http_request_size_bytes",
    "HTTP request size from Content-Length",
    ("method", "route"),
    buckets=(256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 12582912),
)
HTTP_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "HTTP requests currently in progress",
    ("method",),
    multiprocess_mode="livesum",
)
DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "Database query duration",
    ("operation",),
    buckets=_DURATION_BUCKETS,
)
DB_QUERY_ERRORS = Counter(
    "db_query_errors_total",
    "Database query errors",
    ("operation",),
)
DB_POOL_CHECKOUTS = Counter("db_pool_checkouts_total", "Database pool checkouts")
DB_POOL_CHECKED_OUT = Gauge(
    "db_pool_connections_checked_out",
    "Database connections currently checked out",
    multiprocess_mode="livesum",
)
DB_POOL_INVALIDATIONS = Counter(
    "db_pool_invalidations_total", "Database pool connection invalidations"
)
DB_POOL_CAPACITY = Gauge(
    "db_pool_connection_capacity",
    "Configured database pool capacity including overflow",
    multiprocess_mode="livesum",
)
REDIS_COMMAND_DURATION = Histogram(
    "redis_command_duration_seconds",
    "Redis command duration",
    ("command", "outcome"),
    buckets=_DURATION_BUCKETS,
)

_HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"})
_DB_OPERATIONS = frozenset({"SELECT", "INSERT", "UPDATE", "DELETE"})


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        method = request.method if request.method in _HTTP_METHODS else "OTHER"
        started = time.perf_counter()
        status_code = 500
        HTTP_IN_PROGRESS.labels(method=method).inc()
        try:
            response = await call_next(request)
            status_code = response.status_code
            route = request.scope.get("route")
            route_label = getattr(route, "path", "unmatched")
            request_length = request.headers.get("content-length")
            if request_length and request_length.isdigit():
                HTTP_REQUEST_SIZE.labels(method=method, route=route_label).observe(
                    int(request_length)
                )
            content_length = response.headers.get("content-length")
            if content_length and content_length.isdigit():
                HTTP_RESPONSE_SIZE.labels(method=method, route=route_label).observe(
                    int(content_length)
                )
            return response
        finally:
            route = request.scope.get("route")
            route_label = getattr(route, "path", "unmatched")
            HTTP_REQUESTS.labels(
                method=method, route=route_label, status=str(status_code)
            ).inc()
            HTTP_REQUEST_DURATION.labels(method=method, route=route_label).observe(
                time.perf_counter() - started
            )
            HTTP_IN_PROGRESS.labels(method=method).dec()


def database_operation(statement: str) -> str:
    operation = statement.lstrip().partition(" ")[0].upper()
    return operation if operation in _DB_OPERATIONS else "OTHER"


def instrument_database_engine(engine: Any, capacity: int) -> None:
    from sqlalchemy import event

    sync_engine = engine.sync_engine
    DB_POOL_CAPACITY.set(capacity)

    @event.listens_for(sync_engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_started", []).append(
            (time.perf_counter(), database_operation(statement))
        )

    @event.listens_for(sync_engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        started, operation = conn.info["query_started"].pop()
        DB_QUERY_DURATION.labels(operation=operation).observe(time.perf_counter() - started)

    @event.listens_for(sync_engine, "handle_error")
    def handle_error(exception_context):
        connection = exception_context.connection
        stack = connection.info.get("query_started", []) if connection is not None else []
        if stack:
            started, operation = stack.pop()
            DB_QUERY_DURATION.labels(operation=operation).observe(time.perf_counter() - started)
            DB_QUERY_ERRORS.labels(operation=operation).inc()

    @event.listens_for(sync_engine, "checkout")
    def checkout(dbapi_connection, connection_record, connection_proxy):
        DB_POOL_CHECKOUTS.inc()
        DB_POOL_CHECKED_OUT.inc()
        connection_record.info["metrics_checked_out"] = True

    @event.listens_for(sync_engine, "checkin")
    def checkin(dbapi_connection, connection_record):
        if connection_record.info.pop("metrics_checked_out", False):
            DB_POOL_CHECKED_OUT.dec()

    @event.listens_for(sync_engine, "invalidate")
    def invalidate(dbapi_connection, connection_record, exception):
        DB_POOL_INVALIDATIONS.inc()
        if connection_record.info.pop("metrics_checked_out", False):
            DB_POOL_CHECKED_OUT.dec()


@lru_cache(maxsize=64)
def _counter_metric(name: str, help_text: str, label_names: tuple[str, ...]) -> Counter:
    if not _METRIC_NAME.fullmatch(name):
        raise ValueError("invalid metric name")
    return Counter(name, help_text, label_names)


@lru_cache(maxsize=64)
def _histogram_metric(name: str, help_text: str, label_names: tuple[str, ...]) -> Histogram:
    if not _METRIC_NAME.fullmatch(name):
        raise ValueError("invalid metric name")
    return Histogram(name, help_text, label_names, buckets=_DURATION_BUCKETS)


def counter(
    name: str,
    *,
    help: str,
    labels: dict[str, str] | None = None,
    value: float = 1.0,
) -> None:
    metric_labels = labels or {}
    metric = _counter_metric(name, help, tuple(sorted(metric_labels)))
    if metric_labels:
        metric.labels(**metric_labels).inc(value)
    else:
        metric.inc(value)


def observe(
    name: str,
    seconds: float,
    *,
    help: str,
    labels: dict[str, str] | None = None,
) -> None:
    metric_labels = labels or {}
    metric = _histogram_metric(name, help, tuple(sorted(metric_labels)))
    if metric_labels:
        metric.labels(**metric_labels).observe(seconds)
    else:
        metric.observe(seconds)


def render_metrics() -> tuple[bytes, str]:
    multiprocess_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
    if multiprocess_dir:
        _mark_dead_metric_processes(multiprocess_dir)
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry, path=multiprocess_dir)
        return generate_latest(registry), CONTENT_TYPE_LATEST
    return generate_latest(), CONTENT_TYPE_LATEST


def _mark_dead_metric_processes(multiprocess_dir: str) -> None:
    try:
        filenames = os.listdir(multiprocess_dir)
    except OSError:
        return
    pids = {
        int(match.group(1))
        for filename in filenames
        if (match := re.search(r"_(\d+)\.db$", filename))
    }
    for pid in pids:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            multiprocess.mark_process_dead(pid, path=multiprocess_dir)
        except PermissionError:
            continue


def log_event(
    logger: logging.Logger,
    event: str,
    *,
    level: int = logging.INFO,
    **fields: object,
) -> None:
    logger.log(level, event, extra={"event": event, "ctx": fields})

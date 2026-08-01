"""Keep authenticated responses out of shared caches.

Handlers that serve public data set their own ``Cache-Control`` and are left
alone. Everything else answering a request that carried a bearer token gets
``private, no-store``: without it a proxy, CDN, or browser heuristic is free to
store one account's response and hand it to the next, which is the same leak the
client-side cache reset closes on the other side of the wire.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class PrivateCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        if "authorization" not in request.headers:
            return response

        response.headers.setdefault("Cache-Control", "private, no-store")
        # a shared cache keyed only on the URL would otherwise reuse one user's
        # response for another
        vary = response.headers.get("Vary")
        parts = [part.strip() for part in vary.split(",")] if vary else []
        if not any(part.lower() == "authorization" for part in parts):
            parts.append("Authorization")
            response.headers["Vary"] = ", ".join(part for part in parts if part)
        return response

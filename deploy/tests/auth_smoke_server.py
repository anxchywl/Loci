import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


GOOGLE_ENABLED = len(sys.argv) > 2 and sys.argv[2] == "true"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, {"status": "ok"})
            return
        if self.path == "/api/v1/auth/providers":
            self.respond(200, {"email": True, "google": GOOGLE_ENABLED})
            return
        if self.path in ("/privacy", "/terms"):
            self.respond(200, "<html>privacy@loci.test</html>", "text/html")
            return
        if self.path.startswith("/api/v1/auth/google/start"):
            if GOOGLE_ENABLED:
                self.respond(
                    200,
                    {"authorization_url": "https://accounts.google.com/o/oauth2/v2/auth"},
                )
            else:
                self.respond(404, {"detail": "not configured"})
            return
        self.respond(404, {"detail": "not found"})

    def do_POST(self) -> None:
        if self.path == "/api/v1/auth/refresh":
            self.respond(401, {"detail": "No refresh token"})
            return
        self.respond(404, {"detail": "not found"})

    def respond(self, status: int, body: object, content_type: str = "application/json") -> None:
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:
        return


ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()

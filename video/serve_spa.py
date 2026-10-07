"""Serve frontend/dist for recording: static files, with index.html for client-side routes like /app.

python video/serve_spa.py [port]   # default 4173 (allowed by the API's default CORS origins)
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        if not (DIST / self.path.split("?")[0].lstrip("/")).exists():
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(DIST))).serve_forever()

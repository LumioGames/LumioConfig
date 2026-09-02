from __future__ import annotations

import json
import re
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty
from typing import Any, Callable
from urllib.parse import unquote, urlparse

from .session import Session, SessionError
from .settings import Settings, load_settings
from .vcs import make_adapter


STATIC_DIR = Path(__file__).resolve().parent.parent / "editor_static"
CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"
RouteHandler = Callable[[Any, dict[str, str]], None]
_EXTRA_ROUTES: list[tuple[str, re.Pattern[str], RouteHandler]] = []


def register(method: str, path_pattern: str, handler: RouteHandler) -> None:
    _EXTRA_ROUTES.append((method.upper(), re.compile(path_pattern), handler))


def _repo_name(root: Path) -> str:
    path = root / "repository.yaml"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("name:"):
                return line.split(":", 1)[1].strip()
    return root.name


def evaluate_open_policy(root: Path) -> tuple[Settings, object, bool, list[str], bool]:
    settings = load_settings(root)
    adapter = make_adapter(root, settings)
    dirty: list[str] = []
    if settings.vcs != "none":
        dirty = adapter.status(["tables", "registry", "schemas"])
    blocked = bool(dirty) and not settings.allow_dirty
    commit_allowed = settings.vcs != "none" and not dirty
    return settings, adapter, commit_allowed, dirty, blocked


class EditorHost:
    def __init__(self, root: Path, port: int, commit_allowed: bool, settings: Settings, adapter: object) -> None:
        self.root = Path(root)
        self.token = secrets.token_urlsafe(32)
        self.settings = settings
        self.session = Session(self.root, settings, adapter, commit_allowed)  # type: ignore[arg-type]
        self.running = True
        handler = _handler_for(self)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
        self.port = int(self.httpd.server_address[1])
        self.session.start_watcher()

    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/#token={self.token}"

    def shutdown(self) -> None:
        self.running = False
        self.session.stop_watcher()
        threading.Thread(target=self.httpd.shutdown, daemon=True).start()


def create_server(root: Path, port: int = 0, open_browser: bool = False) -> EditorHost:
    settings, adapter, commit_allowed, _dirty, blocked = evaluate_open_policy(root)
    if blocked:
        raise RuntimeError("WORKING_TREE_DIRTY")
    host = EditorHost(root, port, commit_allowed, settings, adapter)
    if open_browser:
        webbrowser.open(host.url())
    return host


def serve(root: Path, port: int, open_browser: bool) -> None:
    host = create_server(root, port, open_browser)
    print(host.url())
    try:
        host.httpd.serve_forever()
    finally:
        host.shutdown()


def _handler_for(host: EditorHost) -> type[BaseHTTPRequestHandler]:
    class EditorHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            return

        def _allowed_hosts(self) -> set[str]:
            return {f"127.0.0.1:{host.port}", f"localhost:{host.port}"}

        def _allowed_origins(self) -> set[str]:
            return {f"http://127.0.0.1:{host.port}", f"http://localhost:{host.port}"}

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _error(self, status: int, code: str, message: str, errors: list[dict[str, str]] | None = None) -> None:
            self._json(status, {"code": code, "message": message, "errors": errors or []})

        def _text(self, status: int, body: str, content_type: str = "text/plain; charset=utf-8") -> None:
            data = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _authorize_api(self) -> bool:
            request_host = self.headers.get("Host", "")
            if request_host not in self._allowed_hosts():
                self._error(403, "FORBIDDEN_HOST", "Host must be loopback")
                return False
            origin = self.headers.get("Origin")
            if origin and origin not in self._allowed_origins():
                self._error(403, "FORBIDDEN_ORIGIN", "Origin must match the local server")
                return False
            auth = self.headers.get("Authorization", "")
            expected = f"Bearer {host.token}"
            if auth != expected:
                self._error(401, "UNAUTHORIZED", "missing or invalid bearer token")
                return False
            return True

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = unquote(parsed.path)
            if path.startswith("/api/"):
                if not self._authorize_api():
                    return
                if path == "/api/session":
                    self._json(200, host.session.session_payload(_repo_name(host.root)))
                    return
                match = re.fullmatch(r"/api/tables/([^/]+)", path)
                if match:
                    table = host.session.table_projection(match.group(1))
                    if table is None:
                        self._error(404, "UNKNOWN_TABLE", f"table {match.group(1)} is not loaded")
                        return
                    self._json(200, table)
                    return
                if path == "/api/events":
                    self._sse()
                    return
                for method, pattern, handler in _EXTRA_ROUTES:
                    extra = pattern.fullmatch(path)
                    if method == "GET" and extra:
                        handler(self, extra.groupdict())
                        return
                self._error(404, "NOT_FOUND", "unknown api path")
                return
            self._static(path)

        def do_DELETE(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = unquote(parsed.path)
            if path.startswith("/api/") and not self._authorize_api():
                return
            if path == "/api/session":
                self.send_response(204)
                self.send_header("Content-Security-Policy", CSP)
                self.end_headers()
                host.shutdown()
                return
            self._error(404, "NOT_FOUND", "unknown api path")

        def _sse(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Security-Policy", CSP)
            self.end_headers()
            pending = host.session.subscribe()
            try:
                while host.running:
                    try:
                        event = pending.get(timeout=1)
                    except Empty:
                        self.wfile.write(b":\n\n")
                        self.wfile.flush()
                        continue
                    blob = json.dumps(event["data"], ensure_ascii=False)
                    self.wfile.write(f"event: {event['name']}\ndata: {blob}\n\n".encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                return

        def _static(self, path: str) -> None:
            if path == "/":
                index = STATIC_DIR / "index.html"
                if not index.exists():
                    self._text(200, "前端未构建")
                    return
                self._text(200, index.read_text(encoding="utf-8"), "text/html; charset=utf-8")
                return
            self._error(404, "NOT_FOUND", "not found")

    return EditorHandler

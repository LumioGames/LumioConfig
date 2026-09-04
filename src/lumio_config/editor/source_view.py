from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlparse

from .server import _valid_table, register


MAX_SOURCE_BYTES = 2 * 1024 * 1024  # 2 MiB cap for one source response
# kind is a closed enumeration mapped to hardcoded prefixes; no path segment
# is ever assembled from request input, which defeats traversal by design.
_KIND_TARGETS: dict[str, tuple[str, str]] = {
    "table": ("tables", ".txt"),
    "schema": ("schemas", ".json"),
}


def _handle_source_request(handler: Any, params: dict[str, str]) -> None:
    host = handler.editor_host
    table = str(params.get("table") or "")
    query = parse_qs(urlparse(handler.path).query)
    kind = (query.get("kind") or [""])[0]
    # Boundary 1: shared table-name policy (regex + explicit ".." rejection).
    if not _valid_table(table):
        handler._error(404, "NOT_FOUND", "unknown table")
        return
    # Boundary 2: kind must be one of two values with a fixed directory/suffix.
    target = _KIND_TARGETS.get(kind)
    if target is None:
        handler._error(400, "BAD_REQUEST", "kind must be one of: table, schema")
        return
    directory, suffix = target
    # Boundary 4: only tables the session actually loaded are readable.
    if host.session.table_projection(table) is None:
        handler._error(404, "UNKNOWN_TABLE", f"table {table} is not loaded")
        return
    root = host.root.resolve()
    path = (root / directory / f"{table}{suffix}").resolve()
    # Boundary 3: defense in depth -- the validated name cannot contain a
    # separator, but still verify the resolved path stays inside the root.
    try:
        path.relative_to(root)
    except ValueError:
        handler._error(403, "FORBIDDEN", "path escapes repository root")
        return
    if not path.is_file():
        handler._error(404, "NOT_FOUND", f"{directory}/{table}{suffix} does not exist")
        return
    data = path.read_bytes()
    if len(data) > MAX_SOURCE_BYTES:
        handler._error(413, "PAYLOAD_TOO_LARGE", f"{directory}/{table}{suffix} is larger than 2 MiB")
        return
    handler._json(
        200,
        {
            "table": table,
            "kind": kind,
            # POSIX-form relative path for the client; separators are hardcoded.
            "path": f"{directory}/{table}{suffix}",
            "text": data.decode("utf-8"),
            "bytes": len(data),
        },
    )


register("GET", r"/api/tables/(?P<table>[^/]+)/source", _handle_source_request)

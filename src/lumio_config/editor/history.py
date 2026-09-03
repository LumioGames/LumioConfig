from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from ..model import Cell
from ..patch import _cell_token
from ..validate import load_sources
from .server import register
from .session import Session
from .vcs import HistoryRevision, VcsAdapter


HISTORY_LIMIT_DEFAULT = 20
HISTORY_LIMIT_MAX = 100


def _normalize(text: str) -> str:
    return text.replace("\r\n", "\n")


def _schema_digest(adapter: VcsAdapter, revision: str, table: str) -> str:
    content = adapter.show(revision, f"schemas/{table}.json")
    if not content:
        return ""
    return hashlib.sha256(_normalize(content).encode("utf-8")).hexdigest()


def _snapshot(adapter: VcsAdapter, revision: str, table: str, dest: Path) -> tuple[dict[str, Any] | None, list[dict[str, Cell]], bool]:
    """Materialize the table/schema sources at `revision` and parse them with load_sources."""
    table_text = _normalize(adapter.show(revision, f"tables/{table}.txt"))
    schema_text = _normalize(adapter.show(revision, f"schemas/{table}.json"))
    (dest / "schemas").mkdir(parents=True, exist_ok=True)
    (dest / "tables").mkdir(parents=True, exist_ok=True)
    if schema_text:
        (dest / "schemas" / f"{table}.json").write_bytes(schema_text.encode("utf-8"))
    if table_text:
        (dest / "tables" / f"{table}.txt").write_bytes(table_text.encode("utf-8"))
    if not schema_text and not table_text:
        return None, [], True
    schemas, tables, errors = load_sources(dest)
    if errors:
        return None, [], False
    source = tables.get(table)
    return schemas.get(table), list(source.rows) if source else [], True


def _rows_by_id(rows: list[dict[str, Cell]], id_column: str) -> dict[str, dict[str, Cell]]:
    out: dict[str, dict[str, Cell]] = {}
    for row in rows:
        token = _cell_token(row, id_column)
        if token is None or token == "@missing":
            continue
        out[token] = row
    return out


def _revision_item(adapter: VcsAdapter, revision: HistoryRevision, parent: str, table: str, child_dir: Path, parent_dir: Path) -> dict[str, Any]:
    schema_changed = _schema_digest(adapter, revision.id, table) != _schema_digest(adapter, parent, table)
    child_schema, child_rows, child_ok = _snapshot(adapter, revision.id, table, child_dir)
    parent_schema, parent_rows, parent_ok = _snapshot(adapter, parent, table, parent_dir)
    cells: list[dict[str, str]] = []
    created: list[str] = []
    deleted: list[str] = []
    if child_ok and parent_ok:
        id_column = str((child_schema or parent_schema or {}).get("idColumn", "id"))
        child_map = _rows_by_id(child_rows, id_column)
        parent_map = _rows_by_id(parent_rows, id_column)
        created = sorted(set(child_map) - set(parent_map))
        deleted = sorted(set(parent_map) - set(child_map))
        for row_id in sorted(set(child_map) & set(parent_map)):
            child_row = child_map[row_id]
            parent_row = parent_map[row_id]
            name = _cell_token(child_row, "name") or row_id
            for column in sorted(set(child_row) | set(parent_row)):
                child_token = _cell_token(child_row, column) or "@missing"
                parent_token = _cell_token(parent_row, column) or "@missing"
                if child_token == parent_token:
                    continue
                cells.append({"row": name, "rowId": row_id, "column": column, "from": parent_token, "to": child_token})
    if schema_changed:
        cells = []
    return {
        "revision": revision.id,
        "message": revision.message,
        "time": revision.time,
        "author": revision.author,
        "cells": cells,
        "created": created,
        "deleted": deleted,
        "schemaChanged": schema_changed,
    }


def table_history(session: Session, table: str, since: str | None, limit: int) -> list[dict[str, Any]]:
    if session.settings.vcs != "git":
        return []
    adapter = session.adapter
    revisions = adapter.log([f"tables/{table}.txt", f"schemas/{table}.json"], since, limit)
    items: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="lumio-history-") as temp:
        base = Path(temp)
        for index, revision in enumerate(revisions):
            items.append(_revision_item(adapter, revision, f"{revision.id}^", table, base / f"child-{index}", base / f"parent-{index}"))
    return items


def _handle_history_request(handler: Any, params: dict[str, str]) -> None:
    host = handler.editor_host
    table = str(params.get("table") or "")
    query = parse_qs(urlparse(handler.path).query)
    since = (query.get("since") or [None])[0] or None
    raw_limit = (query.get("limit") or [str(HISTORY_LIMIT_DEFAULT)])[0]
    if host.session.table_projection(table) is None:
        handler._error(404, "UNKNOWN_TABLE", f"table {table} is not loaded")
        return
    try:
        limit = int(raw_limit)
    except ValueError:
        handler._error(422, "BAD_LIMIT", "limit must be an integer between 1 and 100")
        return
    if limit < 1:
        handler._error(422, "BAD_LIMIT", "limit must be an integer between 1 and 100")
        return
    handler._json(200, {"items": table_history(host.session, table, since, min(limit, HISTORY_LIMIT_MAX))})


register("GET", r"/api/tables/(?P<table>[^/]+)/history", _handle_history_request)

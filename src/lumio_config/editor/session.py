from __future__ import annotations

import hashlib
import queue
import threading
import time
from pathlib import Path
from typing import Any

from ..fingerprint import source_fingerprint
from ..model import Cell
from ..validate import _column_map, effective_value, load_sources, load_tick_rate
from .settings import Settings
from .vcs import VcsAdapter


class SessionError(RuntimeError):
    def __init__(self, code: str, message: str, files: list[str] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.files = files or []


class Session:
    def __init__(self, root: Path, settings: Settings, adapter: VcsAdapter, commit_allowed: bool) -> None:
        self.root = Path(root)
        self.settings = settings
        self.adapter = adapter
        self.commit_allowed = commit_allowed
        schemas, tables, errors = load_sources(self.root)
        if errors:
            files = sorted({error.table for error in errors if error.table})
            raise SessionError("source_parse_failed", "source tables could not be parsed", files)
        self.schemas = schemas
        self.tables = tables
        self.tick_rate = load_tick_rate(self.root)
        self._subscribers: list[queue.Queue[dict[str, Any]]] = []
        self._lock = threading.Lock()
        self._source_lock = threading.RLock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._fingerprints = self.fingerprints()

    def reload_from_disk(self) -> None:
        schemas, tables, errors = load_sources(self.root)
        if not errors:
            self.schemas = schemas
            self.tables = tables
        self._fingerprints = self.fingerprints()

    def fingerprints(self) -> dict[str, dict[str, str]]:
        out: dict[str, dict[str, str]] = {}
        for name in self.schemas:
            table_path = self.root / "tables" / f"{name}.txt"
            schema_path = self.root / "schemas" / f"{name}.json"
            schema_hash = hashlib.sha256(schema_path.read_bytes()).hexdigest() if schema_path.exists() else ""
            out[name] = {
                "sourceFingerprint": source_fingerprint(table_path, schema_path) if table_path.exists() else "",
                "schemaFingerprint": schema_hash,
            }
        return out

    def table_projection(self, name: str) -> dict[str, Any] | None:
        schema = self.schemas.get(name)
        table = self.tables.get(name)
        if schema is None or table is None:
            return None
        columns_out: list[dict[str, Any]] = []
        id_column = str(schema.get("idColumn", "id"))
        for column in schema.get("columns") or []:
            if not isinstance(column, dict) or not column.get("name"):
                continue
            item = dict(column)
            item["readOnly"] = str(column.get("name")) == id_column
            columns_out.append(item)
        column_map = _column_map(schema)
        rows_out: list[dict[str, Any]] = []
        for row in table.rows:
            cells: dict[str, Any] = {}
            id_cell = row.get(id_column, Cell("missing"))
            name_cell = row.get("name", Cell("missing"))
            _, id_value = effective_value(id_cell, column_map.get(id_column, {"type": "u32"}), self.tick_rate)
            _, name_value = effective_value(name_cell, column_map.get("name", {"type": "string"}), self.tick_rate)
            for column_name, column in column_map.items():
                if column_name in {id_column, "name"}:
                    continue
                cell = row.get(column_name, Cell("missing"))
                present, value = effective_value(cell, column, self.tick_rate)
                cells[column_name] = {
                    "state": cell.state,
                    "raw": cell.token(),
                    "effective": value if present else None,
                }
            rows_out.append({"id": id_value, "name": name_value, "cells": cells})
        table_path = self.root / "tables" / f"{name}.txt"
        schema_path = self.root / "schemas" / f"{name}.json"
        return {
            "table": name,
            "sourceFingerprint": source_fingerprint(table_path, schema_path),
            "columns": columns_out,
            "rows": rows_out,
        }

    def session_payload(self, repo_name: str) -> dict[str, Any]:
        dirty = []
        if self.settings.vcs != "none":
            dirty = self.adapter.status(["tables", "registry", "schemas"])
        revision = self.adapter.revision()
        revision_payload = {
            "vcs": self.settings.vcs,
            "id": revision.id if revision else "",
            "branch": revision.branch if revision else None,
            "dirty": bool(dirty),
        }
        tables = []
        fps = self.fingerprints()
        for name in sorted(self.schemas):
            table = self.tables[name]
            tables.append(
                {
                    "name": name,
                    "schemaPath": f"schemas/{name}.json",
                    "rowCount": len(table.rows),
                    "sourceFingerprint": fps[name]["sourceFingerprint"],
                    "schemaFingerprint": fps[name]["schemaFingerprint"],
                }
            )
        return {
            "repoName": repo_name,
            "revision": revision_payload,
            "tables": tables,
            "schemas": self.schemas,
            "settings": self.settings.as_public(),
            "capabilities": {
                "submit": True,
                "commit": self.commit_allowed,
                "export": ["csv", "tsv"],
                "events": True,
            },
        }

    def reload_settings(self, settings: Settings) -> None:
        self.settings = settings

    def subscribe(self) -> queue.Queue[dict[str, Any]]:
        pending: queue.Queue[dict[str, Any]] = queue.Queue()
        with self._lock:
            self._subscribers.append(pending)
        return pending

    def _publish(self, name: str, data: dict[str, Any]) -> None:
        event = {"name": name, "data": data}
        with self._lock:
            subscribers = list(self._subscribers)
        for pending in subscribers:
            pending.put(event)

    def check_revision(self) -> None:
        with self._source_lock:
            previous = dict(self._fingerprints)
            self.reload_from_disk()
            current = self._fingerprints
        for table_name, fps in current.items():
            old = previous.get(table_name, {})
            if fps.get("sourceFingerprint") and fps.get("sourceFingerprint") != old.get("sourceFingerprint"):
                self._publish(
                    "repo_revision_changed",
                    {
                        "table": table_name,
                        "sourceFingerprint": fps["sourceFingerprint"],
                        "previousSourceFingerprint": old.get("sourceFingerprint"),
                    },
                )
            if fps.get("schemaFingerprint") and fps.get("schemaFingerprint") != old.get("schemaFingerprint"):
                self._publish(
                    "schema_changed",
                    {
                        "table": table_name,
                        "schemaFingerprint": fps["schemaFingerprint"],
                        "previousSchemaFingerprint": old.get("schemaFingerprint"),
                    },
                )

    def start_watcher(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop_watcher(self) -> None:
        self._running = False

    def _loop(self) -> None:
        while self._running:
            time.sleep(2)
            if self._running:
                self.check_revision()

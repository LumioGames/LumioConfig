from __future__ import annotations

import hashlib
import queue
import threading
import time
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..fingerprint import source_fingerprint
from ..model import Cell
from ..patch import _cell_token, _merge_error, _row_by_id, merge_cell
from ..validate import _column_map, effective_value, load_sources, load_tick_rate
from .drafts import DraftStore
from .settings import Settings
from .vcs import VcsAdapter


@dataclass
class RebaseResult:
    ok: bool
    draft: dict[str, Any]
    conflicts: list[dict[str, Any]]
    base_fingerprint: str
    merged: int = 0
    code: str | None = None
    draft_version: int = 0

    def as_http(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "draft": self.draft,
            "conflicts": self.conflicts,
            "baseFingerprint": self.base_fingerprint,
            "merged": self.merged,
            "code": self.code,
            "draftVersion": self.draft_version,
        }


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
        self._history: dict[str, dict[str, dict[str, Any]]] = {}
        self._remember()

    def _remember(self) -> None:
        for name, table in self.tables.items():
            fps = self._fingerprints.get(name) or {}
            source_fp = fps.get("sourceFingerprint") or ""
            if not source_fp:
                continue
            bucket = self._history.setdefault(name, {})
            if source_fp not in bucket:
                bucket[source_fp] = {
                    "table": deepcopy(table),
                    "schemaFingerprint": fps.get("schemaFingerprint") or "",
                }

    def reload_from_disk(self) -> None:
        schemas, tables, errors = load_sources(self.root)
        if not errors:
            self.schemas = schemas
            self.tables = tables
        self._fingerprints = self.fingerprints()
        self._remember()

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

    def is_loaded(self, name: str) -> bool:
        """QA P2-6: 只判「表是否在会话里」。

        `table_projection` 会为指纹整读源文件;像 source_view 这类只需要成员判断的
        边界检查用它,会把「先判大小再读」的次序又翻回去。
        """
        return name in self.schemas and name in self.tables

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
                    "sourcePath": f"tables/{name}.txt",
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
                "export": ["csv", "tsv", "txt"],
                "events": True,
                "history": self.settings.vcs == "git",
                "reveal": self.settings.allow_reveal,
            },
        }

    def reload_settings(self, settings: Settings) -> None:
        self.settings = settings

    def rebase_draft(self, table: str, draft: dict[str, Any], drafts: DraftStore) -> RebaseResult:
        with self._source_lock:
            self.reload_from_disk()
            current_fp = (self._fingerprints.get(table) or {}).get("sourceFingerprint") or ""
            current_schema = (self._fingerprints.get(table) or {}).get("schemaFingerprint") or ""
            base_fp = str(draft.get("baseFingerprint") or "")
            snapshot = (self._history.get(table) or {}).get(base_fp)
            draft_schema = str(draft.get("schemaFingerprint") or "") or str((snapshot or {}).get("schemaFingerprint") or "")
            if draft_schema and current_schema and draft_schema != current_schema:
                return RebaseResult(ok=False, draft=draft, conflicts=[], base_fingerprint=base_fp, code="SCHEMA_CHANGED", draft_version=int(draft.get("draftVersion") or 0))
            schema = self.schemas[table]
            id_column = str(schema.get("idColumn", "id"))
            current_table = self.tables[table]
            base_table = snapshot["table"] if snapshot else None

            def as_token(value: Any) -> str:
                if isinstance(value, str):
                    return value
                if not isinstance(value, dict):
                    return "" if value is None else str(value)
                state = value.get("state")
                if state == "empty":
                    return '""'
                if state == "null":
                    return "null"
                if state == "default":
                    return "@default"
                if state == "missing":
                    return "@missing"
                raw = value.get("raw")
                return "" if raw is None else str(raw)

            def cell_token(row: dict[str, Cell] | None, column: str, fallback: str) -> str:
                token = _cell_token(row, column)
                return fallback if token is None else token

            conflicts: list[dict[str, Any]] = []
            new_rows: dict[str, Any] = {}
            merged = 0
            if base_table is not None:
                for current_row in current_table.rows:
                    rid = cell_token(current_row, id_column, "")
                    base_row = _row_by_id(base_table, rid, id_column)
                    if base_row is None:
                        merged += 1
                        continue
                    patch = (draft.get("rows") or {}).get(rid) or {}
                    for column in current_row:
                        if column in {id_column, "name"}:
                            continue
                        if cell_token(base_row, column, "@missing") != cell_token(current_row, column, "@missing") and column not in patch:
                            merged += 1

            for row_key, patch in (draft.get("rows") or {}).items():
                if row_key.startswith("draft:"):
                    new_rows[row_key] = patch
                    continue
                current_row = _row_by_id(current_table, row_key, id_column)
                base_row = _row_by_id(base_table, row_key, id_column) if base_table is not None else None
                if current_row is None:
                    name = row_key
                    if base_row and base_row.get("name"):
                        name = base_row["name"].token()
                    conflicts.append(
                        _merge_error(
                            table,
                            name,
                            "",
                            "DELETED_ROW_CONFLICT",
                            "row was deleted in the repository",
                            "drop your edits or recreate the row",
                            current=None,
                            row_id=row_key,
                        )
                    )
                    continue
                kept: dict[str, Any] = {}
                row_name = cell_token(current_row, "name", row_key)
                for column, value in patch.items():
                    if column == "name":
                        continue
                    draft_token = as_token(value)
                    base_token = cell_token(base_row, column, "@missing")
                    current_token = cell_token(current_row, column, "@missing")
                    decision = merge_cell(base_token, current_token, draft_token)
                    if decision.action == "conflict":
                        conflicts.append(
                            _merge_error(
                                table,
                                row_name,
                                column,
                                decision.code or "STALE_BASELINE",
                                "cell changed in the repository and in the draft",
                                "pick repository, draft, or a new value",
                                base=base_token,
                                current=current_token,
                                draft=draft_token,
                                row_id=row_key,
                            )
                        )
                    elif decision.action == "take_draft":
                        kept[column] = value
                name_value = patch.get("name")
                if isinstance(name_value, str):
                    decision = merge_cell(cell_token(base_row, "name", ""), cell_token(current_row, "name", ""), name_value)
                    if decision.action == "conflict":
                        conflicts.append(
                            _merge_error(
                                table,
                                row_name,
                                "name",
                                decision.code or "STALE_BASELINE",
                                "row name changed in the repository and in the draft",
                                "pick repository, draft, or a new value",
                                base=cell_token(base_row, "name", ""),
                                current=cell_token(current_row, "name", ""),
                                draft=name_value,
                                row_id=row_key,
                            )
                        )
                    elif decision.action == "take_draft":
                        kept["name"] = name_value
                if kept:
                    new_rows[row_key] = kept

            new_renamed: dict[str, str] = {}
            for row_id, new_name in (draft.get("renamed") or {}).items():
                current_row = _row_by_id(current_table, str(row_id), id_column)
                base_row = _row_by_id(base_table, str(row_id), id_column) if base_table is not None else None
                if current_row is None:
                    conflicts.append(
                        _merge_error(
                            table,
                            str(new_name),
                            "name",
                            "DELETED_ROW_CONFLICT",
                            "renamed row was deleted in the repository",
                            "drop your rename",
                            current=None,
                            row_id=str(row_id),
                        )
                    )
                    continue
                decision = merge_cell(cell_token(base_row, "name", ""), cell_token(current_row, "name", ""), str(new_name))
                if decision.action == "conflict":
                    conflicts.append(
                        _merge_error(
                            table,
                            cell_token(current_row, "name", str(row_id)),
                            "name",
                            decision.code or "STALE_BASELINE",
                            "row name changed in the repository and in the draft",
                            "pick repository, draft, or a new value",
                            base=cell_token(base_row, "name", ""),
                            current=cell_token(current_row, "name", ""),
                            draft=str(new_name),
                            row_id=str(row_id),
                        )
                    )
                elif decision.action == "take_draft":
                    new_renamed[str(row_id)] = str(new_name)

            new_deleted: list[str] = []
            for row_id in draft.get("deleted") or []:
                current_row = _row_by_id(current_table, str(row_id), id_column)
                base_row = _row_by_id(base_table, str(row_id), id_column) if base_table is not None else None
                if current_row is None:
                    continue
                changed = False
                if base_row is not None:
                    columns = set(base_row) | set(current_row)
                    changed = any(cell_token(base_row, column, "@missing") != cell_token(current_row, column, "@missing") for column in columns)
                if changed:
                    conflicts.append(
                        _merge_error(
                            table,
                            cell_token(current_row, "name", str(row_id)),
                            "",
                            "STALE_BASELINE",
                            "deleted row also changed in the repository",
                            "keep the repository row or delete again after refresh",
                            row_id=str(row_id),
                        )
                    )
                else:
                    new_deleted.append(str(row_id))

        next_draft = {
            "table": table,
            "baseFingerprint": current_fp,
            "schemaFingerprint": current_schema,
            "rows": new_rows,
            "renamed": new_renamed,
            "deleted": new_deleted,
            "draftVersion": int(draft.get("draftVersion") or 0),
        }
        if conflicts:
            return RebaseResult(
                ok=False,
                draft=next_draft,
                conflicts=conflicts,
                base_fingerprint=current_fp,
                merged=merged,
                draft_version=int(draft.get("draftVersion") or 0),
            )
        version = drafts.save(table, next_draft, int(draft.get("draftVersion") or 0))
        loaded = drafts.load(table) or next_draft
        return RebaseResult(
            ok=True,
            draft=loaded,
            conflicts=[],
            base_fingerprint=current_fp,
            merged=merged,
            draft_version=version,
        )


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

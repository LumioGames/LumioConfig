from __future__ import annotations

from pathlib import Path
from typing import Any

from .export import merge_layer_overlays
from .ids import live_ids, load_json_object
from .model import Cell
from .validate import _column_map, load_sources, load_tick_rate


def _set_token(raw: Any) -> str:
    if raw is None:
        return "null"
    if raw == "@missing":
        return "@missing"
    if raw == "@default":
        return "@default"
    if raw == "":
        return '""'
    if isinstance(raw, bool):
        return "true" if raw else "false"
    return str(raw)


def _row_by_name(rows: list[dict[str, Cell]], name: str) -> dict[str, Cell] | None:
    for row in rows:
        cell = row.get("name")
        if cell and cell.state == "value" and cell.value == name:
            return row
    return None


def summarize_ops(schema: dict[str, Any], before_rows: list[dict[str, Cell]], ops: list[dict[str, Any]]) -> str:
    table = str(schema.get("table") or "")
    parts: list[str] = []
    for op in ops:
        action = str(op.get("op") or "")
        name = str(op.get("name") or "")
        if action == "update":
            row = _row_by_name(before_rows, name)
            fields = op.get("set") or {}
            for column, raw in fields.items():
                old = ""
                if row is not None and column in row:
                    old = row[column].token()
                parts.append(f"{name}.{column} {old} → {_set_token(raw)}")
        elif action == "create":
            parts.append(f"新增 {name}")
        elif action == "delete":
            parts.append(f"删除 {name}")
        elif action == "rename":
            parts.append(f"{name} 改名 {op.get('to')}")
    if not parts:
        return f"{table}:"
    return f"{table}: " + "；".join(parts)


def summarize_patch(root: Path, patch: dict[str, Any]) -> dict[str, Any]:
    root = Path(root)
    table_name = str(patch.get("table") or "")
    ops = patch.get("ops") if isinstance(patch.get("ops"), list) else []
    schemas, tables, _ = load_sources(root)
    schema = schemas.get(table_name) or {"table": table_name, "columns": []}
    table = tables.get(table_name)
    before_rows = list(table.rows) if table is not None else []
    origins: dict[str, dict[str, str]] = {}
    if table is not None and table_name in schemas:
        merged, origins, _errors = merge_layer_overlays(root, table_name, table, schema, load_tick_rate(root))
        before_rows = merged
    text = summarize_ops(schema, before_rows, ops)
    registry = live_ids(load_json_object(root / "registry" / "row-ids.json"), table_name)
    columns = _column_map(schema)
    id_column = str(schema.get("idColumn", "id"))
    changes: list[dict[str, Any]] = []
    for op in ops:
        if not isinstance(op, dict) or op.get("op") != "update":
            continue
        name = str(op.get("name") or "")
        row = _row_by_name(before_rows, name)
        permanent = registry.get(name)
        if row is not None:
            id_cell = row.get(id_column)
            if id_cell and id_cell.state in {"value", "empty"} and id_cell.value:
                try:
                    permanent = int(id_cell.value)
                except (TypeError, ValueError):
                    pass
        for column, raw in (op.get("set") or {}).items():
            before_cell = row.get(column, Cell("missing")) if row is not None else Cell("missing")
            changes.append(
                {
                    "table": table_name,
                    "name": name,
                    "id": permanent,
                    "column": column,
                    "before": before_cell.token(),
                    "after": _set_token(raw),
                    "unit": columns.get(column, {}).get("unit"),
                    "origin": origins.get(name, {}).get(column, "engine"),
                }
            )
    return {"text": text, "changes": changes}

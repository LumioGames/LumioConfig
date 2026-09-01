from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .model import Cell, TableSource
from .unicode_policy import normalize_string
from .validate import _column_map, effective_value


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _row_key(row: dict[str, Cell], id_column: str) -> tuple[int, object]:
    cell = row.get(id_column)
    raw = cell.value if cell and cell.state in {"value", "empty"} else ""
    try:
        return (0, int(raw or "0"))
    except (TypeError, ValueError):
        return (1, raw or "")


def canonical_table_value(table: TableSource, schema: dict[str, Any]) -> dict[str, Any]:
    columns = _column_map(schema)
    id_column = str(schema.get("idColumn", "id"))
    rows: list[dict[str, Any]] = []
    for row in sorted(table.rows, key=lambda item: _row_key(item, id_column)):
        values: dict[str, Any] = {}
        for name in schema_columns(schema):
            column = columns[name]
            cell = row.get(name, Cell("missing"))
            present, value = effective_value(cell, column)
            if present and column.get("type") == "string" and isinstance(value, str):
                value = normalize_string(value)
            values[name] = cell.canonical(value if present else None)
        rows.append(values)
    return {
        "table": table.name,
        "schema": schema,
        "rows": rows,
    }


def schema_columns(schema: dict[str, Any]) -> list[str]:
    return [str(column["name"]) for column in schema.get("columns", []) if isinstance(column, dict) and column.get("name")]


def content_fingerprint(table: TableSource, schema: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(canonical_table_value(table, schema))).hexdigest()


def source_fingerprint(table_path: Path, schema_path: Path) -> str:
    digest = hashlib.sha256()
    for path in (schema_path, table_path):
        data = path.read_bytes()
        digest.update(len(data).to_bytes(8, "big"))
        digest.update(data)
    return digest.hexdigest()


def package_fingerprint(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def aggregate_fingerprint(parts: list[str]) -> str:
    return hashlib.sha256(canonical_json(sorted(parts))).hexdigest()

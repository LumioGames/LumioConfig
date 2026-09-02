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


def _ordinal_sort_key(column: dict[str, Any], index: int) -> tuple[int, int, int]:
    ordinal = column.get("ordinal")
    if type(ordinal) is int:
        return (0, ordinal, index)
    return (1, index, index)


def ordered_schema_columns(schema: dict[str, Any]) -> list[dict[str, Any]]:
    columns = [column for column in schema.get("columns", []) if isinstance(column, dict) and column.get("name")]
    return [column for _, column in sorted(enumerate(columns), key=lambda item: _ordinal_sort_key(item[1], item[0]))]


def canonical_table_value(table: TableSource, schema: dict[str, Any], tick_rate: int = 60) -> dict[str, Any]:
    columns = _column_map(schema)
    id_column = str(schema.get("idColumn", "id"))
    ordered = ordered_schema_columns(schema)
    rows: list[dict[str, Any]] = []
    for row in sorted(table.rows, key=lambda item: _row_key(item, id_column)):
        values: dict[str, Any] = {}
        for column in ordered:
            name = str(column["name"])
            cell = row.get(name, Cell("missing"))
            present, value = effective_value(cell, columns[name], tick_rate)
            if present and column.get("type") == "string" and isinstance(value, str):
                value = normalize_string(value)
            values[name] = cell.canonical(value if present else None)
        rows.append(values)
    canonical_schema = dict(schema)
    canonical_schema["columns"] = ordered
    return {
        "table": table.name,
        "schema": canonical_schema,
        "rows": rows,
    }


def schema_columns(schema: dict[str, Any]) -> list[str]:
    return [str(column["name"]) for column in ordered_schema_columns(schema)]


def content_fingerprint(table: TableSource, schema: dict[str, Any], tick_rate: int = 60) -> str:
    return hashlib.sha256(canonical_json(canonical_table_value(table, schema, tick_rate))).hexdigest()


def fingerprint_files(files: list[Path], relative_to: Path) -> str:
    digest = hashlib.sha256()
    base = relative_to.resolve()
    ordered = sorted(
        {path.resolve() for path in files if path.is_file()},
        key=lambda path: path.relative_to(base).as_posix(),
    )
    for path in ordered:
        rel = path.relative_to(base).as_posix().encode("utf-8")
        data = path.read_bytes()
        digest.update(len(rel).to_bytes(8, "big"))
        digest.update(rel)
        digest.update(len(data).to_bytes(8, "big"))
        digest.update(data)
    return digest.hexdigest()


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

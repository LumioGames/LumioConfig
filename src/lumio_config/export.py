from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .fingerprint import aggregate_fingerprint, content_fingerprint, package_fingerprint, source_fingerprint
from .model import Cell
from .validate import TARGETS, _column_map, effective_value, load_sources, validate_repository


TARGET_DIRS = {"S": "server", "C": "client", "V": "voxel"}


class ValidationFailure(ValueError):
    def __init__(self, errors: list[dict[str, str]]) -> None:
        self.errors = errors
        super().__init__(f"source validation failed with {len(errors)} error(s)")


def _baseline_id(root: Path) -> str:
    metadata = root / "repository.yaml"
    if not metadata.exists():
        return "UNSPECIFIED"
    for line in metadata.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*baselineId:\s*(\S+)\s*$", line)
        if match:
            return match.group(1)
    return "UNSPECIFIED"


def _typed_rows(table: Any, schema: dict[str, Any]) -> list[dict[str, Any]]:
    columns = _column_map(schema)
    id_column = str(schema.get("idColumn", "id"))
    def row_key(row: dict[str, Cell]) -> tuple[int, object]:
        cell = row.get(id_column)
        raw = cell.value if cell and cell.state in {"value", "empty"} else ""
        try:
            return (0, int(raw or "0"))
        except (TypeError, ValueError):
            return (1, raw or "")

    result: list[dict[str, Any]] = []
    for row in sorted(table.rows, key=row_key):
        output: dict[str, Any] = {}
        for name, column in columns.items():
            present, value = effective_value(row.get(name, Cell("missing")), column)
            if present:
                output[name] = value
        result.append(output)
    return result


def _project(rows: list[dict[str, Any]], schema: dict[str, Any], target: str) -> list[dict[str, Any]]:
    columns = _column_map(schema)
    visible = {name for name, column in columns.items() if target in set(str(column.get("visibility", "S")))}
    return [{name: row[name] for name in columns if name in visible and name in row} for row in rows]


def _write_json(path: Path, value: Any) -> bytes:
    data = json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def export_repository(root: Path, output: Path) -> dict[str, Any]:
    root = Path(root)
    output = Path(output)
    errors = validate_repository(root)
    if errors:
        raise ValidationFailure(errors)
    schemas, tables, load_errors = load_sources(root)
    if load_errors:
        raise ValidationFailure([error.as_dict() for error in load_errors])

    table_entries: list[dict[str, Any]] = []
    all_content: list[str] = []
    all_source: list[str] = []
    all_packages: list[str] = []
    for table_name in sorted(schemas):
        schema = schemas[table_name]
        table = tables[table_name]
        content_hash = content_fingerprint(table, schema)
        schema_path = root / "schemas" / f"{table_name}.json"
        source_hash = source_fingerprint(table.path, schema_path)
        typed = _typed_rows(table, schema)
        entry: dict[str, Any] = {
            "table": table_name,
            "contentFingerprint": content_hash,
            "sourceFingerprint": source_hash,
            "projections": {},
        }
        for target in TARGETS:
            target_dir = TARGET_DIRS[target]
            payload = {
                "table": table_name,
                "target": target,
                "contentFingerprint": content_hash,
                "rows": _project(typed, schema, target),
            }
            relative = Path(target_dir) / f"{table_name}.json"
            data = _write_json(output / relative, payload)
            package_hash = package_fingerprint(data)
            entry["projections"][target] = {
                "path": relative.as_posix(),
                "packageFingerprint": package_hash,
            }
            all_packages.append(package_hash)
        table_entries.append(entry)
        all_content.append(content_hash)
        all_source.append(source_hash)

    manifest = {
        "formatVersion": 1,
        "baselineId": _baseline_id(root),
        "targets": list(TARGETS),
        "tables": table_entries,
        "contentFingerprint": aggregate_fingerprint(all_content),
        "packageFingerprint": aggregate_fingerprint(all_packages),
        "sourceFingerprint": aggregate_fingerprint(all_source),
    }
    _write_json(output / "manifest.json", manifest)
    return manifest

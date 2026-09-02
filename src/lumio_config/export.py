from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .fingerprint import (
    aggregate_fingerprint,
    content_fingerprint,
    fingerprint_files,
    package_fingerprint,
    source_fingerprint,
)
from .manifest import LAYER_ORDER, TARGET_DIRS, build_release_manifest, build_target_manifest, table_descriptor
from .model import Cell, TableParseError, TableSource, ValidationError
from .text_table import parse_table
from .validate import (
    TARGETS,
    _column_map,
    _error,
    _parse_scalar,
    effective_value,
    load_sources,
    load_tick_rate,
    validate_repository,
)


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


def _typed_rows(table: Any, schema: dict[str, Any], tick_rate: int) -> list[dict[str, Any]]:
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
            present, value = effective_value(row.get(name, Cell("missing")), column, tick_rate)
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


def _row_name(row: dict[str, Cell]) -> str | None:
    cell = row.get("name")
    if cell and cell.state == "value" and cell.value:
        return cell.value
    return None


def _clone_rows(table: TableSource) -> list[dict[str, Cell]]:
    return [dict(row) for row in table.rows]


def _compiler_hash() -> str:
    package = Path(__file__).resolve().parent
    return fingerprint_files(list(package.glob("*.py")), package)


def _input_hash(root: Path) -> str:
    files: list[Path] = []
    for folder in ("schemas", "tables", "registry", "layers"):
        base = root / folder
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.name == ".issue.lock" or "__pycache__" in path.parts:
                continue
            files.append(path)
    return fingerprint_files(files, root)


def _output_hash(output: Path) -> str:
    files = [
        path
        for path in output.rglob("*")
        if path.is_file() and path.relative_to(output).as_posix() != "manifest.json"
    ]
    return fingerprint_files(files, output)


def merge_layer_overlays(
    root: Path,
    table_name: str,
    table: TableSource,
    schema: dict[str, Any],
    tick_rate: int,
) -> tuple[list[dict[str, Cell]], dict[str, dict[str, str]], list[ValidationError]]:
    rows = _clone_rows(table)
    columns = _column_map(schema)
    id_column = str(schema.get("idColumn", "id"))
    origins: dict[str, dict[str, str]] = {}
    for row in rows:
        name = _row_name(row)
        if name is None:
            continue
        origins[name] = {column: "engine" for column in columns}
    errors: list[ValidationError] = []
    by_name = {_row_name(row): row for row in rows if _row_name(row) is not None}
    for layer in LAYER_ORDER:
        path = root / "layers" / layer / f"{table_name}.txt"
        if not path.exists():
            continue
        try:
            overlay = parse_table(path.read_text(encoding="utf-8"), path)
        except (OSError, TableParseError) as exc:
            code = getattr(exc, "code", "TABLE_INVALID")
            errors.append(_error(table_name, code=code, message=str(exc), suggestion="format the overlay with the LumioConfig formatter"))
            continue
        if overlay.name != table_name:
            errors.append(
                _error(
                    table_name,
                    code="TABLE_NAME_MISMATCH",
                    message=f"overlay declares table {overlay.name}",
                    suggestion=f"set table: {table_name}",
                )
            )
        for overlay_row in overlay.rows:
            name = _row_name(overlay_row)
            target = by_name.get(name) if name is not None else None
            if target is None:
                errors.append(
                    _error(
                        table_name,
                        name or "<missing>",
                        "name",
                        "LAYER_CREATE_FORBIDDEN",
                        "layer overlays may only update existing rows",
                        "remove the overlay row or create it in tables/ through the patch channel",
                    )
                )
                continue
            for column_name, cell in overlay_row.items():
                if column_name not in columns:
                    errors.append(
                        _error(
                            table_name,
                            name or "",
                            column_name,
                            "UNKNOWN_COLUMN",
                            f"{column_name} is not declared by the schema",
                            "remove the column or add it to the schema",
                        )
                    )
                    continue
                if column_name in {id_column, "name"} or cell.state == "missing":
                    continue
                _present, _value, parse_error = _parse_scalar(cell, columns[column_name], tick_rate)
                if parse_error:
                    errors.append(
                        _error(
                            table_name,
                            name or "",
                            column_name,
                            parse_error,
                            f"{column_name} overlay is not a valid {columns[column_name].get('type')}",
                            "fix the overlay cell or remove it",
                        )
                    )
                    continue
                target[column_name] = cell
                origins[str(name)][column_name] = layer
    return rows, origins, errors


def export_repository(root: Path, output: Path) -> dict[str, Any]:
    root = Path(root)
    output = Path(output)
    errors = validate_repository(root)
    if errors:
        raise ValidationFailure(errors)
    schemas, tables, load_errors = load_sources(root)
    if load_errors:
        raise ValidationFailure([error.as_dict() for error in load_errors])
    tick_rate = load_tick_rate(root)

    table_entries: list[dict[str, Any]] = []
    target_tables: dict[str, list[dict[str, Any]]] = {target: [] for target in TARGETS}
    all_content: list[str] = []
    all_source: list[str] = []
    all_packages: list[str] = []
    origins_payload: dict[str, dict[str, dict[str, str]]] = {}
    layer_errors: list[ValidationError] = []

    compiled: dict[str, tuple[TableSource, dict[str, Any], str, str, list[dict[str, Any]]]] = {}
    for table_name in sorted(schemas):
        schema = schemas[table_name]
        table = tables[table_name]
        merged_rows, origins, overlay_errors = merge_layer_overlays(root, table_name, table, schema, tick_rate)
        layer_errors.extend(overlay_errors)
        working = TableSource(table.name, table.schema_ref, table.columns, merged_rows, table.path)
        compiled[table_name] = (
            working,
            schema,
            content_fingerprint(working, schema, tick_rate),
            source_fingerprint(table.path, root / "schemas" / f"{table_name}.json"),
            _typed_rows(working, schema, tick_rate),
        )
        origins_payload[table_name] = origins

    if layer_errors:
        raise ValidationFailure([error.as_dict() for error in layer_errors])

    output.mkdir(parents=True, exist_ok=True)
    for table_name in sorted(compiled):
        working, schema, content_hash, source_hash, typed = compiled[table_name]
        entry: dict[str, Any] = {
            "table": table_name,
            "contentFingerprint": content_hash,
            "sourceFingerprint": source_hash,
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
            descriptor = table_descriptor(
                table_name,
                content_hash,
                source_hash,
                relative.as_posix(),
                package_hash,
            )
            target_tables[target].append(descriptor)
            all_packages.append(package_hash)
        table_entries.append(entry)
        all_content.append(content_hash)
        all_source.append(source_hash)

    _write_json(output / "origins.json", origins_payload)
    for target in TARGETS:
        _write_json(output / TARGET_DIRS[target] / "manifest.json", build_target_manifest(target, target_tables[target]))

    manifest = build_release_manifest(
        baseline_id=_baseline_id(root),
        targets=list(TARGETS),
        tables=table_entries,
        content_fingerprint=aggregate_fingerprint(all_content),
        package_fingerprint=aggregate_fingerprint(all_packages),
        source_fingerprint=aggregate_fingerprint(all_source),
        compiler_hash=_compiler_hash(),
        input_hash=_input_hash(root),
        output_hash=_output_hash(output),
    )
    _write_json(output / "manifest.json", manifest)
    return manifest

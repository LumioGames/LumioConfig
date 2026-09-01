from __future__ import annotations

from pathlib import Path
from typing import Any

from .ids import allocate_permanent_id, issue_lock, load_json_object, write_json
from .model import Cell, TableSource, ValidationError
from .text_table import format_table_text
from .validate import (
    _column_map,
    _error,
    _parse_scalar,
    _schema_columns,
    _sort_errors,
    load_sources,
    validate_repository,
)


def _row_by_name(table: TableSource, name: str) -> dict[str, Cell] | None:
    for row in table.rows:
        cell = row.get("name")
        if cell and cell.state == "value" and cell.value == name:
            return row
    return None


def _cell_from_patch_value(raw: Any) -> Cell:
    if raw is None:
        return Cell("null")
    if raw == "@missing":
        return Cell("missing")
    if raw == "@default":
        return Cell("default")
    if raw == "":
        return Cell("empty", "")
    if isinstance(raw, bool):
        return Cell("value", "true" if raw else "false")
    if isinstance(raw, int):
        return Cell("value", str(raw))
    if isinstance(raw, float):
        return Cell("value", format(raw, "g"))
    return Cell("value", str(raw))


def _resolve_ref_name(name: str, target: str, row_ids: dict[str, Any], tables: dict[str, TableSource]) -> str | None:
    mapping = row_ids.get(target, {})
    if isinstance(mapping, dict) and name in mapping:
        return str(mapping[name])
    table = tables.get(target)
    if table is None:
        return None
    row = _row_by_name(table, name)
    if row is None:
        return None
    identifier = row.get("id")
    if identifier is None or identifier.value is None:
        return None
    return identifier.value


def _snapshot(paths: list[Path]) -> dict[Path, bytes]:
    return {path: path.read_bytes() for path in paths if path.exists()}


def _restore(snapshot: dict[Path, bytes]) -> None:
    for path, data in snapshot.items():
        path.write_bytes(data)


def _field_errors(
    table_name: str,
    row_name: str,
    fields: dict[str, Any],
    schema: dict[str, Any],
    row_ids: dict[str, Any],
    tables: dict[str, TableSource],
) -> list[ValidationError]:
    errors: list[ValidationError] = []
    columns = _column_map(schema)
    for column_name, raw in fields.items():
        if column_name == "id":
            errors.append(_error(table_name, row_name, "id", "PATCH_ASSIGNS_ID", "patches must not assign a permanent id", "omit id; the issuer allocates it at apply time"))
            continue
        if column_name == "name":
            errors.append(_error(table_name, row_name, "name", "PATCH_USE_RENAME", "name changes must use the rename op", "submit a rename op instead of setting name"))
            continue
        column = columns.get(column_name)
        if column is None:
            errors.append(_error(table_name, row_name, column_name, "UNKNOWN_COLUMN", f"{column_name} is not declared by the schema", "remove the field or add it to the schema"))
            continue
        cell = _cell_from_patch_value(raw)
        if column.get("type") == "ref" and cell.state == "value" and cell.value is not None:
            target = str(column.get("refTarget", ""))
            resolved = _resolve_ref_name(cell.value, target, row_ids, tables)
            if resolved is None:
                errors.append(_error(table_name, row_name, column_name, "MISSING_REF", f"reference {cell.value} is not present in {target}", "create the named target row first or use an existing name"))
                continue
            cell = Cell("value", resolved)
        present, _value, parse_error = _parse_scalar(cell, column)
        if parse_error:
            errors.append(_error(table_name, row_name, column_name, parse_error, f"{column_name} expects {column.get('type')}", "replace the value with a correctly typed scalar"))
            continue
        if column.get("required") and (not present or cell.state == "null"):
            errors.append(_error(table_name, row_name, column_name, "MISSING_REQUIRED", f"{column_name} is required", "provide a value"))
    return errors


def _resolved_fields(
    fields: dict[str, Any],
    schema: dict[str, Any],
    row_ids: dict[str, Any],
    tables: dict[str, TableSource],
) -> dict[str, Cell]:
    columns = _column_map(schema)
    resolved: dict[str, Cell] = {}
    for column_name, raw in fields.items():
        cell = _cell_from_patch_value(raw)
        column = columns[column_name]
        if column.get("type") == "ref" and cell.state == "value" and cell.value is not None:
            target = str(column.get("refTarget", ""))
            mapped = _resolve_ref_name(cell.value, target, row_ids, tables)
            if mapped is not None:
                cell = Cell("value", mapped)
        resolved[column_name] = cell
    return resolved


def validate_patch(root: Path, patch: dict[str, Any]) -> list[dict[str, str]]:
    return _sort_errors(_validate_patch_errors(Path(root), patch))


def _validate_patch_errors(root: Path, patch: dict[str, Any]) -> list[ValidationError]:
    errors: list[ValidationError] = []
    if not isinstance(patch, dict):
        return [_error("", code="PATCH_INVALID", message="patch must be a JSON object", suggestion="write an object with table and ops")]
    table_name = str(patch.get("table") or "")
    ops = patch.get("ops")
    if not table_name:
        errors.append(_error("", code="PATCH_INVALID", message="table is required", suggestion="set table to an existing source table"))
    if not isinstance(ops, list):
        errors.append(_error(table_name, code="PATCH_INVALID", message="ops must be an array", suggestion="put create/update/rename/delete objects in ops"))
        return errors
    schemas, tables, load_errors = load_sources(root)
    errors.extend(load_errors)
    if table_name not in schemas or table_name not in tables:
        errors.append(_error(table_name, code="PATCH_UNKNOWN_TABLE", message=f"table {table_name} is not a source table", suggestion="use skills, effects, or drops"))
        return errors
    schema = schemas[table_name]
    table = tables[table_name]
    row_ids = load_json_object(root / "registry" / "row-ids.json")
    required = {str(column.get("name")) for column in _schema_columns(schema) if column.get("required")}
    required.discard(str(schema.get("idColumn", "id")))
    required.discard("name")
    seen_names: set[str] = set()
    for op in ops:
        if not isinstance(op, dict):
            errors.append(_error(table_name, code="PATCH_INVALID", message="each op must be an object", suggestion="write {op, name, ...}"))
            continue
        action = str(op.get("op") or "")
        name = str(op.get("name") or "")
        if not name:
            errors.append(_error(table_name, column="name", code="PATCH_INVALID", message="op name is required", suggestion="identify the row by its readable name"))
            continue
        if name in seen_names:
            errors.append(_error(table_name, name, "name", "PATCH_DUPLICATE_NAME", f"{name} appears twice in this patch", "keep one op per name"))
        seen_names.add(name)
        existing = _row_by_name(table, name)
        if action == "create":
            fields = op.get("set")
            if existing is not None:
                errors.append(_error(table_name, name, "name", "PATCH_DUPLICATE_NAME", f"{name} already exists", "use update or pick a new name"))
            if not isinstance(fields, dict):
                errors.append(_error(table_name, name, code="PATCH_INVALID", message="create requires set", suggestion="put column values in set"))
                continue
            missing = required - set(fields)
            for column_name in sorted(missing):
                errors.append(_error(table_name, name, column_name, "MISSING_REQUIRED", f"{column_name} is required", "provide a value"))
            errors.extend(_field_errors(table_name, name, fields, schema, row_ids, tables))
        elif action == "update":
            fields = op.get("set")
            if existing is None:
                errors.append(_error(table_name, name, "name", "PATCH_UNKNOWN_NAME", f"{name} is not an existing row", "create the row first or fix the name"))
            if not isinstance(fields, dict) or not fields:
                errors.append(_error(table_name, name, code="PATCH_INVALID", message="update requires a non-empty set", suggestion="put changed columns in set"))
                continue
            errors.extend(_field_errors(table_name, name, fields, schema, row_ids, tables))
        elif action == "rename":
            target = str(op.get("to") or "")
            if existing is None:
                errors.append(_error(table_name, name, "name", "PATCH_UNKNOWN_NAME", f"{name} is not an existing row", "rename an existing readable name"))
            if not target:
                errors.append(_error(table_name, name, "to", "PATCH_INVALID", "rename requires to", "set to to the new readable name"))
            elif _row_by_name(table, target) is not None:
                errors.append(_error(table_name, name, "to", "PATCH_DUPLICATE_NAME", f"{target} already exists", "pick an unused name"))
        elif action == "delete":
            if existing is None:
                errors.append(_error(table_name, name, "name", "PATCH_UNKNOWN_NAME", f"{name} is not an existing row", "delete an existing readable name"))
        else:
            errors.append(_error(table_name, name, code="PATCH_UNKNOWN_OP", message=f"unsupported op {action}", suggestion="use create, update, rename, or delete"))
    return errors


def _apply_ops(root: Path, patch: dict[str, Any]) -> None:
    table_name = str(patch["table"])
    schemas, tables, _ = load_sources(root)
    schema = schemas[table_name]
    table = tables[table_name]
    row_ids = load_json_object(root / "registry" / "row-ids.json")
    tombstones = load_json_object(root / "registry" / "tombstones.json")
    mapping = row_ids.setdefault(table_name, {})
    if not isinstance(mapping, dict):
        mapping = {}
        row_ids[table_name] = mapping
    dead = tombstones.setdefault(table_name, [])
    if not isinstance(dead, list):
        dead = []
        tombstones[table_name] = dead
    columns = [str(column.get("name")) for column in _schema_columns(schema)]
    id_column = str(schema.get("idColumn", "id"))
    for op in patch["ops"]:
        action = op["op"]
        name = op["name"]
        if action == "create":
            allocated = allocate_permanent_id(table_name, row_ids, tombstones, table)
            fields = _resolved_fields(op["set"], schema, row_ids, tables)
            row: dict[str, Cell] = {}
            for column_name in columns:
                if column_name == id_column:
                    row[column_name] = Cell("value", str(allocated))
                elif column_name == "name":
                    row[column_name] = Cell("value", name)
                elif column_name in fields:
                    row[column_name] = fields[column_name]
                else:
                    row[column_name] = Cell("missing")
            table.rows.append(row)
            mapping[name] = allocated
        elif action == "update":
            row = _row_by_name(table, name)
            assert row is not None
            fields = _resolved_fields(op["set"], schema, row_ids, tables)
            row.update(fields)
        elif action == "rename":
            row = _row_by_name(table, name)
            assert row is not None
            new_name = str(op["to"])
            permanent = int(row[id_column].value)  # type: ignore[arg-type]
            row["name"] = Cell("value", new_name)
            del mapping[name]
            mapping[new_name] = permanent
        elif action == "delete":
            row = _row_by_name(table, name)
            assert row is not None
            permanent = int(row[id_column].value)  # type: ignore[arg-type]
            table.rows.remove(row)
            mapping.pop(name, None)
            if permanent not in {int(value) for value in dead}:
                dead.append(permanent)
            tombstones[table_name] = sorted(int(value) for value in dead)
    table.path.write_text(format_table_text(table), encoding="utf-8", newline="\n")
    write_json(root / "registry" / "row-ids.json", row_ids)
    write_json(root / "registry" / "tombstones.json", tombstones)


def apply_patch(root: Path, patch: dict[str, Any]) -> list[dict[str, str]]:
    root = Path(root)
    with issue_lock(root):
        errors = validate_patch(root, patch)
        if errors:
            return errors
        table_name = str(patch["table"])
        paths = [
            root / "tables" / f"{table_name}.txt",
            root / "registry" / "row-ids.json",
            root / "registry" / "tombstones.json",
        ]
        snapshot = _snapshot(paths)
        _apply_ops(root, patch)
        post_errors = validate_repository(root)
        if post_errors:
            _restore(snapshot)
            return post_errors
        return []

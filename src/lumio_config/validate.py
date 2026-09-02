from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from .model import Cell, TableParseError, TableSource, ValidationError
from .text_table import parse_table


INTEGER_TYPES = {
    "i32": (-2**31, 2**31 - 1),
    "i64": (-2**63, 2**63 - 1),
    "u32": (0, 2**32 - 1),
    "u64": (0, 2**64 - 1),
}
FLOAT_TYPES = {"f32", "f64"}
TARGETS = ("S", "C", "V")
_INTEGER = re.compile(r"^-?(0|[1-9][0-9]*)$")


def _error(
    table: str,
    row: object = "",
    column: str = "",
    code: str = "INVALID",
    message: str = "",
    suggestion: str = "fix the source value or schema",
) -> ValidationError:
    return ValidationError(str(table), str(row), column, code, message, suggestion)


def _schema_columns(schema: dict[str, Any]) -> list[dict[str, Any]]:
    columns = schema.get("columns")
    if not isinstance(columns, list):
        return []
    return [column for column in columns if isinstance(column, dict)]


def _column_map(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(column.get("name")): column for column in _schema_columns(schema) if column.get("name")}


def _target_visible(column: dict[str, Any], target: str) -> bool:
    return target in _visibility(column)


def _row_identifier(row: dict[str, Cell], id_column: str = "id") -> str:
    cell = row.get(id_column)
    if cell is None or cell.state not in {"value", "empty"} or cell.value is None:
        return "<missing>"
    return cell.value


def _default_cell(column: dict[str, Any]) -> Cell | None:
    if "default" not in column:
        return None
    value = column["default"]
    if value is None:
        return Cell("null")
    if value == "":
        return Cell("empty", "")
    if isinstance(value, bool):
        return Cell("value", "true" if value else "false")
    return Cell("value", str(value))


def _parse_scalar(cell: Cell, column: dict[str, Any]) -> tuple[bool, Any, str | None]:
    """Return (present, typed value, error code)."""
    if cell.state == "missing":
        return False, None, None
    if cell.state == "default":
        default = _default_cell(column)
        if default is None:
            return False, None, "MISSING_DEFAULT"
        return _parse_scalar(default, column)
    if cell.state == "null":
        return True, None, None
    assert cell.value is not None
    raw = cell.value
    kind = column.get("type")
    if cell.state == "empty":
        if kind == "string":
            return True, "", None
        return True, None, "TYPE_MISMATCH"
    if kind == "string":
        return True, raw, None
    if kind == "bool":
        if raw.lower() in {"true", "false"}:
            return True, raw.lower() == "true", None
        return True, None, "TYPE_MISMATCH"
    if kind in INTEGER_TYPES:
        if not _INTEGER.fullmatch(raw):
            return True, None, "TYPE_MISMATCH"
        value = int(raw)
        lower, upper = INTEGER_TYPES[kind]
        if not lower <= value <= upper:
            return True, None, "RANGE_OVERFLOW"
        return True, value, None
    if kind in FLOAT_TYPES:
        try:
            value = float(raw)
        except ValueError:
            return True, None, "TYPE_MISMATCH"
        if not math.isfinite(value):
            return True, None, "NON_FINITE_FLOAT"
        if kind == "f32":
            # The bootstrap accepts finite decimal input; the exact bit policy is
            # intentionally left to the architecture ADR described in PR #49.
            value = float(value)
        return True, value, None
    if kind == "enum":
        values = column.get("enumValues")
        if not isinstance(values, list) or raw not in values:
            return True, None, "INVALID_ENUM"
        return True, raw, None
    if kind == "ref":
        return True, raw, None
    return True, None, "UNKNOWN_TYPE"


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("schema must be a JSON object")
    return value


def _load_registry(root: Path, name: str) -> dict[str, Any]:
    path = root / "registry" / name
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}


def _visibility(column: dict[str, Any]) -> set[str]:
    raw = column.get("visibility", "S")
    if not isinstance(raw, str):
        return set()
    return set(raw)


def _sort_errors(errors: list[ValidationError]) -> list[dict[str, str]]:
    return [
        error.as_dict()
        for error in sorted(
            errors,
            key=lambda item: (item.table, item.row, item.column, item.code, item.message),
        )
    ]


def load_sources(root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, TableSource], list[ValidationError]]:
    schemas: dict[str, dict[str, Any]] = {}
    tables: dict[str, TableSource] = {}
    errors: list[ValidationError] = []
    schema_dir = root / "schemas"
    table_dir = root / "tables"
    for schema_path in sorted(schema_dir.glob("*.json")):
        try:
            schema = _load_json(schema_path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(_error(schema_path.stem, code="SCHEMA_INVALID", message=str(exc), suggestion="write a JSON object schema"))
            continue
        table_name = str(schema.get("table") or schema_path.stem)
        schemas[table_name] = schema
        table_path = table_dir / f"{table_name}.txt"
        if not table_path.exists():
            errors.append(_error(table_name, code="MISSING_TABLE", message=f"source table {table_path.name} does not exist", suggestion="add the matching tables/*.txt file"))
            continue
        try:
            tables[table_name] = parse_table(table_path.read_text(encoding="utf-8"), table_path)
        except (OSError, TableParseError) as exc:
            code = getattr(exc, "code", "TABLE_INVALID")
            errors.append(_error(table_name, code=code, message=str(exc), suggestion="format the table with the LumioConfig formatter"))
    return schemas, tables, errors


def validate_repository(root: Path) -> list[dict[str, str]]:
    root = Path(root)
    schemas, tables, errors = load_sources(root)
    ids_by_table: dict[str, set[str]] = {}

    for table_name, schema in schemas.items():
        columns = _schema_columns(schema)
        column_map = _column_map(schema)
        id_column = str(schema.get("idColumn", "id"))
        if not columns:
            errors.append(_error(table_name, code="SCHEMA_COLUMNS_MISSING", message="schema columns must be a non-empty array", suggestion="declare each table column"))
            continue
        names = [str(column.get("name", "")) for column in columns]
        if len(names) != len(set(names)):
            errors.append(_error(table_name, code="DUPLICATE_SCHEMA_COLUMN", message="schema contains duplicate column names", suggestion="declare each column once"))
        if id_column not in column_map:
            errors.append(_error(table_name, column=id_column, code="ID_COLUMN_MISSING", message=f"id column {id_column} is not declared", suggestion="declare the stable row id column"))
        seen_ordinals: dict[int, str] = {}
        for column in columns:
            name = str(column.get("name", ""))
            if "ordinal" not in column:
                errors.append(_error(table_name, column=name, code="MISSING_ORDINAL", message=f"{name} is missing integer ordinal", suggestion="assign a unique integer ordinal that survives rename and reorder"))
                continue
            ordinal = column["ordinal"]
            if type(ordinal) is not int:
                errors.append(_error(table_name, column=name, code="INVALID_ORDINAL", message=f"{name} ordinal must be an integer", suggestion="use a unique integer ordinal"))
                continue
            if ordinal in seen_ordinals:
                errors.append(_error(table_name, column=name, code="DUPLICATE_ORDINAL", message=f"{name} reuses ordinal {ordinal} already used by {seen_ordinals[ordinal]}", suggestion="give each column a unique ordinal"))
            else:
                seen_ordinals[ordinal] = name
        declared = set(column_map)
        for column in columns:
            name = str(column.get("name", ""))
            kind = column.get("type")
            if kind not in {"bool", *INTEGER_TYPES, *FLOAT_TYPES, "string", "enum", "ref"}:
                errors.append(_error(table_name, column=name, code="UNKNOWN_TYPE", message=f"{name} has unsupported type {kind}", suggestion="use a supported scalar, enum, or ref type"))
            visibility = _visibility(column)
            if not visibility or not visibility.issubset(set(TARGETS)):
                errors.append(_error(table_name, column=name, code="INVALID_VISIBILITY", message=f"{name} visibility must contain only S, C, or V", suggestion="set visibility to a non-empty S/C/V combination"))
            if kind == "enum" and not isinstance(column.get("enumValues"), list):
                errors.append(_error(table_name, column=name, code="ENUM_VALUES_MISSING", message=f"{name} enumValues must be an array", suggestion="declare the closed enum values"))

        table = tables.get(table_name)
        if table is None:
            continue
        if table.name != table_name:
            errors.append(_error(table_name, code="TABLE_NAME_MISMATCH", message=f"source declares table {table.name}", suggestion=f"set table: {table_name}"))
        if table.schema_ref.replace("\\", "/") != str(Path("schemas") / f"{table_name}.json").replace("\\", "/"):
            errors.append(_error(table_name, code="SCHEMA_REF_MISMATCH", message=f"source schema reference is {table.schema_ref}", suggestion=f"set schema: schemas/{table_name}.json"))
        unknown_columns = set(table.columns) - declared
        for column in sorted(unknown_columns):
            errors.append(_error(table_name, column=column, code="UNKNOWN_COLUMN", message=f"{column} is not declared by the schema", suggestion="remove the column or add it to the schema"))
        missing_columns = declared - set(table.columns)
        for column in sorted(missing_columns):
            errors.append(_error(table_name, column=column, code="SCHEMA_COLUMN_NOT_IN_SOURCE", message=f"{column} is missing from the source header", suggestion="add the declared column to the source table"))

        ids: set[str] = set()
        for row in table.rows:
            row_id = _row_identifier(row, id_column)
            if row_id in ids:
                errors.append(_error(table_name, row_id, id_column, "DUPLICATE_ID", f"row id {row_id} occurs more than once", "keep one row for each permanent id"))
            ids.add(row_id)
            for column_name, column in column_map.items():
                cell = row.get(column_name, Cell("missing"))
                present, value, parse_error = _parse_scalar(cell, column)
                required = bool(column.get("required", False))
                if not present:
                    if required:
                        errors.append(_error(table_name, row_id, column_name, "MISSING_REQUIRED", f"{column_name} is required", "provide a value or declare a schema default"))
                    continue
                if cell.state == "null" and required:
                    errors.append(_error(table_name, row_id, column_name, "NULL_REQUIRED", f"{column_name} cannot be null", "provide a typed value"))
                    continue
                if parse_error:
                    messages = {
                        "TYPE_MISMATCH": f"{column_name} expects {column.get('type')}",
                        "RANGE_OVERFLOW": f"{column_name} is outside the {column.get('type')} range",
                        "MISSING_DEFAULT": f"{column_name} uses @default but no default is declared",
                        "NON_FINITE_FLOAT": f"{column_name} must be a finite float",
                        "INVALID_ENUM": f"{column_name} is not one of the declared enum values",
                        "UNKNOWN_TYPE": f"{column_name} has an unsupported type",
                    }
                    suggestions = {
                        "TYPE_MISMATCH": "replace the value with a correctly typed scalar",
                        "RANGE_OVERFLOW": "use a value inside the declared range",
                        "MISSING_DEFAULT": "declare a default or provide a value",
                        "NON_FINITE_FLOAT": "use a finite decimal value",
                        "INVALID_ENUM": "use one of enumValues",
                        "UNKNOWN_TYPE": "use a supported type",
                    }
                    errors.append(_error(table_name, row_id, column_name, parse_error, messages[parse_error], suggestions[parse_error]))
                if value is not None and isinstance(value, (int, float)):
                    for bound_name, comparator in (("minimum", lambda actual, bound: actual < bound), ("maximum", lambda actual, bound: actual > bound)):
                        if bound_name in column:
                            try:
                                bound = float(column[bound_name])
                                if comparator(float(value), bound):
                                    code = "RANGE_OVERFLOW"
                                    errors.append(_error(table_name, row_id, column_name, code, f"{column_name} is outside the declared {bound_name}", "use a value inside the declared bounds"))
                            except (TypeError, ValueError):
                                errors.append(_error(table_name, row_id, column_name, "SCHEMA_BOUND_INVALID", f"{bound_name} is not numeric", "declare a numeric schema bound"))
            ids_by_table[table_name] = ids

    # References are checked after every table has contributed its ID set.
    for table_name, schema in schemas.items():
        table = tables.get(table_name)
        if table is None:
            continue
        column_map = _column_map(schema)
        id_column = str(schema.get("idColumn", "id"))
        for row in table.rows:
            row_id = _row_identifier(row, id_column)
            for column_name, column in column_map.items():
                if column.get("type") != "ref":
                    continue
                present, value, parse_error = _parse_scalar(row.get(column_name, Cell("missing")), column)
                if not present or parse_error or value is None:
                    continue
                target = str(column.get("refTarget", ""))
                if target not in ids_by_table or str(value) not in ids_by_table[target]:
                    errors.append(_error(table_name, row_id, column_name, "MISSING_REF", f"reference {value} is not present in {target}", "add the referenced row or change the id"))
                for consumer in TARGETS:
                    if _target_visible(column, consumer) and target in schemas:
                        target_id_column = str(schemas[target].get("idColumn", "id"))
                        target_id_schema = _column_map(schemas[target]).get(target_id_column)
                        if target_id_schema is not None and not _target_visible(target_id_schema, consumer):
                            errors.append(_error(table_name, row_id, column_name, "HIDDEN_REF_TARGET", f"{column_name} is visible to {consumer} but {target}.{target_id_column} is hidden", "make the target id visible or remove this target projection"))

    row_registry = _load_registry(root, "row-ids.json")
    for table_name, table in tables.items():
        declared_ids = row_registry.get(table_name)
        if not isinstance(declared_ids, dict) or not declared_ids:
            continue
        schema = schemas[table_name]
        id_column = str(schema.get("idColumn", "id"))
        for row in table.rows:
            row_id = _row_identifier(row, id_column)
            name_cell = row.get("name")
            if name_cell is None or name_cell.state != "value" or name_cell.value is None:
                continue
            registered = declared_ids.get(name_cell.value)
            if str(registered) != row_id:
                errors.append(_error(table_name, row_id, "id", "ID_REGISTRY_MISMATCH", f"name {name_cell.value} is registered as {registered}, not {row_id}", "update the registry through the allocation workflow"))

    tombstones = _load_registry(root, "tombstones.json")
    for table_name, active_ids in ids_by_table.items():
        dead = tombstones.get(table_name, [])
        if not isinstance(dead, list):
            errors.append(_error(table_name, code="TOMBSTONES_INVALID", message="tombstones must map tables to arrays", suggestion="write an array of retired ids"))
            continue
        for row_id in sorted(active_ids, key=str):
            if row_id in {str(value) for value in dead}:
                errors.append(_error(table_name, row_id, "id", "TOMBSTONED_ID", f"row id {row_id} is retired", "allocate a new permanent id"))

    return _sort_errors(errors)


def effective_value(cell: Cell, column: dict[str, Any]) -> tuple[bool, Any]:
    present, value, _ = _parse_scalar(cell, column)
    return present, value

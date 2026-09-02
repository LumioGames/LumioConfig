from __future__ import annotations

from pathlib import Path
from typing import Any

from .model import Cell, TableSource
from .validate import _column_map, effective_value, load_sources, load_tick_rate


CONTRACT = "lumio-config-tools/v1"


def envelope(**payload: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"contract": CONTRACT}
    body.update(payload)
    return body


def _typed_row(row: dict[str, Cell], schema: dict[str, Any], tick_rate: int) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for name, column in _column_map(schema).items():
        present, value = effective_value(row.get(name, Cell("missing")), column, tick_rate)
        if present:
            values[name] = value
    return values


def _row_name(row: dict[str, Cell]) -> str | None:
    cell = row.get("name")
    if cell and cell.state == "value" and cell.value:
        return cell.value
    return None


def _find_row(table: TableSource, schema: dict[str, Any], token: str) -> dict[str, Cell] | None:
    id_column = str(schema.get("idColumn", "id"))
    for row in table.rows:
        name = _row_name(row)
        if name == token:
            return row
        cell = row.get(id_column)
        if cell and cell.state in {"value", "empty"} and cell.value == token:
            return row
    return None


def _load(root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, TableSource], int, list[dict[str, str]]]:
    schemas, tables, load_errors = load_sources(root)
    errors = [error.as_dict() for error in load_errors]
    return schemas, tables, load_tick_rate(root), errors


def query_schema(root: Path, table_name: str) -> dict[str, Any]:
    schemas, _tables, _tick_rate, errors = _load(root)
    if errors:
        return envelope(ok=False, errors=errors)
    schema = schemas.get(table_name)
    if schema is None:
        return envelope(ok=False, errors=[{"table": table_name, "row": "", "column": "", "code": "PATCH_UNKNOWN_TABLE", "message": f"table {table_name} is not a source table", "suggestion": "use an existing table name"}])
    return envelope(ok=True, table=table_name, schema=schema)


def query_table(root: Path, table_name: str) -> dict[str, Any]:
    schemas, tables, tick_rate, errors = _load(root)
    if errors:
        return envelope(ok=False, errors=errors)
    schema = schemas.get(table_name)
    table = tables.get(table_name)
    if schema is None or table is None:
        return envelope(ok=False, errors=[{"table": table_name, "row": "", "column": "", "code": "PATCH_UNKNOWN_TABLE", "message": f"table {table_name} is not a source table", "suggestion": "use an existing table name"}])
    rows = [_typed_row(row, schema, tick_rate) for row in table.rows]
    return envelope(ok=True, table=table_name, rows=rows)


def query_row(root: Path, table_name: str, token: str) -> dict[str, Any]:
    schemas, tables, tick_rate, errors = _load(root)
    if errors:
        return envelope(ok=False, errors=errors)
    schema = schemas.get(table_name)
    table = tables.get(table_name)
    if schema is None or table is None:
        return envelope(ok=False, errors=[{"table": table_name, "row": token, "column": "", "code": "PATCH_UNKNOWN_TABLE", "message": f"table {table_name} is not a source table", "suggestion": "use an existing table name"}])
    row = _find_row(table, schema, token)
    if row is None:
        return envelope(ok=False, errors=[{"table": table_name, "row": token, "column": "name", "code": "UNKNOWN_ROW", "message": f"row {token} is not in {table_name}", "suggestion": "query an existing name or permanent id"}])
    return envelope(ok=True, table=table_name, row=_typed_row(row, schema, tick_rate))


def _token_matches_row(token: str, row: dict[str, Cell], schema: dict[str, Any]) -> bool:
    id_column = str(schema.get("idColumn", "id"))
    name = _row_name(row)
    if name == token:
        return True
    cell = row.get(id_column)
    return bool(cell and cell.state in {"value", "empty"} and cell.value == token)


def query_card(root: Path, table_name: str, token: str) -> dict[str, Any]:
    payload = query_row(root, table_name, token)
    if not payload.get("ok"):
        return payload
    schemas, tables, tick_rate, _errors = _load(root)
    schema = schemas[table_name]
    table = tables[table_name]
    row = _find_row(table, schema, token)
    assert row is not None
    typed = payload["row"]
    related: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(rel_table: str, rel_name: str, role: str) -> None:
        key = (rel_table, rel_name)
        if not rel_name or key in seen:
            return
        seen.add(key)
        related.append({"table": rel_table, "name": rel_name, "role": role})

    for column_name, column in _column_map(schema).items():
        if column.get("type") != "ref":
            continue
        target_name = str(column.get("refTarget") or "")
        target_schema = schemas.get(target_name)
        target_table = tables.get(target_name)
        if target_schema is None or target_table is None or column_name not in typed:
            continue
        token_value = str(typed[column_name])
        for target_row in target_table.rows:
            if _token_matches_row(token_value, target_row, target_schema):
                add(target_name, _row_name(target_row) or "", "ref")

    self_tokens = {str(typed.get("name", "")), str(typed.get(str(schema.get("idColumn", "id")), ""))}
    for other_name, other_schema in schemas.items():
        if other_name == table_name:
            continue
        other_table = tables.get(other_name)
        if other_table is None:
            continue
        for column_name, column in _column_map(other_schema).items():
            if column.get("type") != "ref" or str(column.get("refTarget") or "") != table_name:
                continue
            for other_row in other_table.rows:
                present, value = effective_value(other_row.get(column_name, Cell("missing")), column, tick_rate)
                if not present or value is None:
                    continue
                if str(value) in self_tokens:
                    add(other_name, _row_name(other_row) or "", "backref")
    return envelope(ok=True, table=table_name, name=_row_name(row), row=typed, related=related)

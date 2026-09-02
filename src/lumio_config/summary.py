from __future__ import annotations

from typing import Any

from .model import Cell


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

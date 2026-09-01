from __future__ import annotations

import re
from pathlib import Path

from .model import Cell, TableParseError, TableSource


_SEPARATOR = re.compile(r"^-{3,}$")


def _split_row(line: str, line_number: int) -> list[str]:
    text = line.strip()
    if not text.startswith("|"):
        raise TableParseError("ROW_NOT_PIPE_TABLE", "table row must start with |", line_number)
    pieces: list[str] = []
    current: list[str] = []
    escaped = False
    for char in text:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == "|":
            pieces.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if escaped:
        current.append("\\")
    pieces.append("".join(current).strip())
    if pieces and pieces[0] == "":
        pieces = pieces[1:]
    if pieces and pieces[-1] == "":
        pieces = pieces[:-1]
    if not pieces or any(not item for item in pieces):
        raise TableParseError("EMPTY_COLUMN", "table header and cells cannot contain empty column names", line_number)
    return pieces


def parse_table(text: str, path: Path) -> TableSource:
    metadata: dict[str, str] = {}
    header: list[str] | None = None
    rows: list[dict[str, Cell]] = []
    separator_seen = False
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line and not line.startswith("|"):
            key, value = line.split(":", 1)
            key = key.strip()
            if key in {"table", "schema"}:
                metadata[key] = value.strip()
                continue
        if not line.startswith("|"):
            raise TableParseError("UNEXPECTED_LINE", "expected table metadata or a pipe row", line_number)
        values = _split_row(line, line_number)
        if header is None:
            header = values
            if len(set(header)) != len(header):
                raise TableParseError("DUPLICATE_COLUMN", "table header contains duplicate columns", line_number)
            continue
        if not separator_seen:
            if not all(_SEPARATOR.fullmatch(value) for value in values) or len(values) != len(header):
                raise TableParseError("MISSING_SEPARATOR", "second pipe row must be a separator", line_number)
            separator_seen = True
            continue
        if len(values) > len(header):
            raise TableParseError("TOO_MANY_CELLS", "data row contains more cells than the header", line_number)
        values.extend(["@missing"] * (len(header) - len(values)))
        rows.append({column: Cell.from_token(value) for column, value in zip(header, values)})
    if not metadata.get("table"):
        raise TableParseError("MISSING_TABLE_NAME", "table metadata is required", 1)
    if not metadata.get("schema"):
        raise TableParseError("MISSING_SCHEMA", "schema metadata is required", 1)
    if header is None or not separator_seen:
        raise TableParseError("MISSING_HEADER", "table header and separator are required", 1)
    return TableSource(metadata["table"], metadata["schema"], tuple(header), rows, path)


def _escaped_token(cell: Cell) -> str:
    token = cell.token()
    if cell.state in {"value", "empty"}:
        return token.replace("\\", "\\\\").replace("|", "\\|")
    return token


def _row_sort_key(row: dict[str, Cell]) -> tuple[int, object]:
    cell = row.get("id")
    if cell and cell.state == "value" and cell.value is not None:
        try:
            return (0, int(cell.value))
        except ValueError:
            return (1, cell.value)
    return (2, "")


def format_table_text(table: TableSource) -> str:
    ordered_rows = sorted(table.rows, key=_row_sort_key)
    rendered_rows = [[_escaped_token(row[column]) for column in table.columns] for row in ordered_rows]
    widths = [len(column) for column in table.columns]
    for row in rendered_rows:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(value))

    def render(row: list[str]) -> str:
        return "| " + " | ".join(value.ljust(widths[index]) for index, value in enumerate(row)) + " |"

    separator = render(["-" * max(3, width) for width in widths])
    lines = [f"table: {table.name}", f"schema: {table.schema_ref}", "", render(list(table.columns)), separator]
    for index, row in enumerate(rendered_rows):
        if index:
            lines.append("")
        lines.append(render(row))
    return "\n".join(lines) + "\n"

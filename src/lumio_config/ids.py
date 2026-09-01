from __future__ import annotations

import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .model import TableSource


def seat_index_by_permanent_id(table: TableSource, id_column: str = "id") -> dict[int, int]:
    """Dense 0-based compile-time seats. Never persist this mapping."""
    identifiers: list[int] = []
    for row in table.rows:
        cell = row.get(id_column)
        if cell and cell.state == "value" and cell.value is not None:
            identifiers.append(int(cell.value))
    return {row_id: index for index, row_id in enumerate(sorted(identifiers))}


@contextmanager
def issue_lock(root: Path) -> Iterator[None]:
    lock_path = root / "registry" / ".issue.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(lock_path, "a+b")
    try:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            handle.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def load_json_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=True, indent=2) + "\n", encoding="utf-8", newline="\n")


def known_permanent_ids(
    table_name: str,
    row_ids: dict[str, Any],
    tombstones: dict[str, Any],
    table: TableSource | None,
) -> set[int]:
    known: set[int] = set()
    mapping = row_ids.get(table_name, {})
    if isinstance(mapping, dict):
        for raw in mapping.values():
            known.add(int(raw))
    dead = tombstones.get(table_name, [])
    if isinstance(dead, list):
        for raw in dead:
            known.add(int(raw))
    if table is not None:
        for row in table.rows:
            cell = row.get("id")
            if cell and cell.state == "value" and cell.value is not None:
                try:
                    known.add(int(cell.value))
                except ValueError:
                    continue
    return known


def allocate_permanent_id(
    table_name: str,
    row_ids: dict[str, Any],
    tombstones: dict[str, Any],
    table: TableSource | None,
) -> int:
    known = known_permanent_ids(table_name, row_ids, tombstones, table)
    if not known:
        raise ValueError(f"table {table_name} has no id namespace seed")
    dead = {int(value) for value in tombstones.get(table_name, [])} if isinstance(tombstones.get(table_name), list) else set()
    candidate = max(known) + 1
    while candidate in dead:
        candidate += 1
    return candidate

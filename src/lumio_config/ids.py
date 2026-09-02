from __future__ import annotations

import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .model import TableSource

ALIASES_KEY = "aliases"
FORBIDDEN_ORDINAL_KEYS = frozenset({"revisionOrdinal", "seat"})
ID_NAMESPACES = {
    "skills": (40000, 49999),
    "effects": (50000, 59999),
    "drops": (60000, 69999),
}


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
    payload = json.dumps(value, ensure_ascii=True, indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def live_ids(row_ids: dict[str, Any], table_name: str) -> dict[str, int]:
    mapping = row_ids.get(table_name, {})
    if not isinstance(mapping, dict):
        return {}
    out: dict[str, int] = {}
    for name, raw in mapping.items():
        if name == ALIASES_KEY or isinstance(raw, dict):
            continue
        try:
            out[str(name)] = int(raw)
        except (TypeError, ValueError):
            continue
    return out


def alias_ids(row_ids: dict[str, Any], table_name: str) -> dict[str, int]:
    blob = row_ids.get(ALIASES_KEY, {})
    if not isinstance(blob, dict):
        return {}
    mapping = blob.get(table_name, {})
    if not isinstance(mapping, dict):
        return {}
    out: dict[str, int] = {}
    for name, raw in mapping.items():
        try:
            out[str(name)] = int(raw)
        except (TypeError, ValueError):
            continue
    return out


def record_alias(row_ids: dict[str, Any], table_name: str, old_name: str, permanent_id: int) -> None:
    blob = row_ids.setdefault(ALIASES_KEY, {})
    if not isinstance(blob, dict):
        blob = {}
        row_ids[ALIASES_KEY] = blob
    table_aliases = blob.setdefault(table_name, {})
    if not isinstance(table_aliases, dict):
        table_aliases = {}
        blob[table_name] = table_aliases
    table_aliases[old_name] = permanent_id


def contains_forbidden_ordinal_keys(value: Any) -> bool:
    if isinstance(value, dict):
        if FORBIDDEN_ORDINAL_KEYS.intersection(value.keys()):
            return True
        return any(contains_forbidden_ordinal_keys(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_forbidden_ordinal_keys(item) for item in value)
    return False


def _registry_error(table: str, row: str, column: str, code: str, message: str, suggestion: str) -> dict[str, str]:
    return {
        "table": table,
        "row": row,
        "column": column,
        "code": code,
        "message": message,
        "suggestion": suggestion,
    }


def persisted_ordinal_errors(root: Path) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    for filename in ("row-ids.json", "tombstones.json"):
        path = Path(root) / "registry" / filename
        payload = load_json_object(path)
        if contains_forbidden_ordinal_keys(payload):
            errors.append(
                _registry_error(
                    "",
                    "",
                    "",
                    "ORDINAL_PERSISTED",
                    f"{filename} contains revisionOrdinal or seat",
                    "remove seat and revisionOrdinal; they are not persistent identity",
                )
            )
    return errors


def alias_conflict_errors(root: Path) -> list[dict[str, str]]:
    row_ids = load_json_object(Path(root) / "registry" / "row-ids.json")
    errors: list[dict[str, str]] = []
    blob = row_ids.get(ALIASES_KEY, {})
    if not isinstance(blob, dict):
        return errors
    for table_name, aliases in blob.items():
        if not isinstance(aliases, dict):
            continue
        live = live_ids(row_ids, str(table_name))
        for alias, raw in aliases.items():
            if alias in live:
                errors.append(
                    _registry_error(
                        str(table_name),
                        str(alias),
                        "name",
                        "ALIAS_CONFLICT",
                        f"alias {alias} collides with a live row name",
                        "delete the alias or rename the live row",
                    )
                )
            try:
                int(raw)
            except (TypeError, ValueError):
                errors.append(
                    _registry_error(
                        str(table_name),
                        str(alias),
                        "id",
                        "ALIAS_CONFLICT",
                        f"alias {alias} does not map to an integer id",
                        "point aliases at a permanent id",
                    )
                )
    return errors


def verify_registry(root: Path) -> list[dict[str, str]]:
    from .validate import load_sources

    root = Path(root)
    errors = persisted_ordinal_errors(root)
    errors.extend(alias_conflict_errors(root))
    row_ids = load_json_object(root / "registry" / "row-ids.json")
    tombstones = load_json_object(root / "registry" / "tombstones.json")
    schemas, tables, load_errors = load_sources(root)
    for error in load_errors:
        errors.append(error.as_dict() if hasattr(error, "as_dict") else dict(error))  # type: ignore[arg-type]

    for table_name, table in tables.items():
        live = live_ids(row_ids, table_name)
        dead = tombstones.get(table_name, [])
        dead_ids = {int(value) for value in dead} if isinstance(dead, list) else set()
        seen: dict[int, str] = {}
        lower, upper = ID_NAMESPACES.get(table_name, (1, 2**31 - 1))
        id_column = str(schemas.get(table_name, {}).get("idColumn", "id"))
        table_ids: dict[str, int] = {}
        for row in table.rows:
            name_cell = row.get("name")
            id_cell = row.get(id_column)
            if name_cell is None or name_cell.value is None or id_cell is None or id_cell.value is None:
                continue
            try:
                row_id = int(id_cell.value)
            except ValueError:
                continue
            table_ids[name_cell.value] = row_id
            if row_id in dead_ids:
                errors.append(
                    _registry_error(table_name, name_cell.value, "id", "TOMBSTONED_ID", f"row id {row_id} is retired", "allocate a new permanent id")
                )
            if not lower <= row_id <= upper:
                errors.append(
                    _registry_error(table_name, name_cell.value, "id", "ID_OUT_OF_RANGE", f"row id {row_id} is outside {lower}..{upper}", "use an id in the table namespace")
                )
            if row_id in seen:
                errors.append(
                    _registry_error(table_name, name_cell.value, "id", "DUPLICATE_ID", f"row id {row_id} is used by {seen[row_id]}", "keep one live row per id")
                )
            else:
                seen[row_id] = name_cell.value
        for name, row_id in live.items():
            if name not in table_ids:
                errors.append(
                    _registry_error(table_name, name, "id", "REGISTRY_DANGLING_NAME", f"{name} is registered but missing from the table", "remove the registry entry or restore the row")
                )
            elif table_ids[name] != row_id:
                errors.append(
                    _registry_error(table_name, name, "id", "ID_REGISTRY_MISMATCH", f"name {name} is registered as {row_id}, not {table_ids[name]}", "update the registry through rename/apply")
                )
            if row_id in dead_ids:
                errors.append(
                    _registry_error(table_name, name, "id", "TOMBSTONED_ID", f"registered id {row_id} is retired", "remove the live registry entry")
                )
            if not lower <= row_id <= upper:
                errors.append(
                    _registry_error(table_name, name, "id", "ID_OUT_OF_RANGE", f"registered id {row_id} is outside {lower}..{upper}", "use an id in the table namespace")
                )
            owner = seen.get(row_id)
            if owner and owner != name and name in table_ids:
                errors.append(
                    _registry_error(table_name, name, "id", "DUPLICATE_ID", f"row id {row_id} is used by {owner}", "keep one live name per id")
                )
        for name, row_id in table_ids.items():
            if name not in live:
                errors.append(
                    _registry_error(table_name, name, "id", "ID_REGISTRY_MISMATCH", f"table row {name} is not in the registry", "apply a create/rename through the issuer")
                )
        inverted: dict[int, str] = {}
        for name, row_id in live.items():
            if row_id in inverted:
                errors.append(
                    _registry_error(table_name, name, "id", "DUPLICATE_ID", f"row id {row_id} is registered to {inverted[row_id]} and {name}", "keep one live name per id")
                )
            else:
                inverted[row_id] = name
    return errors


def known_permanent_ids(
    table_name: str,
    row_ids: dict[str, Any],
    tombstones: dict[str, Any],
    table: TableSource | None,
) -> set[int]:
    known: set[int] = set()
    for raw in live_ids(row_ids, table_name).values():
        known.add(raw)
    for raw in alias_ids(row_ids, table_name).values():
        known.add(raw)
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

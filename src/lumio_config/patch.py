from __future__ import annotations

import copy
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .fingerprint import source_fingerprint
from .ids import (
    alias_ids,
    allocate_permanent_id,
    contains_forbidden_ordinal_keys,
    issue_lock,
    live_ids,
    load_json_object,
    record_alias,
    write_json,
)
from .model import Cell, TableSource, ValidationError
from .summary import summarize_ops
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
    mapping = live_ids(row_ids, target)
    if name in mapping:
        return str(mapping[name])
    aliases = alias_ids(row_ids, target)
    if name in aliases:
        return str(aliases[name])
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


@dataclass(frozen=True)
class MergeDecision:
    action: str
    token: str | None = None
    code: str | None = None


@dataclass
class MergeResult:
    effective_ops: list[dict[str, Any]]
    conflicts: list[dict[str, str]]
    skipped: bool


@dataclass
class ApplyResult:
    errors: list[dict[str, str]]
    source_fingerprint: str | None = None
    assigned_ids: dict[str, int] = field(default_factory=dict)
    summary: str = ""
    before_source_fingerprint: str | None = None

    def __iter__(self):
        return iter(self.errors)

    def __len__(self) -> int:
        return len(self.errors)

    def __bool__(self) -> bool:
        return bool(self.errors)

    def __getitem__(self, index: int) -> dict[str, str]:
        return self.errors[index]

    def __eq__(self, other: object) -> bool:
        if isinstance(other, list):
            return self.errors == other
        if isinstance(other, ApplyResult):
            return self.errors == other.errors
        return NotImplemented


def merge_cell(base: str, current: str | None, draft: str) -> MergeDecision:
    if current is None:
        return MergeDecision("conflict", code="DELETED_ROW_CONFLICT")
    if current == draft:
        return MergeDecision("noop")
    if base == current:
        return MergeDecision("take_draft", token=draft)
    if draft == base:
        return MergeDecision("noop")
    return MergeDecision("conflict", code="STALE_BASELINE")


def _schema_fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _row_id(row: dict[str, Cell], id_column: str = "id") -> str | None:
    cell = row.get(id_column)
    if cell and cell.state == "value" and cell.value is not None:
        return cell.value
    return None


def _row_by_id(table: TableSource, row_id: str, id_column: str = "id") -> dict[str, Cell] | None:
    for row in table.rows:
        if _row_id(row, id_column) == str(row_id):
            return row
    return None


def _locate_row(
    table: TableSource,
    name: str,
    mapping: dict[str, Any],
    expect: dict[str, Any] | None,
    id_column: str = "id",
) -> tuple[dict[str, Cell] | None, str | None]:
    row = _row_by_name(table, name)
    if row is not None:
        return row, _row_id(row, id_column)
    if expect and expect.get("id") is not None:
        wanted = str(expect["id"])
        found = _row_by_id(table, wanted, id_column)
        return found, wanted
    if isinstance(mapping, dict) and name in mapping:
        wanted = str(mapping[name])
        return _row_by_id(table, wanted, id_column), wanted
    return None, None


def _merge_error(
    table: str,
    row: str,
    column: str,
    code: str,
    message: str,
    suggestion: str,
    *,
    base: str = "",
    current: str | None = "",
    draft: str = "",
    row_id: str | None = "",
) -> dict[str, str]:
    return {
        "table": table,
        "row": row,
        "column": column,
        "code": code,
        "message": message,
        "suggestion": suggestion,
        "base": base,
        "current": "" if current is None else current,
        "draft": draft,
        "rowId": "" if row_id is None else str(row_id),
    }


def _cell_token(row: dict[str, Cell] | None, column: str) -> str | None:
    if row is None:
        return None
    cell = row.get(column)
    if cell is None:
        return "@missing"
    return cell.token()


def _drafts_match_current(table: TableSource, mapping: dict[str, Any], patch: dict[str, Any]) -> bool:
    for op in patch.get("ops") or []:
        if not isinstance(op, dict):
            return False
        action = str(op.get("op") or "")
        name = str(op.get("name") or "")
        expect = op.get("expect") if isinstance(op.get("expect"), dict) else None
        row, _ = _locate_row(table, name, mapping, expect)
        if action == "update":
            fields = op.get("set") or {}
            if row is None:
                return False
            for column, raw in fields.items():
                if _cell_token(row, column) != _cell_from_patch_value(raw).token():
                    return False
        elif action == "create":
            if _row_by_name(table, name) is None:
                return False
        elif action == "delete":
            if row is not None:
                return False
        elif action == "rename":
            target = str(op.get("to") or "")
            if _row_by_name(table, target) is None:
                return False
    return True


def merge_patch(root: Path, patch: dict[str, Any]) -> MergeResult:
    root = Path(root)
    table_name = str(patch.get("table") or "")
    ops = patch.get("ops")
    if not isinstance(ops, list):
        ops = []
    base = patch.get("base")
    if not isinstance(base, dict) or not base.get("sourceFingerprint"):
        return MergeResult(list(ops), [], skipped=True)

    schemas, tables, load_errors = load_sources(root)
    if load_errors or table_name not in tables:
        return MergeResult(
            [],
            [
                _merge_error(
                    table_name,
                    "",
                    "",
                    "PATCH_UNKNOWN_TABLE",
                    f"table {table_name} is not a source table",
                    "use an existing source table",
                )
            ],
            skipped=False,
        )

    table = tables[table_name]
    schema_path = root / "schemas" / f"{table_name}.json"
    table_path = root / "tables" / f"{table_name}.txt"
    if base.get("schemaFingerprint") and base["schemaFingerprint"] != _schema_fingerprint(schema_path):
        return MergeResult(
            [],
            [
                _merge_error(
                    table_name,
                    "",
                    "",
                    "SCHEMA_CHANGED",
                    "schema fingerprint does not match the open-time schema",
                    "reload the table and replay the edit",
                )
            ],
            skipped=False,
        )
    current_fp = source_fingerprint(table_path, schema_path)
    if base.get("sourceFingerprint") == current_fp:
        return MergeResult(list(ops), [], skipped=True)

    mapping = load_json_object(root / "registry" / "row-ids.json").get(table_name, {})
    if not isinstance(mapping, dict):
        mapping = {}
    id_column = str(schemas[table_name].get("idColumn", "id"))
    conflicts: list[dict[str, str]] = []
    effective: list[dict[str, Any]] = []
    for op in ops:
        if not isinstance(op, dict):
            continue
        action = str(op.get("op") or "")
        name = str(op.get("name") or "")
        expect = op.get("expect") if isinstance(op.get("expect"), dict) else None
        if action == "create":
            effective.append(copy.deepcopy(op))
            continue
        row, row_id = _locate_row(table, name, mapping, expect, id_column)
        display_name = row["name"].value if row and row.get("name") and row["name"].value else name
        if row is None:
            conflicts.append(
                _merge_error(
                    table_name,
                    name,
                    "",
                    "DELETED_ROW_CONFLICT",
                    f"row {name} was deleted in the current table",
                    "drop the change or recreate the row",
                    base="" if expect is None else str(expect.get("id", "")),
                    current="",
                    draft=name,
                    row_id=row_id or (str(expect.get("id")) if expect and expect.get("id") is not None else ""),
                )
            )
            continue
        if action == "update":
            fields = op.get("set") if isinstance(op.get("set"), dict) else {}
            kept: dict[str, Any] = {}
            for column, raw in fields.items():
                draft = _cell_from_patch_value(raw).token()
                current = _cell_token(row, column)
                base_token = str(expect[column]) if expect and column in expect else (current or "")
                decision = merge_cell(base_token, current, draft)
                if decision.action == "conflict":
                    conflicts.append(
                        _merge_error(
                            table_name,
                            display_name or name,
                            column,
                            decision.code or "STALE_BASELINE",
                            f"{column} changed in both the working tree and the patch",
                            "reload, pick a value, and replay the full patch",
                            base=base_token,
                            current=current,
                            draft=draft,
                            row_id=row_id,
                        )
                    )
                elif decision.action == "take_draft":
                    kept[column] = raw
            if kept:
                next_op = copy.deepcopy(op)
                next_op["name"] = display_name or name
                next_op["set"] = kept
                effective.append(next_op)
        elif action == "rename":
            target = str(op.get("to") or "")
            current = _cell_token(row, "name")
            base_token = str(expect["name"]) if expect and "name" in expect else name
            decision = merge_cell(base_token, current, target)
            if decision.action == "conflict":
                conflicts.append(
                    _merge_error(
                        table_name,
                        display_name or name,
                        "name",
                        decision.code or "STALE_BASELINE",
                        "name changed in both the working tree and the patch",
                        "reload, pick a name, and replay the full patch",
                        base=base_token,
                        current=current,
                        draft=target,
                        row_id=row_id,
                    )
                )
            elif decision.action == "take_draft":
                next_op = copy.deepcopy(op)
                next_op["name"] = display_name or name
                effective.append(next_op)
        elif action == "delete":
            next_op = copy.deepcopy(op)
            next_op["name"] = display_name or name
            effective.append(next_op)
    if conflicts:
        return MergeResult([], conflicts, skipped=False)
    return MergeResult(effective, [], skipped=False)


def validate_patch(root: Path, patch: dict[str, Any]) -> list[dict[str, str]]:
    root = Path(root)
    errors = _sort_errors(_validate_patch_errors(root, patch))
    if errors:
        return errors
    merged = merge_patch(root, patch)
    if merged.conflicts:
        return merged.conflicts
    return []


def _validate_patch_errors(root: Path, patch: dict[str, Any]) -> list[ValidationError]:
    errors: list[ValidationError] = []
    if not isinstance(patch, dict):
        return [_error("", code="PATCH_INVALID", message="patch must be a JSON object", suggestion="write an object with table and ops")]
    if contains_forbidden_ordinal_keys(patch):
        errors.append(_error(str(patch.get("table") or ""), code="ORDINAL_PERSISTED", message="patches must not persist seat or revisionOrdinal", suggestion="omit seat and revisionOrdinal; the issuer and compiler own those identities"))
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
        expect = op.get("expect") if isinstance(op.get("expect"), dict) else None
        mapping = row_ids.get(table_name, {})
        if not isinstance(mapping, dict):
            mapping = {}
        existing = _row_by_name(table, name)
        if existing is None and action != "create":
            existing, _ = _locate_row(table, name, mapping, expect)
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
            if existing is None and not (isinstance(patch.get("base"), dict) and patch["base"].get("sourceFingerprint")):
                errors.append(_error(table_name, name, "name", "PATCH_UNKNOWN_NAME", f"{name} is not an existing row", "create the row first or fix the name"))
            if not isinstance(fields, dict) or not fields:
                errors.append(_error(table_name, name, code="PATCH_INVALID", message="update requires a non-empty set", suggestion="put changed columns in set"))
                continue
            if existing is not None:
                errors.extend(_field_errors(table_name, name, fields, schema, row_ids, tables))
        elif action == "rename":
            target = str(op.get("to") or "")
            if existing is None and not (isinstance(patch.get("base"), dict) and patch["base"].get("sourceFingerprint")):
                errors.append(_error(table_name, name, "name", "PATCH_UNKNOWN_NAME", f"{name} is not an existing row", "rename an existing readable name"))
            if not target:
                errors.append(_error(table_name, name, "to", "PATCH_INVALID", "rename requires to", "set to to the new readable name"))
            elif _row_by_name(table, target) is not None:
                errors.append(_error(table_name, name, "to", "PATCH_DUPLICATE_NAME", f"{target} already exists", "pick an unused name"))
        elif action == "delete":
            if existing is None and not (isinstance(patch.get("base"), dict) and patch["base"].get("sourceFingerprint")):
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
            expect = op.get("expect") if isinstance(op.get("expect"), dict) else None
            row, _ = _locate_row(table, name, mapping, expect, id_column)
            assert row is not None
            fields = _resolved_fields(op["set"], schema, row_ids, tables)
            row.update(fields)
        elif action == "rename":
            expect = op.get("expect") if isinstance(op.get("expect"), dict) else None
            row, _ = _locate_row(table, name, mapping, expect, id_column)
            assert row is not None
            new_name = str(op["to"])
            permanent = int(row[id_column].value)  # type: ignore[arg-type]
            old_name = row["name"].value if row.get("name") and row["name"].value else name
            row["name"] = Cell("value", new_name)
            mapping.pop(str(old_name), None)
            mapping.pop(name, None)
            mapping[new_name] = permanent
            record_alias(row_ids, table_name, str(old_name), permanent)
        elif action == "delete":
            expect = op.get("expect") if isinstance(op.get("expect"), dict) else None
            row, _ = _locate_row(table, name, mapping, expect, id_column)
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


def apply_patch(root: Path, patch: dict[str, Any]) -> ApplyResult:
    root = Path(root)
    table_name = str(patch.get("table") or "")
    table_path = root / "tables" / f"{table_name}.txt"
    schema_path = root / "schemas" / f"{table_name}.json"
    before_fp = (
        source_fingerprint(table_path, schema_path)
        if table_name and table_path.exists() and schema_path.exists()
        else None
    )
    with issue_lock(root):
        errors = validate_patch(root, patch)
        if errors:
            return ApplyResult(errors=errors, before_source_fingerprint=before_fp, source_fingerprint=before_fp)
        merged = merge_patch(root, patch)
        if merged.conflicts:
            return ApplyResult(errors=merged.conflicts, before_source_fingerprint=before_fp, source_fingerprint=before_fp)
        schemas, tables, _ = load_sources(root)
        table = tables[table_name]
        mapping = load_json_object(root / "registry" / "row-ids.json").get(table_name, {})
        if not isinstance(mapping, dict):
            mapping = {}
        if (
            isinstance(patch.get("base"), dict)
            and patch["base"].get("sourceFingerprint")
            and not merged.skipped
            and not merged.effective_ops
            and patch.get("ops")
            and _drafts_match_current(table, mapping, patch)
        ):
            return ApplyResult(
                errors=[
                    _merge_error(
                        table_name,
                        "",
                        "",
                        "ALREADY_APPLIED",
                        "patch is already reflected in the current table",
                        "skip apply; files are unchanged",
                    )
                ],
                before_source_fingerprint=before_fp,
                source_fingerprint=before_fp,
            )
        working = copy.deepcopy(patch)
        if not merged.skipped:
            working["ops"] = merged.effective_ops
        if not working.get("ops"):
            return ApplyResult(
                errors=[],
                source_fingerprint=before_fp,
                assigned_ids={},
                summary=summarize_ops(schemas[table_name], table.rows, []),
                before_source_fingerprint=before_fp,
            )
        before_rows = copy.deepcopy(table.rows)
        paths = [
            table_path,
            root / "registry" / "row-ids.json",
            root / "registry" / "tombstones.json",
        ]
        snapshot = _snapshot(paths)
        _apply_ops(root, working)
        post_errors = validate_repository(root)
        if post_errors:
            _restore(snapshot)
            return ApplyResult(errors=post_errors, before_source_fingerprint=before_fp, source_fingerprint=before_fp)
        registry = load_json_object(root / "registry" / "row-ids.json").get(table_name, {})
        assigned: dict[str, int] = {}
        if isinstance(registry, dict):
            for op in working.get("ops") or []:
                if op.get("op") == "create":
                    created = str(op.get("name") or "")
                    key = str(op.get("draftRowKey") or created)
                    assigned[key] = int(registry[created])
        after_fp = source_fingerprint(table_path, schema_path)
        return ApplyResult(
            errors=[],
            source_fingerprint=after_fp,
            assigned_ids=assigned,
            summary=summarize_ops(schemas[table_name], before_rows, working["ops"]),
            before_source_fingerprint=before_fp,
        )

"""split-export/1: endpoint-scoped export helpers.

Frozen contract: `.spec/knowledge/features/split-export.md`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .fingerprint import canonical_json
from .manifest import END_TARGETS, SHARED_PREDICTION_ID_COLUMN, SPLIT_SPEC_VERSION, TARGET_DIRS

# The projection whose row files back each end's recorded shared prediction block.
# Declared columns are visible to both S and C, so each of these carries every value.
RECORD_TARGETS: dict[str, str] = {"client": "C", "server": "S"}


def declared_shared_columns(schemas: dict[str, Any]) -> list[tuple[str, str]]:
    declared: list[tuple[str, str]] = []
    for table_name in sorted(schemas):
        for column in schemas[table_name].get("columns", []):
            if isinstance(column, dict) and column.get("sharedPrediction") is True and column.get("name"):
                declared.append((table_name, str(column["name"])))
    return sorted(declared)


def shared_prediction_block(
    schemas: dict[str, Any],
    typed_rows: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Fingerprint only the declared shared prediction configuration.

    ADR-102: two endpoints are never required to hash equal as a whole tree; the
    compatibility judgement is this subset and nothing else.
    """
    declared = declared_shared_columns(schemas)
    values: dict[str, dict[str, list[list[Any]]]] = {}
    for table_name, column in declared:
        id_column = str(schemas[table_name].get("idColumn", "id"))
        pairs = [
            [row.get(id_column), row[column]]
            for row in typed_rows.get(table_name, [])
            if column in row
        ]
        values.setdefault(table_name, {})[column] = pairs
    payload = {
        "columns": [f"{table}.{column}" for table, column in declared],
        "values": values,
    }
    return {
        "specVersion": SPLIT_SPEC_VERSION,
        "columns": payload["columns"],
        "fingerprint": hashlib.sha256(canonical_json(payload)).hexdigest(),
    }


def _issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _read_manifest(directory: Path) -> dict[str, Any]:
    return json.loads((Path(directory) / "manifest.json").read_text(encoding="utf-8"))


def _shared_block(manifest: dict[str, Any]) -> dict[str, Any]:
    block = manifest.get("sharedPrediction")
    return block if isinstance(block, dict) else {}


def _record_problem(directory: Path, endpoint: str, recorded: Any) -> str | None:
    """Re-derive one end's shared prediction block from that end's own row files.

    The recorded block is only what the exporter said; the rows are what the end
    actually loads. Returns None when the rows reproduce the record exactly,
    otherwise the reason they do not.
    """
    if not isinstance(recorded, dict):
        return "manifest carries no sharedPrediction block"
    columns = recorded.get("columns")
    if not isinstance(columns, list) or not all(isinstance(entry, str) for entry in columns):
        return 'sharedPrediction.columns is not a list of "<table>.<column>" names'

    schemas: dict[str, dict[str, Any]] = {}
    for entry in columns:
        table, dot, column = entry.partition(".")
        if not (dot and table and column):
            return f'sharedPrediction.columns entry {entry!r} is not "<table>.<column>"'
        schema = schemas.setdefault(table, {"idColumn": SHARED_PREDICTION_ID_COLUMN, "columns": []})
        schema["columns"].append({"name": column, "sharedPrediction": True})

    folder = TARGET_DIRS[RECORD_TARGETS[endpoint]]
    rows: dict[str, list[dict[str, Any]]] = {}
    for table in sorted(schemas):
        relative = f"{folder}/{table}.json"
        path = Path(directory) / relative
        if not path.is_file():
            return f"declares {table} columns but {relative} is missing"
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            return f"{relative} is unreadable: {exc}"
        table_rows = payload.get("rows") if isinstance(payload, dict) else None
        if not isinstance(table_rows, list) or not all(isinstance(row, dict) for row in table_rows):
            return f"{relative} has no rows array"
        rows[table] = table_rows

    rederived = shared_prediction_block(schemas, rows)
    if rederived == recorded:
        return None
    return (
        f"rows under {folder}/ re-derive fingerprint {rederived['fingerprint']} over {rederived['columns']}, "
        f"manifest records {recorded.get('fingerprint')} over {columns}"
    )


def verify_split(client_out: Path, server_out: Path) -> dict[str, Any]:
    """Check two endpoint roots under the split-export/1 compatibility rule.

    Each end's recorded shared prediction block is first re-derived from that end's
    row files (integrity), then the two records are compared (compatibility).
    ``exitCode`` follows split-export.md §3: 0 compatible, 1 incompatible, 2 usage.
    """
    client = _read_manifest(client_out)
    server = _read_manifest(server_out)
    errors: list[dict[str, str]] = []
    notes: list[dict[str, str]] = []

    endpoints = (str(client.get("endpoint")), str(server.get("endpoint")))
    if endpoints != ("client", "server"):
        errors.append(
            _issue(
                "SPLIT_ENDPOINT_INVALID",
                f"expected one client and one server manifest, got {endpoints[0]}/{endpoints[1]}",
            )
        )
        return {
            "ok": False,
            "exitCode": 2,
            "errors": errors,
            "notes": notes,
            "client": client.get("endpoint"),
            "server": server.get("endpoint"),
        }

    for endpoint, directory, manifest in (("client", client_out, client), ("server", server_out, server)):
        problem = _record_problem(Path(directory), endpoint, manifest.get("sharedPrediction"))
        if problem is not None:
            errors.append(_issue("SHARED_PREDICTION_RECORD_MISMATCH", f"{endpoint}: {problem}"))

    client_shared = _shared_block(client)
    server_shared = _shared_block(server)
    client_columns = list(client_shared.get("columns") or [])
    server_columns = list(server_shared.get("columns") or [])
    if client_columns != server_columns:
        errors.append(
            _issue(
                "SHARED_PREDICTION_COLUMNS_DIFFER",
                f"client declares {client_columns}, server declares {server_columns}",
            )
        )
    elif client_shared.get("fingerprint") != server_shared.get("fingerprint"):
        errors.append(
            _issue(
                "SHARED_PREDICTION_VALUE_MISMATCH",
                "declared shared prediction values differ between the two endpoints",
            )
        )

    if client.get("revisionId") != server.get("revisionId"):
        notes.append(
            _issue(
                "SPLIT_REVISION_DIFFERS",
                "endpoints come from different revisions; that alone is not an incompatibility",
            )
        )

    return {
        "ok": not errors,
        "exitCode": 1 if errors else 0,
        "errors": errors,
        "notes": notes,
        "sharedPrediction": {"columns": client_columns, "fingerprint": client_shared.get("fingerprint")},
        "revisions": {"client": client.get("revisionId"), "server": server.get("revisionId")},
    }


__all__ = [
    "END_TARGETS",
    "RECORD_TARGETS",
    "SPLIT_SPEC_VERSION",
    "declared_shared_columns",
    "shared_prediction_block",
    "verify_split",
]

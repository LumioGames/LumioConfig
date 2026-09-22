"""split-export/1: endpoint-scoped export helpers.

Frozen contract: `.spec/knowledge/features/split-export.md`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .fingerprint import canonical_json
from .manifest import END_TARGETS, SPLIT_SPEC_VERSION


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


def verify_split(client_out: Path, server_out: Path) -> dict[str, Any]:
    """Compare two endpoint manifests under the split-export/1 compatibility rule."""
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
        return {"ok": False, "errors": errors, "notes": notes, "client": client.get("endpoint"), "server": server.get("endpoint")}

    client_shared = client.get("sharedPrediction") or {}
    server_shared = server.get("sharedPrediction") or {}
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
        "errors": errors,
        "notes": notes,
        "sharedPrediction": {"columns": client_columns, "fingerprint": client_shared.get("fingerprint")},
        "revisions": {"client": client.get("revisionId"), "server": server.get("revisionId")},
    }


__all__ = [
    "END_TARGETS",
    "SPLIT_SPEC_VERSION",
    "declared_shared_columns",
    "shared_prediction_block",
    "verify_split",
]

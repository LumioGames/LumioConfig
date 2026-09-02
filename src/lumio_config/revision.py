from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .model import ValidationError
from .validate import _error


def load_revision_fixture(directory: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    root = Path(directory)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    expected = json.loads((root / "expected.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(expected, dict):
        raise ValueError(f"{root} must contain JSON objects")
    return manifest, expected


def validate_revision_manifest(
    manifest: dict[str, Any],
    *,
    required_tables: list[str] | None = None,
) -> list[dict[str, str]]:
    errors: list[ValidationError] = []
    revision_id = str(manifest.get("revisionId") or "")
    content = str(manifest.get("contentFingerprint") or "")
    if revision_id != content:
        errors.append(
            _error(
                "",
                "",
                "revisionId",
                "REVISION_FINGERPRINT_MISMATCH",
                "revisionId must equal the aggregate content fingerprint",
                "set revisionId to contentFingerprint",
            )
        )
    public_root = str(manifest.get("publicRoot") or "")
    roots = manifest.get("projectionRoots") or {}
    if isinstance(roots, dict):
        for target, value in roots.items():
            if str(value) == public_root:
                errors.append(
                    _error(
                        "",
                        "",
                        str(target),
                        "PROJECTION_PUBLIC_ROOT_MIXED",
                        "a projection root must not equal the public root",
                        "point projectionRoots at the per-target manifest, not publicRoot",
                    )
                )
    present = {
        str(entry.get("table"))
        for entry in manifest.get("tables") or []
        if isinstance(entry, dict) and entry.get("table")
    }
    for name in required_tables or []:
        if name not in present:
            errors.append(
                _error(
                    name,
                    "",
                    "",
                    "REQUIRED_TABLE_MISSING",
                    f"required table {name} is missing from the revision",
                    "export the full required table set before prepare",
                )
            )
    return [error.as_dict() for error in errors]

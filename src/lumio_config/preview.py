from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from .export import TARGETS, ValidationFailure, export_repository
from .manifest import TARGET_DIRS
from .patch import apply_patch, validate_patch
from .query import CONTRACT, envelope


def _copy_authority(src: Path, dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        if (src / name).exists():
            shutil.copytree(src / name, dst / name)
    if (src / "layers").exists():
        shutil.copytree(src / "layers", dst / "layers")
    yaml_path = src / "repository.yaml"
    if yaml_path.exists():
        shutil.copy(yaml_path, dst / "repository.yaml")


def _table_fingerprints(manifest: dict[str, Any], table_name: str) -> dict[str, str]:
    for entry in manifest.get("tables") or []:
        if entry.get("table") == table_name:
            return {
                "contentFingerprint": str(entry.get("contentFingerprint") or ""),
                "sourceFingerprint": str(entry.get("sourceFingerprint") or ""),
                "packageFingerprint": str(entry.get("packageFingerprint") or ""),
            }
    return {"contentFingerprint": "", "sourceFingerprint": "", "packageFingerprint": ""}


def _target_diff(before_rows: list[dict[str, Any]], after_rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "changed": before_rows != after_rows,
        "beforeCount": len(before_rows),
        "afterCount": len(after_rows),
    }


def preview_patch(root: Path, patch: dict[str, Any]) -> dict[str, Any]:
    root = Path(root)
    errors = validate_patch(root, patch)
    if errors:
        return envelope(ok=False, errors=errors, fingerprints={}, targets={})
    table_name = str(patch.get("table") or "")
    with tempfile.TemporaryDirectory() as temp:
        workspace = Path(temp)
        before_dir = workspace / "before"
        after_dir = workspace / "after"
        candidate = workspace / "candidate"
        _copy_authority(root, candidate)
        try:
            before_manifest = export_repository(root, before_dir)
        except ValidationFailure as failure:
            return envelope(ok=False, errors=failure.errors, fingerprints={}, targets={})
        applied = apply_patch(candidate, patch)
        if applied.errors:
            return envelope(ok=False, errors=applied.errors, fingerprints={}, targets={})
        try:
            after_manifest = export_repository(candidate, after_dir)
        except ValidationFailure as failure:
            return envelope(ok=False, errors=failure.errors, fingerprints={}, targets={})
        targets: dict[str, Any] = {}
        for target in TARGETS:
            directory = TARGET_DIRS[target]
            before_path = before_dir / directory / f"{table_name}.json"
            after_path = after_dir / directory / f"{table_name}.json"
            before_rows = json.loads(before_path.read_text(encoding="utf-8"))["rows"] if before_path.exists() else []
            after_rows = json.loads(after_path.read_text(encoding="utf-8"))["rows"] if after_path.exists() else []
            targets[target] = _target_diff(before_rows, after_rows)
        return envelope(
            ok=True,
            errors=[],
            table=table_name,
            fingerprints={
                "before": _table_fingerprints(before_manifest, table_name),
                "after": _table_fingerprints(after_manifest, table_name),
            },
            targets=targets,
        )

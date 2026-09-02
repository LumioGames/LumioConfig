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
from .simulate import run as simulate_run
from .summary import summarize_patch


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


def _enrich_package(fingerprints: dict[str, str], target_manifest: dict[str, Any], table_name: str) -> dict[str, str]:
    for entry in target_manifest.get("tables") or []:
        if entry.get("table") == table_name and entry.get("packageFingerprint"):
            fingerprints["packageFingerprint"] = str(entry["packageFingerprint"])
            break
    return fingerprints


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}


def _row_key(row: dict[str, Any]) -> str:
    if row.get("name") is not None:
        return str(row["name"])
    return str(row.get("id") or "")


def _target_diff(before_rows: list[dict[str, Any]], after_rows: list[dict[str, Any]]) -> dict[str, Any]:
    before_map = {_row_key(row): row for row in before_rows}
    after_map = {_row_key(row): row for row in after_rows}
    added = [{"name": name, "row": after_map[name]} for name in sorted(after_map) if name not in before_map]
    removed = [{"name": name, "row": before_map[name]} for name in sorted(before_map) if name not in after_map]
    modified: list[dict[str, Any]] = []
    for name in sorted(set(before_map) & set(after_map)):
        before_row = before_map[name]
        after_row = after_map[name]
        for column in sorted(set(before_row) | set(after_row)):
            if before_row.get(column) != after_row.get(column):
                modified.append(
                    {
                        "name": name,
                        "column": column,
                        "before": before_row.get(column),
                        "after": after_row.get(column),
                    }
                )
    return {
        "changed": bool(added or removed or modified),
        "added": added,
        "removed": removed,
        "modified": modified,
        "beforeCount": len(before_rows),
        "afterCount": len(after_rows),
    }


def _first_disclosure(before_rows: list[dict[str, Any]], after_rows: list[dict[str, Any]]) -> list[str]:
    before_cols: set[str] = set()
    after_cols: set[str] = set()
    for row in before_rows:
        before_cols.update(row)
    for row in after_rows:
        after_cols.update(row)
    return sorted(after_cols - before_cols)


def preview_patch(root: Path, patch: dict[str, Any]) -> dict[str, Any]:
    root = Path(root)
    errors = validate_patch(root, patch)
    summary = summarize_patch(root, patch)
    simulation = simulate_run(root)
    if errors:
        return envelope(
            ok=False,
            errors=errors,
            fingerprints={},
            targets={},
            summary=summary,
            simulation=simulation,
            firstDisclosure=[],
            validation={"ok": False, "errors": errors},
        )
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
            return envelope(ok=False, errors=failure.errors, fingerprints={}, targets={}, summary=summary, simulation=simulation, firstDisclosure=[], validation={"ok": False, "errors": failure.errors})
        applied = apply_patch(candidate, patch)
        if applied.errors:
            return envelope(ok=False, errors=applied.errors, fingerprints={}, targets={}, summary=summary, simulation=simulation, firstDisclosure=[], validation={"ok": False, "errors": applied.errors})
        try:
            after_manifest = export_repository(candidate, after_dir)
        except ValidationFailure as failure:
            return envelope(ok=False, errors=failure.errors, fingerprints={}, targets={}, summary=summary, simulation=simulation, firstDisclosure=[], validation={"ok": False, "errors": failure.errors})
        targets: dict[str, Any] = {}
        client_before: list[dict[str, Any]] = []
        client_after: list[dict[str, Any]] = []
        for target in TARGETS:
            directory = TARGET_DIRS[target]
            before_path = before_dir / directory / f"{table_name}.json"
            after_path = after_dir / directory / f"{table_name}.json"
            before_rows = _load_json(before_path).get("rows") or []
            after_rows = _load_json(after_path).get("rows") or []
            if not isinstance(before_rows, list):
                before_rows = []
            if not isinstance(after_rows, list):
                after_rows = []
            if target == "C":
                client_before = before_rows
                client_after = after_rows
            targets[target] = _target_diff(before_rows, after_rows)
        before_fp = _enrich_package(
            _table_fingerprints(before_manifest, table_name),
            _load_json(before_dir / TARGET_DIRS["S"] / "manifest.json"),
            table_name,
        )
        after_fp = _enrich_package(
            _table_fingerprints(after_manifest, table_name),
            _load_json(after_dir / TARGET_DIRS["S"] / "manifest.json"),
            table_name,
        )
        disclosure = _first_disclosure(client_before, client_after)
        validation = {"ok": True, "errors": []}
        risks = []
        if simulation.get("status") != "ok":
            risks.append("simulation unavailable")
        report = {
            "patch": patch,
            "baseline": before_fp,
            "candidate": {
                **after_fp,
                "compilerHash": after_manifest.get("compilerHash"),
                "inputHash": after_manifest.get("inputHash"),
                "outputHash": after_manifest.get("outputHash"),
            },
            "summary": summary,
            "simulation": simulation,
            "risks": risks,
            "firstDisclosure": disclosure,
            "validation": validation,
        }
        return envelope(
            ok=True,
            errors=[],
            table=table_name,
            fingerprints={"before": before_fp, "after": after_fp},
            targets=targets,
            summary=summary,
            simulation=simulation,
            firstDisclosure=disclosure,
            validation=validation,
            report=report,
        )

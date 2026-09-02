from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULTS: dict[str, Any] = {
    "vcs": "",
    "submit": {"autoCommit": True, "autoExport": False},
    "export": {"outDir": "build/export"},
    "openPolicy": {"allowDirtyWorkingTree": False},
}
ALLOWED_VCS = {"git", "svn", "none"}


@dataclass
class Settings:
    vcs: str
    auto_commit: bool
    auto_export: bool
    out_dir: str
    allow_dirty: bool

    def as_public(self) -> dict[str, Any]:
        return {
            "vcs": self.vcs,
            "submit": {"autoCommit": self.auto_commit, "autoExport": self.auto_export},
            "export": {"outDir": self.out_dir},
            "openPolicy": {"allowDirtyWorkingTree": self.allow_dirty},
        }


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _load_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must be a JSON object")
    return value


def _require(condition: bool, key: str, message: str) -> None:
    if not condition:
        raise ValueError(f"{key}: {message}")


def _detect_vcs(root: Path) -> str:
    if (root / ".git").exists():
        return "git"
    if (root / ".svn").exists():
        return "svn"
    return "none"


def load_settings(root: Path) -> Settings:
    root = Path(root)
    payload = dict(DEFAULTS)
    payload = _deep_merge(payload, _load_object(root / ".lumio" / "editor.json"))
    payload = _deep_merge(payload, _load_object(root / ".lumio" / "local.json"))
    vcs = payload.get("vcs", "")
    _require(isinstance(vcs, str), "vcs", "must be a string")
    if vcs == "":
        vcs = _detect_vcs(root)
    _require(vcs in ALLOWED_VCS, "vcs", "must be git, svn, or none")
    submit = payload.get("submit") or {}
    _require(isinstance(submit, dict), "submit", "must be an object")
    auto_commit = submit.get("autoCommit", True)
    auto_export = submit.get("autoExport", False)
    _require(isinstance(auto_commit, bool), "submit.autoCommit", "must be a boolean")
    _require(isinstance(auto_export, bool), "submit.autoExport", "must be a boolean")
    export = payload.get("export") or {}
    _require(isinstance(export, dict), "export", "must be an object")
    out_dir = export.get("outDir", "build/export")
    _require(isinstance(out_dir, str) and out_dir, "export.outDir", "must be a non-empty string")
    policy = payload.get("openPolicy") or {}
    _require(isinstance(policy, dict), "openPolicy", "must be an object")
    allow_dirty = policy.get("allowDirtyWorkingTree", False)
    _require(isinstance(allow_dirty, bool), "openPolicy.allowDirtyWorkingTree", "must be a boolean")
    return Settings(
        vcs=vcs,
        auto_commit=auto_commit,
        auto_export=auto_export,
        out_dir=out_dir,
        allow_dirty=allow_dirty,
    )

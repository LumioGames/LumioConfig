from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..export import export_repository
from ..patch import apply_patch
from .drafts import DraftStore
from .session import Session
from .settings import Settings
from .vcs import VcsAdapter


@dataclass
class SubmitResult:
    ok: bool
    summary: str
    errors: list[dict[str, Any]]
    source_fingerprint: str | None = None
    assigned_ids: dict[str, int] = field(default_factory=dict)
    vcs: dict[str, Any] | None = None
    export: dict[str, Any] | None = None

    def as_http(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"ok": self.ok, "summary": self.summary, "errors": self.errors}
        payload["result"] = {
            "sourceFingerprint": self.source_fingerprint,
            "assignedIds": self.assigned_ids,
            "vcs": self.vcs,
            "export": self.export,
        }
        return payload


def _error(table: str, code: str, message: str, suggestion: str) -> dict[str, str]:
    return {
        "table": table,
        "row": "",
        "column": "",
        "code": code,
        "message": message,
        "suggestion": suggestion,
    }


def submit(session: Session, patch: dict[str, Any], settings: Settings, vcs: VcsAdapter, drafts: DraftStore) -> SubmitResult:
    table = str(patch.get("table") or "")
    session._publish("submit_started", {"table": table})
    with session._source_lock:
        applied = apply_patch(session.root, patch)
        if applied.errors:
            session._publish("submit_failed", {"table": table, "errors": applied.errors})
            return SubmitResult(
                ok=False,
                summary=applied.summary,
                errors=list(applied.errors),
                source_fingerprint=applied.source_fingerprint,
                assigned_ids=dict(applied.assigned_ids),
            )
        session.reload_from_disk()
        drafts.delete(table)
    vcs_payload: dict[str, Any] | None = {"action": "none", "id": "", "branch": None}
    changed = bool(patch.get("ops"))
    should_commit = bool(
        changed
        and settings.auto_commit
        and not settings.allow_dirty
        and settings.vcs != "none"
        and getattr(session, "commit_allowed", True)
    )
    if should_commit:
        paths = [f"tables/{table}.txt", "registry/row-ids.json", "registry/tombstones.json"]
        first = f"config({table}): {applied.summary}"
        body = json.dumps(
            {
                "patch": patch,
                "beforeSourceFingerprint": applied.before_source_fingerprint,
                "sourceFingerprint": applied.source_fingerprint,
            },
            ensure_ascii=False,
            indent=2,
        )
        try:
            identity = vcs.commit(paths, first + "\n\n" + body)
            revision = vcs.revision()
            vcs_payload = {
                "action": "commit",
                "id": identity or (revision.id if revision else ""),
                "branch": revision.branch if revision else None,
            }
        except Exception as exc:
            session._publish("submit_failed", {"table": table, "code": "VCS_COMMIT_FAILED"})
            return SubmitResult(
                ok=False,
                summary=applied.summary,
                errors=[_error(table, "VCS_COMMIT_FAILED", str(exc), "commit the whitelist paths manually")],
                source_fingerprint=applied.source_fingerprint,
                assigned_ids=dict(applied.assigned_ids),
                vcs=vcs_payload,
            )
    export_payload = None
    if settings.auto_export and changed:
        try:
            out_dir = Path(settings.out_dir)
            if not out_dir.is_absolute():
                out_dir = session.root / out_dir
            export_repository(session.root, out_dir)
            files = len([path for path in out_dir.rglob("*") if path.is_file()]) if out_dir.exists() else 0
            export_payload = {"outDir": settings.out_dir, "files": files}
        except Exception as exc:
            session._publish("submit_failed", {"table": table, "code": "EXPORT_FAILED"})
            return SubmitResult(
                ok=False,
                summary=applied.summary,
                errors=[_error(table, "EXPORT_FAILED", str(exc), "export after the TXT is already applied")],
                source_fingerprint=applied.source_fingerprint,
                assigned_ids=dict(applied.assigned_ids),
                vcs=vcs_payload,
            )
    session._publish("submit_succeeded", {"table": table, "assignedIds": applied.assigned_ids})
    return SubmitResult(
        ok=True,
        summary=applied.summary,
        errors=[],
        source_fingerprint=applied.source_fingerprint,
        assigned_ids=dict(applied.assigned_ids),
        vcs=vcs_payload,
        export=export_payload,
    )

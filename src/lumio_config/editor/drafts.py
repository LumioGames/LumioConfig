from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class DraftVersionConflict(Exception):
    def __init__(self, current: int) -> None:
        super().__init__(f"draft version {current} does not match expected")
        self.current = current


def _write_json(path: Path, value: Any) -> None:
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


class DraftStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.directory = self.root / ".lumio" / "drafts"
        self._lock = threading.Lock()

    def path_for(self, table: str) -> Path:
        return self.directory / f"{table}.json"

    def load(self, table: str) -> dict[str, Any] | None:
        path = self.path_for(table)
        if not path.exists():
            return None
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None

    def save(self, table: str, draft: dict[str, Any], expected_version: int) -> int:
        with self._lock:
            current = self.load(table)
            current_version = int(current.get("draftVersion") or 0) if current else 0
            if current_version != expected_version:
                raise DraftVersionConflict(current_version)
            next_version = current_version + 1
            payload = dict(draft)
            payload.pop("expectedDraftVersion", None)
            payload["table"] = table
            payload.setdefault("rows", {})
            payload.setdefault("renamed", {})
            payload.setdefault("deleted", [])
            payload["draftVersion"] = next_version
            payload["savedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self.directory.mkdir(parents=True, exist_ok=True)
            _write_json(self.path_for(table), payload)
            return next_version

    def delete(self, table: str) -> None:
        path = self.path_for(table)
        if path.exists():
            path.unlink()

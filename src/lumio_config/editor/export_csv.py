from __future__ import annotations

import csv
import io
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..fingerprint import source_fingerprint
from ..patch import _row_id
from ..validate import load_sources
from .drafts import DraftStore
from .settings import load_settings
from .vcs import make_adapter


def _repo_name(root: Path) -> str:
    path = root / "repository.yaml"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("name:"):
                return line.split(":", 1)[1].strip()
    return root.name


INJECT_PREFIXES = frozenset("=+-@\t\r")


def _guard(token: str) -> str:
    if token and token[0] in INJECT_PREFIXES:
        return "'" + token
    return token


def _draft_token(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if not isinstance(value, dict):
        return None
    state = value.get("state")
    if state == "empty":
        return '""'
    if state == "null":
        return "null"
    if state == "default":
        return "@default"
    if state == "missing":
        return "@missing"
    raw = value.get("raw")
    return None if raw is None else str(raw)


def _columns(schema: dict[str, Any], targets: list[str] | None) -> list[str]:
    names: list[str] = []
    wanted = {item.upper() for item in targets} if targets else None
    for column in schema.get("columns") or []:
        if not isinstance(column, dict) or not column.get("name"):
            continue
        name = str(column["name"])
        visibility = str(column.get("visibility") or "SCV")
        if wanted is not None and not any(flag in visibility for flag in wanted):
            continue
        names.append(name)
    return names


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def export_tables(
    root: Path,
    tables: list[str],
    fmt: str,
    source: str,
    targets: list[str] | None,
    out_dir: Path,
) -> list[Path]:
    root = Path(root)
    out_dir = Path(out_dir)
    if fmt not in {"csv", "tsv"}:
        raise ValueError("format must be csv or tsv")
    if source not in {"repo", "draft"}:
        raise ValueError("source must be repo or draft")
    schemas, table_map, errors = load_sources(root)
    if errors:
        raise ValueError("source tables could not be parsed")
    drafts = DraftStore(root) if source == "draft" else None
    delimiter = "," if fmt == "csv" else "\t"
    written: list[Path] = []
    fingerprints: list[str] = []
    for name in tables:
        schema = schemas.get(name)
        table = table_map.get(name)
        if schema is None or table is None:
            continue
        id_column = str(schema.get("idColumn", "id"))
        columns = _columns(schema, targets)
        draft = drafts.load(name) if drafts else None
        overlay = (draft or {}).get("rows") or {}
        deleted = set((draft or {}).get("deleted") or []) if draft else set()
        rows_out: list[list[str]] = [columns]
        for row in table.rows:
            rid = _row_id(row, id_column) or ""
            if rid in deleted:
                continue
            patch = overlay.get(rid) or {}
            line: list[str] = []
            for column in columns:
                if column in patch:
                    token = _draft_token(patch[column])
                    if token is None and column == "name" and isinstance(patch.get("name"), str):
                        token = str(patch["name"])
                    if token is None:
                        cell = row.get(column)
                        token = cell.token() if cell else "@missing"
                else:
                    cell = row.get(column)
                    token = cell.token() if cell else "@missing"
                line.append(_guard(token))
            rows_out.append(line)
        handle = io.StringIO()
        writer = csv.writer(handle, delimiter=delimiter, lineterminator="\n")
        writer.writerows(rows_out)
        path = out_dir / f"{name}.{fmt}"
        _atomic_write(path, ("\ufeff" + handle.getvalue()).encode("utf-8"))
        written.append(path)
        table_path = root / "tables" / f"{name}.txt"
        schema_path = root / "schemas" / f"{name}.json"
        fingerprints.append(f"{name}: {source_fingerprint(table_path, schema_path) if table_path.exists() else ''}")
    settings = load_settings(root)
    adapter = make_adapter(root, settings)
    revision = adapter.revision()
    revision_id = revision.id if revision else ""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    readme = "\n".join(
        [
            "GENERATED / NOT AUTHORITATIVE — do not import back",
            f"repo: {_repo_name(root)}",
            f"revision: {revision_id}",
            f"exportedAt: {now}",
            f"source: {source}",
            "fingerprints:",
            *[f"  {item}" for item in fingerprints],
            "",
        ]
    )
    readme_path = out_dir / "README.txt"
    _atomic_write(readme_path, readme.encode("utf-8"))
    written.append(readme_path)
    return written

#!/usr/bin/env python3
"""Consumer-side sync for LumioConfig generated C# typed readers.

External repositories must not hand-copy files out of ``generated/csharp``.
This tool re-generates the selected readers from the true sources of a
LumioConfig checkout, copies them into the consumer tree, and verifies the
copy byte-for-byte:

    python tools/lumio_config_sync.py sync \\
        --dest <consumer>/generated/config \\
        --tables movement,mining,attributes --targets server,client

    python tools/lumio_config_sync.py check \\
        --dest <consumer>/generated/config

``sync`` writes ``server|client|voxel/<Table>Table.cs`` plus a verification
manifest (default ``csharp-sync-manifest.json``) recording per-file SHA-256,
schema fingerprints, the source revision, and an input fingerprint that uses
the same algorithm as the release manifest's ``inputHash``. ``check``
regenerates from the current sources and fails loudly (non-zero exit, JSON
report) on any drift, so the consumer can enforce "re-run generation -> git
diff empty" in CI. Both commands are idempotent: with unchanged sources a
repeated ``sync`` rewrites zero bytes.

The manifest holds hashes only, never row values; it is verification
metadata, not an assembly resource.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lumio_config.codegen.csharp import (  # noqa: E402
    CSHARP_NAMESPACE_DEFAULT,
    CodegenError,
    generate_csharp_readers,
    pascal_case,
    schema_fingerprint,
)
from lumio_config.export import _input_hash  # noqa: E402  # same hash the release manifest records as inputHash
from lumio_config.fingerprint import fingerprint_files, package_fingerprint  # noqa: E402
from lumio_config.validate import load_sources  # noqa: E402

MANIFEST_KIND = "csharp-sync-manifest"
MANIFEST_FORMAT_VERSION = 1
MANIFEST_DEFAULT_NAME = "csharp-sync-manifest.json"
GENERATED_MARKER = "由 LumioConfig `export --csharp-out` 重建"
TARGET_ORDER = ("server", "client", "voxel")
TARGET_CODES = {"server": "S", "client": "C", "voxel": "V"}
TARGET_ALIASES = {"s": "server", "server": "server", "c": "client", "client": "client", "v": "voxel", "voxel": "voxel"}
HEADER_FINGERPRINT = re.compile(rb"^// schemaFingerprint: ([0-9a-f]{64})$", re.M)


class SyncFailure(Exception):
    def __init__(self, errors: list[dict[str, Any]]) -> None:
        self.errors = errors
        super().__init__(f"sync failed with {len(errors)} error(s)")


def _csv(values: list[str] | None) -> list[str]:
    items: list[str] = []
    for value in values or []:
        items.extend(part.strip() for part in value.split(",") if part.strip())
    return items


def _normalize_targets(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    chosen: list[str] = []
    for value in _csv(values):
        target = TARGET_ALIASES.get(value.lower())
        if target is None:
            raise SyncFailure(
                [
                    {
                        "code": "SYNC_UNKNOWN_TARGET",
                        "target": value,
                        "message": f"unknown target {value!r}",
                        "suggestion": f"use one of: {', '.join(TARGET_ORDER)} (or S/C/V)",
                    }
                ]
            )
        if target not in chosen:
            chosen.append(target)
    return [target for target in TARGET_ORDER if target in chosen]


def _git_revision(root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip() or None


def _file_schema_fingerprint(data: bytes) -> str | None:
    match = HEADER_FINGERPRINT.search(data)
    return match.group(1).decode("ascii") if match else None


def _scope_of(expected: dict[str, dict[str, Any]]) -> tuple[list[str], list[str]]:
    tables = sorted({info["table"] for info in expected.values()})
    targets = sorted({rel.split("/", 1)[0] for rel in expected})
    return tables, targets


def _load_expected(
    root: Path,
    namespace: str,
    tables: list[str] | None,
    targets: list[str] | None,
) -> dict[str, dict[str, Any]]:
    """Regenerate the selected readers in memory.

    ``tables`` / ``targets`` select the scope; ``None`` resolves to every
    (table, target) pair the generator produces. Explicitly selected tables
    that do not exist upstream fail loudly (``SYNC_UNKNOWN_TABLE``).
    """
    schemas, _tables, load_errors = load_sources(root)
    if load_errors:
        raise SyncFailure([{"code": "SOURCE_LOAD_FAILED", "detail": error.as_dict()} for error in load_errors])
    if tables is None:
        resolved_tables = sorted(schemas)
    else:
        resolved_tables = sorted(set(_csv(tables)))
        unknown = [name for name in resolved_tables if name not in schemas]
        if unknown:
            raise SyncFailure(
                [
                    {
                        "code": "SYNC_UNKNOWN_TABLE",
                        "table": name,
                        "message": f"table {name!r} does not exist upstream",
                        "suggestion": f"available tables: {', '.join(sorted(schemas))}",
                    }
                    for name in unknown
                ]
            )
    resolved_targets = list(targets) if targets is not None else list(TARGET_ORDER)
    try:
        generated = generate_csharp_readers(schemas, namespace)
    except CodegenError as error:
        raise SyncFailure([{"code": "SYNC_CODEGEN_FAILED", "message": str(error)}]) from error

    expected: dict[str, dict[str, Any]] = {}
    for table in resolved_tables:
        schema = schemas[table]
        prefix = pascal_case(str(schema.get("table") or table))
        for target_dir in resolved_targets:
            rel = f"{target_dir}/{prefix}Table.cs"
            text = generated.get(rel)
            if text is None:
                continue
            payload = text.encode("utf-8")
            if not payload.endswith(b"\n"):
                payload += b"\n"
            code = TARGET_CODES[target_dir]
            expected[rel] = {
                "data": payload,
                "table": table,
                "target": code,
                "schemaFingerprint": schema_fingerprint(schema, code),
            }
    return expected


def _find_orphans(dest: Path, targets: list[str], expected: dict[str, dict[str, Any]]) -> list[str]:
    orphans: list[str] = []
    marker = GENERATED_MARKER.encode("utf-8")
    for target_dir in targets:
        folder = dest / target_dir
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.cs")):
            rel = path.relative_to(dest).as_posix()
            if rel in expected:
                continue
            if marker in path.read_bytes()[:2048]:
                orphans.append(rel)
    return orphans


def _build_manifest(
    root: Path,
    namespace: str,
    expected: dict[str, dict[str, Any]],
    dest: Path,
) -> dict[str, Any]:
    tables, targets = _scope_of(expected)
    files = []
    for rel in sorted(expected):
        info = expected[rel]
        files.append(
            {
                "path": rel,
                "table": info["table"],
                "target": info["target"],
                "schemaFingerprint": info["schemaFingerprint"],
                "sha256": package_fingerprint(info["data"]),
            }
        )
    return {
        "kind": MANIFEST_KIND,
        "formatVersion": MANIFEST_FORMAT_VERSION,
        "generator": "tools/lumio_config_sync.py",
        "namespace": namespace,
        "sourceRevision": _git_revision(root),
        "inputFingerprint": _input_hash(root),
        "tables": tables,
        "targets": targets,
        "files": files,
        "aggregateFingerprint": fingerprint_files([dest / rel for rel in sorted(expected)], dest),
    }


def _write_json(path: Path, value: Any) -> None:
    data = json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SyncFailure([{"code": "SYNC_MANIFEST_MISSING", "path": str(path), "message": "verification manifest not found"}])
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SyncFailure([{"code": "SYNC_MANIFEST_INVALID", "path": str(path), "message": str(error)}]) from error
    invalid = SyncFailure([{"code": "SYNC_MANIFEST_INVALID", "path": str(path), "message": "unexpected manifest shape"}])
    if not isinstance(manifest, dict):
        raise invalid
    required = ("kind", "formatVersion", "namespace", "tables", "targets", "files")
    if any(key not in manifest for key in required):
        raise invalid
    if manifest["kind"] != MANIFEST_KIND or manifest["formatVersion"] != MANIFEST_FORMAT_VERSION:
        raise SyncFailure(
            [
                {
                    "code": "SYNC_MANIFEST_INVALID",
                    "path": str(path),
                    "message": f"expected {MANIFEST_KIND} v{MANIFEST_FORMAT_VERSION}, "
                    f"got {manifest.get('kind')!r} v{manifest.get('formatVersion')!r}",
                }
            ]
        )
    if not isinstance(manifest["namespace"], str) or not isinstance(manifest["tables"], list):
        raise invalid
    if not all(isinstance(name, str) for name in manifest["tables"]):
        raise invalid
    if not isinstance(manifest["targets"], list) or not all(str(t).lower() in TARGET_ALIASES for t in manifest["targets"]):
        raise invalid
    if not isinstance(manifest["files"], list):
        raise invalid
    return manifest


def _verify(
    root: Path,
    dest: Path,
    manifest_path: Path,
    namespace_override: str | None,
    tables_override: list[str] | None,
    targets_override: list[str] | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    manifest = _load_manifest(manifest_path)
    namespace = namespace_override or str(manifest["namespace"])
    tables = _csv(tables_override) or [str(name) for name in manifest["tables"]]
    targets = _normalize_targets(targets_override if targets_override is not None else [str(t) for t in manifest["targets"]])
    expected = _load_expected(root, namespace, tables, targets)

    failures: list[dict[str, Any]] = []
    manifest_by_path = {str(entry["path"]): entry for entry in manifest["files"] if isinstance(entry, dict) and "path" in entry}
    disk_paths: list[Path] = []
    for rel, info in sorted(expected.items()):
        entry = manifest_by_path.get(rel)
        if entry is None:
            failures.append(
                {
                    "code": "SYNC_MANIFEST_FILE_MISSING",
                    "path": rel,
                    "message": "current sources generate a file the manifest does not record",
                    "suggestion": "re-run sync to refresh the manifest",
                }
            )
            continue
        path = dest / rel
        if not path.is_file():
            failures.append({"code": "SYNC_FILE_MISSING", "path": rel, "message": "file listed by the manifest is missing"})
            continue
        data = path.read_bytes()
        disk_paths.append(path)
        actual_hash = package_fingerprint(data)
        if actual_hash != entry.get("sha256"):
            failures.append(
                {
                    "code": "SYNC_HASH_MISMATCH",
                    "path": rel,
                    "manifestSha256": entry.get("sha256"),
                    "actualSha256": actual_hash,
                }
            )
        if data != info["data"]:
            current = info["schemaFingerprint"]
            recorded = _file_schema_fingerprint(data)
            if recorded == current:
                diagnosis = {
                    "reason": "modified-after-sync",
                    "message": "bytes differ from regenerated output but the schema fingerprint matches current sources; the copy was changed after sync",
                }
            else:
                diagnosis = {
                    "reason": "schema-changed-upstream",
                    "message": "upstream schema changed since this copy was synced; re-run sync",
                    "fileSchemaFingerprint": recorded,
                    "currentSchemaFingerprint": current,
                }
            failures.append({"code": "SYNC_DRIFT", "path": rel, **diagnosis})
    scope_tables, scope_targets = _scope_of(expected)
    for rel in _find_orphans(dest, scope_targets, expected):
        failures.append(
            {
                "code": "SYNC_ORPHAN",
                "path": rel,
                "message": "generated file is no longer produced for the selected scope",
                "suggestion": "re-run sync to prune it",
            }
        )
    if disk_paths and not any(failure["code"] == "SYNC_FILE_MISSING" for failure in failures):
        actual = fingerprint_files(disk_paths, dest)
        if actual != manifest.get("aggregateFingerprint"):
            failures.append(
                {
                    "code": "SYNC_AGGREGATE_MISMATCH",
                    "manifestAggregate": manifest.get("aggregateFingerprint"),
                    "actualAggregate": actual,
                }
            )
    info = {
        "namespace": namespace,
        "tables": scope_tables,
        "targets": scope_targets,
        "files": len(expected),
        "sourceRevision": manifest.get("sourceRevision"),
        "inputFingerprint": manifest.get("inputFingerprint"),
    }
    return failures, info


def _manifest_path(args: argparse.Namespace) -> Path | None:
    if args.manifest == "none":
        return None
    if args.manifest is not None:
        return Path(args.manifest)
    return args.dest / MANIFEST_DEFAULT_NAME


def _run_sync(args: argparse.Namespace, root: Path) -> int:
    dest = args.dest
    namespace = args.namespace or CSHARP_NAMESPACE_DEFAULT
    targets = _normalize_targets(args.targets)
    expected = _load_expected(root, namespace, args.tables, targets)
    # An explicitly named (table, target) pair that generates nothing is a
    # scope error; defaulted sides stay lenient (they resolve to what exists).
    wanted = {(info["table"], rel.split("/", 1)[0]) for rel, info in expected.items()}
    missing = [
        {
            "code": "SYNC_TABLE_NOT_VISIBLE",
            "table": table,
            "target": TARGET_CODES[target_dir],
            "message": f"table {table!r} has no columns visible to target {target_dir}",
        }
        for table in _csv(args.tables)
        for target_dir in (targets or [])
        if (table, target_dir) not in wanted
    ]
    if missing:
        raise SyncFailure(missing)
    dest.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    unchanged = 0
    for rel, info in sorted(expected.items()):
        path = dest / rel
        if path.is_file() and path.read_bytes() == info["data"]:
            unchanged += 1
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(info["data"])
        written.append(rel)

    pruned: list[str] = []
    _scope_tables, scope_targets = _scope_of(expected)
    for rel in _find_orphans(dest, scope_targets, expected):
        (dest / rel).unlink()
        pruned.append(rel)

    manifest_path = _manifest_path(args)
    failures: list[dict[str, Any]] = []
    if manifest_path is not None:
        _write_json(manifest_path, _build_manifest(root, namespace, expected, dest))
        failures, _info = _verify(root, dest, manifest_path, args.namespace, args.tables, targets)

    report = {
        "ok": not failures,
        "mode": "sync",
        "dest": str(dest),
        "manifest": str(manifest_path) if manifest_path is not None else None,
        "written": written,
        "unchanged": unchanged,
        "pruned": pruned,
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if failures:
        print(f"sync: FAILED ({len(written)} written, {len(failures)} failure(s))")
        return 1
    print(f"sync: OK ({len(expected)} file(s), {len(written)} written, {len(pruned)} pruned)")
    return 0


def _run_check(args: argparse.Namespace, root: Path) -> int:
    manifest_path = _manifest_path(args)
    if manifest_path is None:
        raise SyncFailure([{"code": "SYNC_MANIFEST_REQUIRED", "message": "check needs a manifest; do not pass --manifest none"}])
    targets = _normalize_targets(args.targets)
    failures, info = _verify(root, args.dest, manifest_path, args.namespace, args.tables, targets)
    report = {
        "ok": not failures,
        "mode": "check",
        "dest": str(args.dest),
        "manifest": str(manifest_path),
        **info,
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if failures:
        print(f"check: FAILED ({info['files']} file(s), {len(failures)} failure(s))")
        return 1
    print(f"check: OK ({info['files']} file(s) match current sources byte-for-byte)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sync and verify LumioConfig generated C# readers in a consumer tree")
    subparsers = parser.add_subparsers(dest="mode", required=True)

    def shared(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--dest", type=Path, required=True, help="consumer directory that holds the vendored readers")
        sub.add_argument("--tables", action="append", default=None, help="comma-separated table names (default: all)")
        sub.add_argument("--targets", action="append", default=None, help="comma-separated targets server/client/voxel (default: all)")
        sub.add_argument("--namespace", default=None, help=f"root namespace (default: {CSHARP_NAMESPACE_DEFAULT}, or whatever the manifest records)")
        sub.add_argument("--manifest", default=None, help="manifest path, or 'none' to skip writing one (sync only); default <dest>/csharp-sync-manifest.json")
        sub.add_argument("--root", type=Path, default=None, help="LumioConfig repository root (defaults to this checkout)")

    shared(subparsers.add_parser("sync", help="copy regenerated readers into the consumer tree and record fingerprints"))
    shared(subparsers.add_parser("check", help="verify the consumer tree byte-for-byte against current sources"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = args.root.resolve() if args.root else ROOT
    try:
        if args.mode == "sync":
            return _run_sync(args, root)
        return _run_check(args, root)
    except SyncFailure as failure:
        print(json.dumps({"ok": False, "mode": args.mode, "failures": failure.errors}, ensure_ascii=False, indent=2, sort_keys=True))
        print(f"{args.mode}: FAILED ({len(failure.errors)} failure(s))")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

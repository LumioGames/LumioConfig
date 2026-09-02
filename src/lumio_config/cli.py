from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .export import ValidationFailure, export_repository
from .ids import verify_registry
from .patch import apply_patch, validate_patch
from .text_table import format_table_text, parse_table
from .validate import load_sources, validate_repository


def _root_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", type=Path, default=None, help="repository root (defaults to the project root)")


def _resolve_root(value: Path | None) -> Path:
    return value.resolve() if value else Path(__file__).resolve().parents[2]


def _format_tables(root: Path, check: bool) -> int:
    _, tables, load_errors = load_sources(root)
    if load_errors:
        for error in load_errors:
            print(json.dumps(error.as_dict(), ensure_ascii=False))
        return 1
    changed = False
    for name in sorted(tables):
        table = tables[name]
        expected = format_table_text(table)
        actual = table.path.read_text(encoding="utf-8")
        if actual != expected:
            changed = True
            if not check:
                table.path.write_text(expected, encoding="utf-8", newline="\n")
    if check and changed:
        print("format: source tables are not canonical")
        return 1
    print("format: OK")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LumioConfig source-table toolchain")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate", help="validate schemas and source tables")
    validate.add_argument("--json", action="store_true", dest="as_json")
    _root_argument(validate)

    formatter = subparsers.add_parser("format", help="format source tables")
    formatter.add_argument("--check", action="store_true")
    _root_argument(formatter)

    exporter = subparsers.add_parser("export", help="export deterministic target projections")
    exporter.add_argument("--out", type=Path, required=True)
    _root_argument(exporter)

    patch = subparsers.add_parser("patch", help="validate or apply a name-only source patch")
    patch.add_argument("mode", choices=["validate", "apply"])
    patch.add_argument("patch_path", type=Path)
    patch.add_argument("--audit", type=Path, default=None)
    patch.add_argument("--reason", default=None)
    _root_argument(patch)

    registry = subparsers.add_parser("registry", help="verify row-id and tombstone registries")
    registry.add_argument("mode", choices=["verify"])
    _root_argument(registry)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = _resolve_root(args.root)
    if args.command == "validate":
        errors = validate_repository(root)
        if args.as_json:
            print(json.dumps(errors, ensure_ascii=False, indent=2, sort_keys=True))
        elif errors:
            for error in errors:
                print(f"{error['table']}:{error['row']}:{error['column']} {error['code']}: {error['message']}")
        else:
            print("validate: OK")
        return 1 if errors else 0
    if args.command == "format":
        return _format_tables(root, args.check)
    if args.command == "export":
        try:
            manifest = export_repository(root, (root / args.out) if not args.out.is_absolute() else args.out)
        except ValidationFailure as failure:
            print(json.dumps(failure.errors, ensure_ascii=False, indent=2, sort_keys=True))
            return 1
        print(f"export: OK ({len(manifest['tables'])} table(s))")
        return 0
    if args.command == "patch":
        payload = json.loads(args.patch_path.read_text(encoding="utf-8"))
        if args.mode == "validate":
            errors = validate_patch(root, payload)
            if errors:
                print(json.dumps(errors, ensure_ascii=False, indent=2, sort_keys=True))
                return 1
            print("patch-validate: OK")
            return 0
        result = apply_patch(root, payload)
        body = {
            "ok": not result.errors,
            "summary": result.summary,
            "errors": result.errors,
            "sourceFingerprint": result.source_fingerprint,
            "beforeSourceFingerprint": result.before_source_fingerprint,
            "assignedIds": result.assigned_ids,
        }
        if args.reason:
            body["reason"] = args.reason
        print(json.dumps(body, ensure_ascii=False, indent=2, sort_keys=True))
        if args.audit and not result.errors:
            args.audit.parent.mkdir(parents=True, exist_ok=True)
            line = {
                "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "table": payload.get("table"),
                "summary": result.summary,
                "beforeSourceFingerprint": result.before_source_fingerprint,
                "sourceFingerprint": result.source_fingerprint,
            }
            with args.audit.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(line, ensure_ascii=False) + "\n")
        return 0 if not result.errors else 1
    if args.command == "registry":
        errors = verify_registry(root)
        if errors:
            print(json.dumps(errors, ensure_ascii=False, indent=2, sort_keys=True))
            return 1
        print("registry-verify: OK")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())

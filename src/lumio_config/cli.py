from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .export import ValidationFailure, export_repository
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
    _root_argument(patch)
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
            label = "patch-validate"
        else:
            errors = apply_patch(root, payload)
            label = "patch-apply"
        if errors:
            print(json.dumps(errors, ensure_ascii=False, indent=2, sort_keys=True))
            return 1
        print(f"{label}: OK")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())

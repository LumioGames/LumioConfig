#!/usr/bin/env python3
"""Build the existing CLI as an ADR-137 authoring closure; no compiler reimplementation."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = Path(__file__).with_name("config-compiler-requirements.txt")


def command(*args: str) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True, encoding="utf-8").strip()


def verify_source(commit: str) -> None:
    if re.fullmatch(r"[0-9a-f]{40}", commit) is None or command("git", "rev-parse", "HEAD") != commit:
        raise ValueError("source commit must equal the full checkout HEAD")
    if command("git", "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("source checkout must be clean (put outputs in ignored build/ or outside the checkout)")


def verify_host(rid: str) -> None:
    if platform.python_version() != "3.11.9" or sys.implementation.name != "cpython":
        raise ValueError("build requires CPython 3.11.9")
    expected = {"win32": "win-x64", "linux": "linux-x64"}.get(sys.platform)
    if rid != expected or platform.machine().lower() not in ("amd64", "x86_64"):
        raise ValueError("RID must match the native x64 build host")


def dependencies() -> list[dict[str, str]]:
    result = [{"name": "python", "version": platform.python_version()}]
    for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        requirement, _, marker = line.partition(";")
        if marker and sys.platform != "win32":
            continue
        name, expected = requirement.strip().split("==")
        actual = importlib.metadata.version(name)
        if actual != expected:
            raise ValueError(f"{name} must be {expected}, found {actual}")
        result.append({"name": name, "version": actual})
    return result


def copy_licenses(output: Path, installed: list[dict[str, str]]) -> list[str]:
    destination = output / "licenses"
    destination.mkdir()
    shutil.copyfile(ROOT / "LICENSE", destination / "config.txt")
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if not python_license.is_file():
        python_license = Path(sys.base_prefix) / "lib" / "python3.11" / "LICENSE.txt"
    if not python_license.is_file():
        raise ValueError("build Python must provide its complete LICENSE.txt")
    shutil.copyfile(python_license, destination / "python.txt")
    for dependency in installed:
        if dependency["name"] == "python":
            continue
        distribution = importlib.metadata.distribution(dependency["name"])
        licenses = [file for file in distribution.files or ()
                    if "dist-info" in str(file) and Path(file).name.upper().startswith(("LICENSE", "COPYING"))]
        if not licenses:
            raise ValueError(f"{dependency['name']} is missing license files")
        for index, license_file in enumerate(sorted(licenses)):
            shutil.copyfile(distribution.locate_file(license_file), destination / f"{dependency['name']}-{index}.txt")
    return sorted(path.relative_to(output).as_posix() for path in destination.iterdir())


def build(rid: str, commit: str, out: Path, install: bool) -> Path:
    verify_host(rid)
    verify_source(commit)
    out = out.resolve()
    target = out / f"config-compiler-{rid}"
    if target.exists():
        raise ValueError(f"output already exists: {target}")
    if install:
        subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-r", str(REQUIREMENTS)], check=True)
    installed = dependencies()
    sys.path.insert(0, str(ROOT / "src"))
    from lumio_config.export import _compiler_hash
    compiler_hash = _compiler_hash()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="config-build-", dir=out) as directory:
        work = Path(directory)
        identity = work / "compiler-hash.txt"
        identity.write_text(compiler_hash + "\n", encoding="ascii", newline="\n")
        subprocess.run([
            sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--noupx",
            "--name", "config-compiler", "--paths", str(ROOT / "src"),
            "--add-data", f"{identity}:lumio_config", "--distpath", str(work / "dist"),
            "--workpath", str(work / "work"), "--specpath", str(work), str(ROOT / "tools" / "lumio_config.py"),
        ], check=True, cwd=ROOT)
        closure = work / "dist" / "config-compiler"
        licenses = copy_licenses(closure, installed)
        files = {}
        for file in sorted(closure.rglob("*")):
            if file.is_file():
                if file.suffix == ".py" or file.is_symlink():
                    raise ValueError(f"unexpected source or symlink in closure: {file}")
                files[file.relative_to(closure).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
        metadata = {
            "formatVersion": 1, "tool": "config-compiler",
            "version": tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"],
            "rid": rid, "sourceCommit": commit,
            "entrypoint": "config-compiler.exe" if rid == "win-x64" else "config-compiler",
            "runtime": {"name": "python", "version": platform.python_version(), "platform": platform.platform(),
                        "libc": list(platform.libc_ver())},
            "packager": {"name": "pyinstaller", "version": importlib.metadata.version("pyinstaller")},
            "compilerHash": compiler_hash, "dependencies": installed, "licenses": licenses, "files": files,
        }
        (closure / "authoring-tool.json").write_text(json.dumps(metadata, sort_keys=True, indent=2) + "\n", encoding="utf-8", newline="\n")
        verify_source(commit)
        if compiler_hash != _compiler_hash():
            raise ValueError("compiler inputs changed during build")
        closure.rename(target)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rid", required=True, choices=("win-x64", "linux-x64"))
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--install", action="store_true", help="install exact build requirements into this Python environment")
    args = parser.parse_args()
    try:
        print(build(args.rid, args.source_commit, args.out, args.install))
    except (ValueError, OSError, subprocess.CalledProcessError, importlib.metadata.PackageNotFoundError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

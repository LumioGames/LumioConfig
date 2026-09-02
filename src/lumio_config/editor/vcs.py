from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .settings import Settings


ALLOWED_COMMANDS = {
    ("git", "status"),
    ("git", "rev-parse"),
    ("svn", "status"),
    ("svn", "info"),
}


@dataclass(frozen=True)
class Revision:
    vcs: str
    id: str
    branch: str | None


class VcsAdapter(Protocol):
    def status(self, paths: list[str]) -> list[str]: ...

    def revision(self) -> Revision | None: ...

    def commit(self, paths: list[str], message: str) -> str | None: ...


def run_vcs(root: Path, argv: list[str]) -> subprocess.CompletedProcess[str]:
    if len(argv) < 2 or (argv[0], argv[1]) not in ALLOWED_COMMANDS:
        raise ValueError("command not allowed")
    executable = shutil.which(argv[0])
    if executable is None:
        raise FileNotFoundError(argv[0])
    return subprocess.run([executable, *argv[1:]], cwd=root, check=False, capture_output=True, text=True)


class GitAdapter:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def status(self, paths: list[str]) -> list[str]:
        result = run_vcs(self.root, ["git", "status", "--porcelain", "--", *paths])
        dirty: list[str] = []
        for line in result.stdout.splitlines():
            path = line[3:] if len(line) > 3 else line.strip()
            if path:
                dirty.append(path.replace("\\", "/"))
        return dirty

    def revision(self) -> Revision | None:
        head = run_vcs(self.root, ["git", "rev-parse", "HEAD"])
        branch = run_vcs(self.root, ["git", "rev-parse", "--abbrev-ref", "HEAD"])
        identity = head.stdout.strip()
        if not identity:
            return None
        return Revision(vcs="git", id=identity, branch=branch.stdout.strip() or None)

    def commit(self, paths: list[str], message: str) -> str | None:
        raise NotImplementedError("commit is owned by a later editor card")


class SvnAdapter:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def status(self, paths: list[str]) -> list[str]:
        result = run_vcs(self.root, ["svn", "status", *paths])
        dirty: list[str] = []
        for line in result.stdout.splitlines():
            parts = line.split()
            if parts:
                dirty.append(parts[-1].replace("\\", "/"))
        return dirty

    def revision(self) -> Revision | None:
        result = run_vcs(self.root, ["svn", "info", "--show-item", "revision"])
        identity = result.stdout.strip()
        if not identity:
            return None
        return Revision(vcs="svn", id=identity, branch=None)

    def commit(self, paths: list[str], message: str) -> str | None:
        raise NotImplementedError("commit is owned by a later editor card")


class NoneAdapter:
    def status(self, paths: list[str]) -> list[str]:
        return []

    def revision(self) -> Revision | None:
        return None

    def commit(self, paths: list[str], message: str) -> str | None:
        raise NotImplementedError("commit is owned by a later editor card")


def make_adapter(root: Path, settings: Settings) -> GitAdapter | SvnAdapter | NoneAdapter:
    if settings.vcs == "git":
        return GitAdapter(root)
    if settings.vcs == "svn":
        return SvnAdapter(root)
    return NoneAdapter()

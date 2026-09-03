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
    ("git", "add"),
    ("git", "commit"),
    ("git", "log"),
    ("git", "show"),
    ("svn", "status"),
    ("svn", "info"),
    ("svn", "add"),
    ("svn", "commit"),
}

LOG_FIELD_SEPARATOR = "\x1f"
LOG_RECORD_SEPARATOR = "\x1e"
GIT_LOG_FORMAT = "%H%x1f%s%x1f%aI%x1f%an%x1e"


@dataclass(frozen=True)
class Revision:
    vcs: str
    id: str
    branch: str | None


@dataclass(frozen=True)
class HistoryRevision:
    id: str
    message: str
    time: str
    author: str


class VcsAdapter(Protocol):
    def status(self, paths: list[str]) -> list[str]: ...

    def revision(self) -> Revision | None: ...

    def commit(self, paths: list[str], message: str) -> str | None: ...

    def log(self, paths: list[str], since: str | None, limit: int) -> list[HistoryRevision]: ...

    def show(self, revision: str, path: str) -> str: ...


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
        added = run_vcs(self.root, ["git", "add", "--", *paths])
        if added.returncode != 0:
            raise RuntimeError(added.stderr.strip() or "git add failed")
        first, _, rest = message.partition("\n")
        body = rest.lstrip("\n")
        argv = ["git", "commit", "-m", first.strip()]
        if body:
            argv.extend(["-m", body])
        argv.extend(["--", *paths])
        done = run_vcs(self.root, argv)
        if done.returncode != 0:
            raise RuntimeError((done.stderr or done.stdout).strip() or "git commit failed")
        head = run_vcs(self.root, ["git", "rev-parse", "HEAD"])
        return head.stdout.strip() or None

    def log(self, paths: list[str], since: str | None, limit: int) -> list[HistoryRevision]:
        argv = ["git", "log", f"--format={GIT_LOG_FORMAT}", "-n", str(limit)]
        if since is not None:
            argv.append(f"{since}..HEAD")
        argv.extend(["--", *paths])
        result = run_vcs(self.root, argv)
        if result.returncode != 0:
            if since is not None:
                return []
            raise RuntimeError((result.stderr or result.stdout).strip() or "git log failed")
        revisions: list[HistoryRevision] = []
        for record in result.stdout.split(LOG_RECORD_SEPARATOR):
            record = record.strip("\n")
            if not record:
                continue
            commit_id, message, time, author = record.split(LOG_FIELD_SEPARATOR)
            revisions.append(HistoryRevision(id=commit_id, message=message, time=time, author=author))
        return revisions

    def show(self, revision: str, path: str) -> str:
        result = run_vcs(self.root, ["git", "show", f"{revision}:{path}"])
        if result.returncode != 0:
            return ""
        return result.stdout


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
        status = run_vcs(self.root, ["svn", "status", *paths])
        if status.returncode not in {0, 1}:
            raise RuntimeError(status.stderr.strip() or "svn status failed")
        for line in status.stdout.splitlines():
            if line.startswith("?"):
                path = line.split()[-1] if line.split() else ""
                if path:
                    added = run_vcs(self.root, ["svn", "add", path])
                    if added.returncode != 0:
                        raise RuntimeError(added.stderr.strip() or "svn add failed")
        done = run_vcs(self.root, ["svn", "commit", *paths, "-m", message])
        if done.returncode != 0:
            raise RuntimeError((done.stderr or done.stdout).strip() or "svn commit failed")
        info = run_vcs(self.root, ["svn", "info", "--show-item", "revision"])
        return info.stdout.strip() or None

    def log(self, paths: list[str], since: str | None, limit: int) -> list[HistoryRevision]:
        return []

    def show(self, revision: str, path: str) -> str:
        return ""


class NoneAdapter:
    def status(self, paths: list[str]) -> list[str]:
        return []

    def revision(self) -> Revision | None:
        return None

    def commit(self, paths: list[str], message: str) -> str | None:
        return None

    def log(self, paths: list[str], since: str | None, limit: int) -> list[HistoryRevision]:
        return []

    def show(self, revision: str, path: str) -> str:
        return ""


def make_adapter(root: Path, settings: Settings) -> GitAdapter | SvnAdapter | NoneAdapter:
    if settings.vcs == "git":
        return GitAdapter(root)
    if settings.vcs == "svn":
        return SvnAdapter(root)
    return NoneAdapter()

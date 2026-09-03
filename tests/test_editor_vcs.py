import subprocess
import sys
import tempfile
import unittest
from dataclasses import fields
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.vcs import (
    ALLOWED_COMMANDS,
    GitAdapter,
    HistoryRevision,
    NoneAdapter,
    SvnAdapter,
    run_vcs,
)


FIRST_CONTENT = (
    "table: skills\n"
    "schema: schemas/skills.json\n"
    "\n"
    "| id | name | damage |\n"
    "| --- | --- | --- |\n"
    "| 40001 | fireball | 100 |\n"
)
SECOND_CONTENT = FIRST_CONTENT.replace("| 40001 | fireball | 100 |", "| 40001 | fireball | 130 |")


def _git(root: Path, *argv: str) -> str:
    done = subprocess.run(["git", *argv], cwd=root, check=True, capture_output=True, text=True)
    return done.stdout


def _init_history_repo(root: Path) -> tuple[str, str]:
    (root / "tables").mkdir()
    (root / "tables" / "skills.txt").write_text(FIRST_CONTENT, encoding="utf-8")
    _git(root, "init")
    _git(root, "config", "user.email", "editor@test")
    _git(root, "config", "user.name", "Editor Test")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "config(skills): first")
    first = _git(root, "rev-parse", "HEAD").strip()
    (root / "tables" / "skills.txt").write_text(SECOND_CONTENT, encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "config(skills): second")
    second = _git(root, "rev-parse", "HEAD").strip()
    return first, second


class GitLogTests(unittest.TestCase):
    def test_log_returns_newest_first_with_contract_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first, second = _init_history_repo(root)
            adapter = GitAdapter(root)
            history = adapter.log(["tables/skills.txt"], None, 10)
            self.assertEqual([item.id for item in history], [second, first])
            self.assertEqual(
                [item.message for item in history],
                ["config(skills): second", "config(skills): first"],
            )
            self.assertEqual(history[0].author, "Editor Test")
            datetime.fromisoformat(history[0].time)
            self.assertIn("T", history[0].time)

    def test_log_since_truncates_and_limit_caps(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first, second = _init_history_repo(root)
            adapter = GitAdapter(root)
            since_first = adapter.log(["tables/skills.txt"], first, 10)
            self.assertEqual([item.id for item in since_first], [second])
            limited = adapter.log(["tables/skills.txt"], None, 1)
            self.assertEqual([item.id for item in limited], [second])

    def test_log_unknown_since_returns_empty_without_raising(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _init_history_repo(root)
            adapter = GitAdapter(root)
            self.assertEqual(adapter.log(["tables/skills.txt"], "0" * 40, 10), [])

    def test_log_only_lists_commits_touching_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _init_history_repo(root)
            adapter = GitAdapter(root)
            self.assertEqual(adapter.log(["tables/other.txt"], None, 10), [])


class GitShowTests(unittest.TestCase):
    def test_show_returns_old_revision_content(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first, second = _init_history_repo(root)
            adapter = GitAdapter(root)
            old = adapter.show(first, "tables/skills.txt")
            self.assertEqual(old.replace("\r\n", "\n"), FIRST_CONTENT)
            self.assertNotIn("| 130 |", old)
            new = adapter.show(second, "tables/skills.txt")
            self.assertEqual(new.replace("\r\n", "\n"), SECOND_CONTENT)

    def test_show_missing_path_or_revision_returns_empty(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first, _ = _init_history_repo(root)
            adapter = GitAdapter(root)
            self.assertEqual(adapter.show(first, "tables/missing.txt"), "")
            self.assertEqual(adapter.show("0" * 40, "tables/skills.txt"), "")


class WhitelistTests(unittest.TestCase):
    def test_history_revision_contract(self):
        self.assertEqual([field.name for field in fields(HistoryRevision)], ["id", "message", "time", "author"])

    def test_log_and_show_whitelisted_but_rebase_rejected(self):
        self.assertIn(("git", "log"), ALLOWED_COMMANDS)
        self.assertIn(("git", "show"), ALLOWED_COMMANDS)
        self.assertIn(("git", "status"), ALLOWED_COMMANDS)
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                run_vcs(Path(temp), ["git", "rebase"])


class FallbackAdapterTests(unittest.TestCase):
    def test_svn_and_none_history_stubs(self):
        with tempfile.TemporaryDirectory() as temp:
            svn = SvnAdapter(Path(temp))
            self.assertEqual(svn.log(["tables"], None, 5), [])
            self.assertEqual(svn.show("17", "tables/skills.txt"), "")
            none = NoneAdapter()
            self.assertEqual(none.log(["tables"], None, 5), [])
            self.assertEqual(none.show("abc123", "tables/skills.txt"), "")


if __name__ == "__main__":
    unittest.main()

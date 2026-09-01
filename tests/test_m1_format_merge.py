import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.text_table import format_table_text, parse_table


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"


def _run_cli(*args: str, root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), *args, "--root", str(root)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _copy_authority(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)


class FormatAndMergeTests(unittest.TestCase):
    def test_shipped_formatter_twice_yields_identical_bytes(self):
        dirty = (
            "table: skills\nschema: schemas/skills.json\n"
            "| id | name |\n|---|---|\n| 2 | beta |\n| 1 | alpha |\n"
        )
        once = format_table_text(parse_table(dirty, Path("tables/skills.txt")))
        twice = format_table_text(parse_table(once, Path("tables/skills.txt")))
        self.assertEqual(once.encode("utf-8"), twice.encode("utf-8"))
        self.assertLess(once.index("| 1"), once.index("| 2"))

    def test_cli_format_twice_on_dirty_table_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            table_path = root / "tables" / "skills.txt"
            table_path.write_text(
                "table: skills\nschema: schemas/skills.json\n"
                "|id|name|display_name|effect_id|damage|cooldown_frames|icon|\n"
                "|---|---|---|---|---|---|---|\n"
                "|40002|frostbolt|Frostbolt|50002|90|90|fx_frostbolt|\n"
                "|40001|fireball|Fireball|50001|120|150|fx_fireball|\n",
                encoding="utf-8",
                newline="\n",
            )
            first = _run_cli("format", root=root)
            self.assertEqual(first.returncode, 0, first.stderr)
            once = table_path.read_bytes()
            second = _run_cli("format", root=root)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(once, table_path.read_bytes())

    def test_dirty_table_fails_shipped_format_check(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            table_path = root / "tables" / "skills.txt"
            table_path.write_text(
                table_path.read_text(encoding="utf-8").replace("| 40001 |", "|40001|"),
                encoding="utf-8",
                newline="\n",
            )
            result = _run_cli("format", "--check", root=root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("format:", result.stdout)

    def test_row_disjoint_edits_merge_without_git_conflict(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / "repo"
            repo.mkdir()
            table_dir = repo / "tables"
            table_dir.mkdir()
            source = (ROOT / "tables" / "skills.txt").read_text(encoding="utf-8")
            table_path = table_dir / "skills.txt"
            table_path.write_text(source, encoding="utf-8", newline="\n")

            def git(*args: str) -> subprocess.CompletedProcess[str]:
                return subprocess.run(
                    ["git", *args],
                    cwd=repo,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    check=True,
                )

            git("init", "-b", "main")
            git("config", "user.email", "m1-merge@test.local")
            git("config", "user.name", "M1 Merge")
            git("add", "tables/skills.txt")
            git("commit", "-m", "base")
            git("checkout", "-b", "row-a")
            table_path.write_text(
                "\n".join(
                    line.replace("120", "121", 1) if "fireball" in line else line
                    for line in source.splitlines()
                )
                + "\n",
                encoding="utf-8",
                newline="\n",
            )
            git("commit", "-am", "edit fireball damage")
            git("checkout", "main")
            git("checkout", "-b", "row-b")
            table_path.write_text(
                "\n".join(
                    line.replace("90", "91", 1) if "frostbolt" in line else line
                    for line in source.splitlines()
                )
                + "\n",
                encoding="utf-8",
                newline="\n",
            )
            git("commit", "-am", "edit frostbolt damage")
            merged = subprocess.run(
                ["git", "merge", "row-a", "-m", "merge disjoint rows"],
                cwd=repo,
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(merged.returncode, 0, merged.stdout + merged.stderr)
            self.assertNotIn("CONFLICT", merged.stdout)
            self.assertNotIn("CONFLICT", merged.stderr)
            combined = table_path.read_text(encoding="utf-8")
            self.assertIn("121", combined)
            self.assertIn("91", combined)


if __name__ == "__main__":
    unittest.main()

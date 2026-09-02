import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.fingerprint import content_fingerprint
from lumio_config.model import TableParseError
from lumio_config.text_table import format_table_text, parse_table
from lumio_config.validate import validate_repository


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

    def test_four_state_tokens_round_trip_through_shipped_parser(self):
        source = (
            "table: states\nschema: schemas/states.json\n"
            "| id | name | note | flag | extra |\n"
            "| --- | --- | --- | --- | --- |\n"
            '| 1 | alpha | "" | null | @default |\n'
        )
        parsed = parse_table(source, Path("tables/states.txt"))
        self.assertEqual(parsed.rows[0]["id"].state, "value")
        self.assertEqual(parsed.rows[0]["id"].value, "1")
        self.assertEqual(parsed.rows[0]["name"].value, "alpha")
        self.assertEqual(parsed.rows[0]["note"].state, "empty")
        self.assertEqual(parsed.rows[0]["flag"].state, "null")
        self.assertEqual(parsed.rows[0]["extra"].state, "default")
        formatted = format_table_text(parsed)
        again = parse_table(formatted, Path("tables/states.txt"))
        self.assertEqual(
            {name: (cell.state, cell.value) for name, cell in again.rows[0].items()},
            {name: (cell.state, cell.value) for name, cell in parsed.rows[0].items()},
        )
        omitted = (
            "table: states\nschema: schemas/states.json\n"
            "| id | name | note |\n"
            "| --- | --- | --- |\n"
            "| 1 | alpha |\n"
        )
        missing = parse_table(omitted, Path("tables/states.txt"))
        self.assertEqual(missing.rows[0]["note"].state, "missing")
        self.assertEqual(missing.rows[0]["note"].token(), "@missing")

    def test_pipe_escape_round_trips_and_unknown_escape_is_invalid(self):
        source = (
            "table: states\nschema: schemas/states.json\n"
            "| id | name |\n"
            "| --- | --- |\n"
            "| 1 | a\\|b |\n"
        )
        parsed = parse_table(source, Path("tables/states.txt"))
        self.assertEqual(parsed.rows[0]["name"].value, "a|b")
        self.assertIn("a\\|b", format_table_text(parsed))

        dangling = (
            "table: states\nschema: schemas/states.json\n"
            "| id | name |\n"
            "| --- | --- |\n"
            "| 1 | trailing\\ |\n"
        )
        with self.assertRaises(TableParseError) as raised:
            parse_table(dangling, Path("tables/states.txt"))
        self.assertEqual(raised.exception.code, "INVALID_ESCAPE")

        unknown = (
            "table: states\nschema: schemas/states.json\n"
            "| id | name |\n"
            "| --- | --- |\n"
            "| 1 | a\\nb |\n"
        )
        with self.assertRaises(TableParseError) as raised_unknown:
            parse_table(unknown, Path("tables/states.txt"))
        self.assertEqual(raised_unknown.exception.code, "INVALID_ESCAPE")

    def test_undeclared_column_is_rejected_by_validate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            (root / "tables" / "skills.txt").write_text(
                "table: skills\nschema: schemas/skills.json\n\n"
                "| id | name | display_name | effect_id | damage | cooldown_frames | icon | extra |\n"
                "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
                "| 40001 | fireball | Fireball | 50001 | 120 | 150 | fx_fireball | nope |\n\n"
                "| 40002 | frostbolt | Frostbolt | 50002 | 90 | 90 | fx_frostbolt | nope |\n",
                encoding="utf-8",
                newline="\n",
            )
            errors = validate_repository(root)
            self.assertTrue(any(error["code"] == "UNKNOWN_COLUMN" for error in errors), errors)

    def test_format_check_does_not_change_source_sha256(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            table_path = root / "tables" / "skills.txt"
            dirty = table_path.read_text(encoding="utf-8").replace("| 40001 |", "|40001|")
            table_path.write_text(dirty, encoding="utf-8", newline="\n")
            before = hashlib.sha256(table_path.read_bytes()).hexdigest()
            result = _run_cli("format", "--check", root=root)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(before, hashlib.sha256(table_path.read_bytes()).hexdigest())
            self.assertEqual(table_path.read_text(encoding="utf-8"), dirty)

    def test_schema_ordinal_missing_and_duplicate_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            schema_path = root / "schemas" / "skills.json"
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            for column in schema["columns"]:
                column.pop("ordinal", None)
            schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
            missing = validate_repository(root)
            self.assertTrue(any(error["code"] == "MISSING_ORDINAL" for error in missing), missing)

            schema["columns"][0]["ordinal"] = 0
            schema["columns"][1]["ordinal"] = 0
            for index, column in enumerate(schema["columns"][2:], start=2):
                column["ordinal"] = index
            schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
            duplicated = validate_repository(root)
            self.assertTrue(any(error["code"] == "DUPLICATE_ORDINAL" for error in duplicated), duplicated)

    def test_content_fingerprint_uses_ordinal_not_json_array_order(self):
        source = (
            "table: labels\nschema: schemas/labels.json\n"
            "| id | name |\n| --- | --- |\n| 1 | alpha |\n"
        )
        table = parse_table(source, Path("tables/labels.txt"))
        schema_a = {
            "table": "labels",
            "idColumn": "id",
            "columns": [
                {"name": "id", "type": "u32", "required": True, "visibility": "S", "ordinal": 0},
                {"name": "name", "type": "string", "required": True, "visibility": "S", "ordinal": 1},
            ],
        }
        schema_b = {
            "table": "labels",
            "idColumn": "id",
            "columns": [
                {"name": "name", "type": "string", "required": True, "visibility": "S", "ordinal": 1},
                {"name": "id", "type": "u32", "required": True, "visibility": "S", "ordinal": 0},
            ],
        }
        self.assertEqual(content_fingerprint(table, schema_a), content_fingerprint(table, schema_b))

    def test_real_tables_contain_no_logic_and_validate(self):
        errors = validate_repository(ROOT)
        self.assertEqual(errors, [], errors)
        for name in ("skills", "effects", "drops"):
            text = (ROOT / "tables" / f"{name}.txt").read_text(encoding="utf-8")
            self.assertNotRegex(text, r"\bif\b")
            self.assertNotIn("script", text.lower())
            schema = json.loads((ROOT / "schemas" / f"{name}.json").read_text(encoding="utf-8"))
            ordinals = [column["ordinal"] for column in schema["columns"]]
            self.assertEqual(len(ordinals), len(set(ordinals)))
            self.assertTrue(all(isinstance(value, int) and not isinstance(value, bool) for value in ordinals))


if __name__ == "__main__":
    unittest.main()

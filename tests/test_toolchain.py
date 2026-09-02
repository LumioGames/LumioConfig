import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.export import export_repository
from lumio_config.fingerprint import content_fingerprint
from lumio_config.text_table import format_table_text, parse_table
from lumio_config.validate import validate_repository


ROOT = Path(__file__).resolve().parents[1]


def _columns(*columns: dict) -> list[dict]:
    return [{**column, "ordinal": index} for index, column in enumerate(columns)]


class ToolchainTests(unittest.TestCase):
    def test_repository_examples_validate_without_errors(self):
        errors = validate_repository(ROOT)
        self.assertEqual(errors, [], errors)

    def test_row_registry_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "schemas").mkdir()
            (root / "tables").mkdir()
            (root / "registry").mkdir()
            (root / "schemas" / "items.json").write_text(
                json.dumps(
                    {
                        "table": "items",
                        "idColumn": "id",
                        "columns": _columns(
                            {"name": "id", "type": "u32", "required": True, "visibility": "SCV"},
                            {"name": "name", "type": "string", "required": True, "visibility": "SCV"},
                        ),
                    }
                ),
                encoding="utf-8",
            )
            (root / "tables" / "items.txt").write_text(
                "table: items\nschema: schemas/items.json\n"
                "| id | name |\n| --- | --- |\n| 10 | potion |\n",
                encoding="utf-8",
            )
            (root / "registry" / "row-ids.json").write_text('{"items":{"potion":11}}\n', encoding="utf-8")
            (root / "registry" / "tombstones.json").write_text("{}\n", encoding="utf-8")
            errors = validate_repository(root)
            self.assertEqual(errors[0]["code"], "ID_REGISTRY_MISMATCH")

    def test_reference_visible_to_a_target_requires_visible_target_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "schemas").mkdir()
            (root / "tables").mkdir()
            (root / "registry").mkdir()
            (root / "schemas" / "items.json").write_text(
                json.dumps(
                    {
                        "table": "items",
                        "idColumn": "id",
                        "columns": _columns(
                            {"name": "id", "type": "u32", "required": True, "visibility": "S"},
                            {"name": "name", "type": "string", "required": True, "visibility": "C"},
                        ),
                    }
                ),
                encoding="utf-8",
            )
            (root / "schemas" / "links.json").write_text(
                json.dumps(
                    {
                        "table": "links",
                        "idColumn": "id",
                        "columns": _columns(
                            {"name": "id", "type": "u32", "required": True, "visibility": "SCV"},
                            {"name": "item_id", "type": "ref", "required": True, "refTarget": "items", "visibility": "C"},
                        ),
                    }
                ),
                encoding="utf-8",
            )
            (root / "tables" / "items.txt").write_text(
                "table: items\nschema: schemas/items.json\n| id | name |\n| --- | --- |\n| 1 | one |\n",
                encoding="utf-8",
            )
            (root / "tables" / "links.txt").write_text(
                "table: links\nschema: schemas/links.json\n| id | item_id |\n| --- | --- |\n| 2 | 1 |\n",
                encoding="utf-8",
            )
            (root / "registry" / "row-ids.json").write_text("{}\n", encoding="utf-8")
            (root / "registry" / "tombstones.json").write_text("{}\n", encoding="utf-8")
            errors = validate_repository(root)
            self.assertTrue(any(error["code"] == "HIDDEN_REF_TARGET" for error in errors), errors)

    def test_invalid_reference_reports_table_row_and_column(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "schemas").mkdir()
            (root / "tables").mkdir()
            (root / "registry").mkdir()
            (root / "schemas" / "skills.json").write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "idColumn": "id",
                        "columns": _columns(
                            {"name": "id", "type": "u32", "required": True, "visibility": "SCV"},
                            {"name": "effect_id", "type": "ref", "required": True, "refTarget": "effects", "visibility": "S"},
                        ),
                    }
                ),
                encoding="utf-8",
            )
            (root / "schemas" / "effects.json").write_text(
                json.dumps(
                    {
                        "table": "effects",
                        "idColumn": "id",
                        "columns": _columns({"name": "id", "type": "u32", "required": True, "visibility": "S"}),
                    }
                ),
                encoding="utf-8",
            )
            (root / "tables" / "skills.txt").write_text(
                "table: skills\nschema: schemas/skills.json\n"
                "| id | effect_id |\n| --- | --- |\n| 1 | 99 |\n",
                encoding="utf-8",
            )
            (root / "tables" / "effects.txt").write_text(
                "table: effects\nschema: schemas/effects.json\n"
                "| id |\n| --- |\n| 10 |\n",
                encoding="utf-8",
            )
            (root / "registry" / "row-ids.json").write_text("{}\n", encoding="utf-8")
            (root / "registry" / "tombstones.json").write_text("{}\n", encoding="utf-8")

            errors = validate_repository(root)
            self.assertEqual(len(errors), 1)
            self.assertEqual(
                errors[0],
                {
                    "table": "skills",
                    "row": "1",
                    "column": "effect_id",
                    "code": "MISSING_REF",
                    "message": "reference 99 is not present in effects",
                    "suggestion": "add the referenced row or change the id",
                },
            )

    def test_format_is_idempotent(self):
        source = (
            "table: skills\nschema: schemas/skills.json\n"
            "| id | name |\n|---|---|\n| 2 | beta |\n| 1 | alpha |\n"
        )
        once = format_table_text(parse_table(source, Path("tables/skills.txt")))
        twice = format_table_text(parse_table(once, Path("tables/skills.txt")))
        self.assertEqual(once, twice)
        self.assertLess(once.index("| 1"), once.index("| 2"))

    def test_content_fingerprint_ignores_layout(self):
        left = (
            "table: skills\nschema: schemas/skills.json\n"
            "| id | name |\n| --- | --- |\n| 1 | alpha |\n"
        )
        right = (
            "table: skills\nschema: schemas/skills.json\n"
            "|id|name|\n|---|---|\n|1|alpha|\n"
        )
        schema = {
            "table": "skills",
            "idColumn": "id",
            "columns": _columns(
                {"name": "id", "type": "u32", "required": True, "visibility": "SCV"},
                {"name": "name", "type": "string", "required": True, "visibility": "SCV"},
            ),
        }
        self.assertEqual(
            content_fingerprint(parse_table(left, Path("skills.txt")), schema),
            content_fingerprint(parse_table(right, Path("skills.txt")), schema),
        )

    def test_client_projection_omits_server_only_column(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "export"
            result = export_repository(ROOT, output)
            client = json.loads((output / "client" / "skills.json").read_text(encoding="utf-8"))
            self.assertIn("display_name", client["rows"][0])
            self.assertNotIn("damage", client["rows"][0])
            self.assertEqual(result["targets"], ["S", "C", "V"])

    def test_four_cell_states_are_preserved_in_content_fingerprint(self):
        source = (
            "table: states\nschema: schemas/states.json\n"
            "| id | required_name | optional_name | default_name |\n"
            "| --- | --- | --- | --- |\n"
            '| 1 | alpha | "" | @default |\n'
            "| 2 | beta | null | @missing |\n"
        )
        schema = {
            "table": "states",
            "idColumn": "id",
            "columns": _columns(
                {"name": "id", "type": "u32", "required": True, "visibility": "SCV"},
                {"name": "required_name", "type": "string", "required": True, "visibility": "S"},
                {"name": "optional_name", "type": "string", "required": False, "visibility": "S"},
                {"name": "default_name", "type": "string", "required": False, "default": "fallback", "visibility": "S"},
            ),
        }
        table = parse_table(source, Path("states.txt"))
        self.assertEqual(table.rows[0]["optional_name"].state, "empty")
        self.assertEqual(table.rows[1]["optional_name"].state, "null")
        self.assertEqual(table.rows[0]["default_name"].state, "default")
        self.assertEqual(table.rows[1]["default_name"].state, "missing")
        self.assertNotEqual(
            content_fingerprint(table, schema),
            content_fingerprint(parse_table(source.replace('""', "null", 1), Path("states.txt")), schema),
        )

    def test_type_error_is_structured_and_sorted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "schemas").mkdir()
            (root / "tables").mkdir()
            (root / "registry").mkdir()
            (root / "schemas" / "values.json").write_text(
                json.dumps(
                    {
                        "table": "values",
                        "idColumn": "id",
                        "columns": _columns(
                            {"name": "id", "type": "u32", "required": True, "visibility": "SCV"},
                            {"name": "amount", "type": "i32", "required": True, "visibility": "S"},
                        ),
                    }
                ),
                encoding="utf-8",
            )
            (root / "tables" / "values.txt").write_text(
                "table: values\nschema: schemas/values.json\n"
                "| id | amount |\n| --- | --- |\n| 1 | not-an-int |\n",
                encoding="utf-8",
            )
            (root / "registry" / "row-ids.json").write_text("{}\n", encoding="utf-8")
            (root / "registry" / "tombstones.json").write_text("{}\n", encoding="utf-8")
            errors = validate_repository(root)
            self.assertEqual(errors[0]["code"], "TYPE_MISMATCH")
            self.assertEqual(errors[0]["table"], "values")
            self.assertEqual(errors[0]["row"], "1")
            self.assertEqual(errors[0]["column"], "amount")

    def test_repeated_exports_are_byte_identical(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first = export_repository(ROOT, root / "one")
            second = export_repository(ROOT, root / "two")
            self.assertEqual(first, second)
            for first_path in sorted((root / "one").rglob("*.json")):
                second_path = root / "two" / first_path.relative_to(root / "one")
                self.assertEqual(first_path.read_bytes(), second_path.read_bytes())


if __name__ == "__main__":
    unittest.main()

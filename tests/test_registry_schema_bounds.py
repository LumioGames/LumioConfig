import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.ids import verify_registry, write_json
from lumio_config.patch import apply_patch
from lumio_config.validate import validate_repository


def _source(root, table="skills", ids=(1, 16), bounds=None, id_column="id", kind="u32"):
    schema = {
        "table": table,
        "idColumn": id_column,
        "columns": [
            {"name": id_column, "ordinal": 0, "type": kind, "required": True, "visibility": "S", **(bounds or {})},
            {"name": "name", "ordinal": 1, "type": "string", "required": True, "visibility": "S"},
        ],
    }
    write_json(root / "schemas" / f"{table}.json", schema)
    (root / "tables").mkdir(exist_ok=True)
    text = f"table: {table}\nschema: schemas/{table}.json\n| {id_column} | name |\n| --- | --- |\n"
    text += "".join(f"| {row_id} | row{index} |\n" for index, row_id in enumerate(ids))
    (root / "tables" / f"{table}.txt").write_text(text, encoding="utf-8", newline="\n")
    write_json(root / "registry" / "row-ids.json", {table: {f"row{index}": row_id for index, row_id in enumerate(ids)}})
    write_json(root / "registry" / "tombstones.json", {table: []})


class RegistrySchemaBoundsTests(unittest.TestCase):
    def _assert_malformed_columns_are_structured(self, columns):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, ids=(40001,))
            path = root / "schemas" / "skills.json"
            schema = json.loads(path.read_text(encoding="utf-8"))
            schema["columns"] = columns
            write_json(path, schema)
            self.assertEqual([error["code"] for error in validate_repository(root)], ["SCHEMA_COLUMNS_MISSING"])
            result = subprocess.run(
                [sys.executable, str(Path(__file__).resolve().parents[1] / "tools" / "lumio_config.py"),
                 "registry", "verify", "--root", str(root)],
                capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stderr, "")
            self.assertEqual([error["code"] for error in json.loads(result.stdout)], ["SCHEMA_COLUMNS_MISSING"])
            self.assertEqual([error["code"] for error in verify_registry(root)], ["SCHEMA_COLUMNS_MISSING"])

    def test_null_schema_columns_return_structured_diagnostic(self):
        self._assert_malformed_columns_are_structured(None)

    def test_scalar_schema_columns_return_structured_diagnostic(self):
        self._assert_malformed_columns_are_structured(42)

    def test_explicit_minimum_accepts_domain_ids_under_shared_table_names(self):
        for table, ids in (("skills", (1, 16)), ("attributes", (101001, 101002))):
            with self.subTest(table=table), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _source(root, table, ids, {"minimum": 0})
                self.assertEqual(validate_repository(root), [])
                self.assertEqual(verify_registry(root), [])

    def test_maximum_only_uses_positive_global_lower_bound(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, ids=(1, 16), bounds={"maximum": 16})
            self.assertEqual(verify_registry(root), [])

    def test_custom_id_column_owns_bounds(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, bounds={"minimum": 1, "maximum": 16}, id_column="permanent_id")
            self.assertEqual(validate_repository(root), [])
            self.assertEqual(verify_registry(root), [])

    def test_explicit_limits_reject_table_and_registered_ids(self):
        for row_id in (0, 17, 40001):
            with self.subTest(row_id=row_id), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _source(root, ids=(row_id,), bounds={"minimum": 1, "maximum": 16})
                errors = verify_registry(root)
                self.assertEqual([error["code"] for error in errors], ["ID_OUT_OF_RANGE"] * 2)
                self.assertTrue(any(error["code"] == "RANGE_OVERFLOW" for error in validate_repository(root)))

    def test_explicit_minimum_does_not_allow_zero_negative_or_global_overflow(self):
        for row_id in (0, -1, 2**31):
            with self.subTest(row_id=row_id), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _source(root, ids=(row_id,), bounds={"minimum": 0})
                self.assertEqual([error["code"] for error in verify_registry(root)], ["ID_OUT_OF_RANGE"] * 2)

    def test_declared_integer_type_still_limits_explicit_bounds(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, ids=(-1,), bounds={"minimum": -10, "maximum": 10}, kind="u32")
            self.assertEqual([error["code"] for error in verify_registry(root)], ["ID_OUT_OF_RANGE"] * 2)

    def test_fractional_bounds_use_integer_intersection(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, ids=(2, 15), bounds={"minimum": 1.5, "maximum": 15.5})
            self.assertEqual(verify_registry(root), [])

    def test_invalid_bound_is_structured_and_cannot_widen_namespace(self):
        for bound in ("invalid", "NaN", "Infinity"):
            with self.subTest(bound=bound), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _source(root, bounds={"minimum": bound})
                self.assertIn("SCHEMA_BOUND_INVALID", [error["code"] for error in verify_registry(root)])

    def test_unbounded_sample_preserves_namespace_range(self):
        for ids, expected in (((40001, 49999), []), ((99,), ["ID_OUT_OF_RANGE"] * 2)):
            with self.subTest(ids=ids), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _source(root, ids=ids)
                self.assertEqual([error["code"] for error in verify_registry(root)], expected)

    def test_non_id_column_bound_does_not_override_sample_range(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, ids=(99,))
            path = root / "schemas" / "skills.json"
            schema = json.loads(path.read_text(encoding="utf-8"))
            schema["columns"][1]["minimum"] = 0
            write_json(path, schema)
            self.assertEqual([error["code"] for error in verify_registry(root)], ["ID_OUT_OF_RANGE"] * 2)

    def test_domain_bounds_preserve_identity_errors(self):
        for payload, tombstones, code in (
            ({"skills": {"row0": 1, "row1": 1}}, {"skills": []}, "DUPLICATE_ID"),
            ({"skills": {"row0": 1, "row1": 16}}, {"skills": [1]}, "TOMBSTONED_ID"),
            ({"skills": {"row0": 1, "row1": 16}, "aliases": {"skills": {"row0": 16}}}, {"skills": []}, "ALIAS_CONFLICT"),
            ({"skills": {"row0": 2, "row1": 16}}, {"skills": []}, "ID_REGISTRY_MISMATCH"),
        ):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _source(root, bounds={"minimum": 0})
                write_json(root / "registry" / "row-ids.json", payload)
                write_json(root / "registry" / "tombstones.json", tombstones)
                codes = [error["code"] for error in verify_registry(root)]
                self.assertIn(code, codes)
                self.assertNotIn("ID_OUT_OF_RANGE", codes)

    def test_domain_seed_create_rename_delete_remain_valid(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _source(root, table="attributes", ids=(101001,), bounds={"minimum": 0})
            write_json(root / "registry" / "tombstones.json", {"attributes": [90000, 90001, 90002, 101002]})
            for ops in (
                [{"op": "create", "name": "fresh", "set": {}}],
                [{"op": "rename", "name": "fresh", "to": "renamed"}],
                [{"op": "delete", "name": "renamed"}],
            ):
                result = apply_patch(root, {"table": "attributes", "ops": ops})
                self.assertEqual(result.errors, [], result.errors)
                self.assertEqual(validate_repository(root), [])
                self.assertEqual(verify_registry(root), [])
            row_ids = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            self.assertEqual(row_ids["aliases"]["attributes"]["fresh"], 101003)
            tombstones = json.loads((root / "registry" / "tombstones.json").read_text(encoding="utf-8"))
            self.assertEqual(tombstones["attributes"], [90000, 90001, 90002, 101002, 101003])

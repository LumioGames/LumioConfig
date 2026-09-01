import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.ids import seat_index_by_permanent_id
from lumio_config.patch import apply_patch, validate_patch
from lumio_config.text_table import parse_table
from lumio_config.validate import load_sources


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"


def _copy_authority(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)


def _run_cli(*args: str, root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), *args, "--root", str(root)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _create_skill(name: str) -> dict:
    return {
        "table": "skills",
        "ops": [
            {
                "op": "create",
                "name": name,
                "set": {
                    "display_name": name.replace("_", " ").title(),
                    "effect_id": "chill",
                    "damage": 40,
                    "cooldown_frames": 60,
                    "icon": f"fx_{name}",
                },
            }
        ],
    }


def _registry(root: Path) -> dict:
    return json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))


def _tombstones(root: Path) -> dict:
    return json.loads((root / "registry" / "tombstones.json").read_text(encoding="utf-8"))


class PatchAndIdTests(unittest.TestCase):
    def test_bad_patch_returns_locating_structured_error(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            errors = validate_patch(
                root,
                {
                    "table": "skills",
                    "ops": [
                        {
                            "op": "update",
                            "name": "fireball",
                            "set": {"damage": "not-a-number"},
                        }
                    ],
                },
            )
            self.assertEqual(len(errors), 1, errors)
            error = errors[0]
            self.assertEqual(error["table"], "skills")
            self.assertEqual(error["row"], "fireball")
            self.assertEqual(error["column"], "damage")
            self.assertEqual(error["code"], "TYPE_MISMATCH")
            self.assertTrue(error["message"])
            self.assertTrue(error["suggestion"])

    def test_bad_patch_check_finishes_in_seconds(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            started = time.perf_counter()
            errors = validate_patch(
                root,
                {
                    "table": "skills",
                    "ops": [
                        {
                            "op": "update",
                            "name": "fireball",
                            "set": {"damage": "not-a-number"},
                        }
                    ],
                },
            )
            elapsed = time.perf_counter() - started
            self.assertTrue(errors)
            self.assertLess(elapsed, 10)

    def test_good_patch_applies_unattended_into_authority(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            errors = apply_patch(root, _create_skill("ice_lance"))
            self.assertEqual(errors, [], errors)
            text = (root / "tables" / "skills.txt").read_text(encoding="utf-8")
            self.assertIn("ice_lance", text)
            issued = _registry(root)["skills"]["ice_lance"]
            self.assertIsInstance(issued, int)
            self.assertNotIn("id", _create_skill("ice_lance")["ops"][0]["set"])

    def test_nfd_patch_string_apply_passes_format_check(self):
        decomposed = "Cafe\u0301"
        composed = unicodedata.normalize("NFC", decomposed)
        self.assertNotEqual(decomposed, composed)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            errors = apply_patch(
                root,
                {
                    "table": "skills",
                    "ops": [
                        {
                            "op": "create",
                            "name": "cafe_bolt",
                            "set": {
                                "display_name": decomposed,
                                "effect_id": "chill",
                                "damage": 40,
                                "cooldown_frames": 60,
                                "icon": "fx_cafe",
                            },
                        }
                    ],
                },
            )
            self.assertEqual(errors, [], errors)
            text = (root / "tables" / "skills.txt").read_text(encoding="utf-8")
            self.assertIn(composed, text)
            self.assertNotIn(decomposed, text)
            result = _run_cli("format", "--check", root=root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("format: OK", result.stdout)

    def test_patch_refuses_to_let_caller_assign_permanent_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            errors = validate_patch(
                root,
                {
                    "table": "skills",
                    "ops": [
                        {
                            "op": "create",
                            "name": "ice_lance",
                            "set": {
                                "id": 40099,
                                "display_name": "Ice Lance",
                                "effect_id": "chill",
                                "damage": 40,
                                "cooldown_frames": 60,
                                "icon": "fx_ice_lance",
                            },
                        }
                    ],
                },
            )
            self.assertEqual(errors[0]["code"], "PATCH_ASSIGNS_ID")
            self.assertEqual(errors[0]["column"], "id")

    def test_two_name_only_creates_receive_distinct_permanent_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            first = apply_patch(root, _create_skill("ice_lance"))
            second = apply_patch(root, _create_skill("spark"))
            self.assertEqual(first, [], first)
            self.assertEqual(second, [], second)
            skills = _registry(root)["skills"]
            self.assertNotEqual(skills["ice_lance"], skills["spark"])

    def test_concurrent_name_only_creates_do_not_share_an_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            barrier = threading.Barrier(2)
            results: dict[str, list] = {"ice_lance": [], "spark": []}

            def worker(name: str) -> None:
                barrier.wait()
                results[name] = apply_patch(root, _create_skill(name))

            threads = [
                threading.Thread(target=worker, args=("ice_lance",)),
                threading.Thread(target=worker, args=("spark",)),
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            self.assertEqual(results["ice_lance"], [], results)
            self.assertEqual(results["spark"], [], results)
            skills = _registry(root)["skills"]
            self.assertNotEqual(skills["ice_lance"], skills["spark"])

    def test_tombstoned_id_is_never_reissued(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            self.assertEqual(apply_patch(root, _create_skill("ice_lance")), [])
            retired = _registry(root)["skills"]["ice_lance"]
            delete = {
                "table": "skills",
                "ops": [{"op": "delete", "name": "ice_lance"}],
            }
            self.assertEqual(apply_patch(root, delete), [])
            self.assertIn(retired, _tombstones(root)["skills"])
            self.assertEqual(apply_patch(root, _create_skill("spark")), [])
            reissued = _registry(root)["skills"]["spark"]
            self.assertNotEqual(reissued, retired)
            self.assertNotIn("ice_lance", _registry(root)["skills"])
            reuse = validate_patch(
                root,
                {
                    "table": "skills",
                    "ops": [
                        {
                            "op": "create",
                            "name": "ghost",
                            "set": {
                                "id": retired,
                                "display_name": "Ghost",
                                "effect_id": "chill",
                                "damage": 1,
                                "cooldown_frames": 1,
                                "icon": "fx_ghost",
                            },
                        }
                    ],
                },
            )
            self.assertEqual(reuse[0]["code"], "PATCH_ASSIGNS_ID")

    def test_rename_keeps_permanent_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            before = _registry(root)["skills"]["fireball"]
            errors = apply_patch(
                root,
                {
                    "table": "skills",
                    "ops": [{"op": "rename", "name": "fireball", "to": "fire_ball"}],
                },
            )
            self.assertEqual(errors, [], errors)
            after = _registry(root)["skills"]
            self.assertEqual(after["fire_ball"], before)
            self.assertNotIn("fireball", after)
            table = parse_table((root / "tables" / "skills.txt").read_text(encoding="utf-8"), root / "tables" / "skills.txt")
            renamed = next(row for row in table.rows if row["name"].value == "fire_ball")
            self.assertEqual(int(renamed["id"].value), before)

    def test_seat_index_is_dense_and_not_persisted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            _, tables, _ = load_sources(root)
            seats = seat_index_by_permanent_id(tables["skills"])
            self.assertEqual(seats[40001], 0)
            self.assertEqual(seats[40002], 1)
            registry_text = (root / "registry" / "row-ids.json").read_text(encoding="utf-8")
            tombstone_text = (root / "registry" / "tombstones.json").read_text(encoding="utf-8")
            table_text = (root / "tables" / "skills.txt").read_text(encoding="utf-8")
            self.assertNotIn("seat", registry_text)
            self.assertNotIn("seat", tombstone_text)
            self.assertNotIn("seat", table_text)

    def test_cli_bad_patch_json_contains_locating_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            patch_path = root / "bad.json"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [
                            {
                                "op": "update",
                                "name": "fireball",
                                "set": {"damage": "not-a-number"},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            result = _run_cli("patch", "validate", str(patch_path), root=root)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            error = payload[0]
            self.assertEqual(
                set(error),
                {"table", "row", "column", "code", "message", "suggestion"},
            )
            self.assertEqual(error["table"], "skills")
            self.assertEqual(error["row"], "fireball")
            self.assertEqual(error["column"], "damage")

    def test_cli_good_patch_leaves_named_row_in_text_table(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            patch_path = root / "good.json"
            patch_path.write_text(json.dumps(_create_skill("ice_lance")), encoding="utf-8")
            result = _run_cli("patch", "apply", str(patch_path), root=root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("patch-apply: OK", result.stdout)
            self.assertIn("ice_lance", (root / "tables" / "skills.txt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

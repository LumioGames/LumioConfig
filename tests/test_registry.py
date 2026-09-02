import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.ids import verify_registry, write_json
from lumio_config.patch import apply_patch, validate_patch
from lumio_config.validate import validate_repository


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


class RegistryVerifyTests(unittest.TestCase):
    def test_clean_repository_verify_is_ok(self):
        errors = verify_registry(ROOT)
        self.assertEqual(errors, [], errors)
        result = _run_cli("registry", "verify", root=ROOT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("registry-verify: OK", result.stdout)

    def test_registry_id_missing_from_table_is_reported(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            payload = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            payload["skills"]["ghost"] = 40099
            (root / "registry" / "row-ids.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            errors = verify_registry(root)
            self.assertTrue(any(error["code"] == "REGISTRY_DANGLING_NAME" for error in errors), errors)

    def test_duplicate_and_out_of_range_ids_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            payload = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            payload["skills"]["fireball"] = 40001
            payload["skills"]["clone"] = 40001
            (root / "registry" / "row-ids.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            dupes = verify_registry(root)
            self.assertTrue(any(error["code"] == "DUPLICATE_ID" for error in dupes), dupes)

            payload["skills"]["clone"] = 99
            (root / "registry" / "row-ids.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            ranged = verify_registry(root)
            self.assertTrue(any(error["code"] == "ID_OUT_OF_RANGE" for error in ranged), ranged)

    def test_live_id_in_tombstones_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            tombs = json.loads((root / "registry" / "tombstones.json").read_text(encoding="utf-8"))
            tombs["skills"] = [40001]
            (root / "registry" / "tombstones.json").write_text(json.dumps(tombs, indent=2) + "\n", encoding="utf-8")
            errors = verify_registry(root)
            self.assertTrue(any(error["code"] == "TOMBSTONED_ID" for error in errors), errors)


class AtomicWriteTests(unittest.TestCase):
    def test_replace_failure_leaves_previous_registry_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "row-ids.json"
            original = '{"skills": {"fireball": 40001}}\n'
            path.write_text(original, encoding="utf-8", newline="\n")

            def boom(src: str, dst: str) -> None:
                raise OSError("replace failed")

            with patch("lumio_config.ids.os.replace", boom):
                with self.assertRaises(OSError):
                    write_json(path, {"skills": {"fireball": 40001, "ice": 40003}})
            self.assertEqual(path.read_text(encoding="utf-8"), original)
            self.assertTrue(json.loads(path.read_text(encoding="utf-8")))


class OrdinalPersistedTests(unittest.TestCase):
    def test_patch_with_seat_or_revision_ordinal_is_rejected(self):
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
                            "set": {"damage": 130},
                            "seat": 0,
                        }
                    ],
                },
            )
            self.assertTrue(any(error["code"] == "ORDINAL_PERSISTED" for error in errors), errors)
            errors = validate_patch(
                root,
                {
                    "table": "skills",
                    "revisionOrdinal": 7,
                    "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}],
                },
            )
            self.assertTrue(any(error["code"] == "ORDINAL_PERSISTED" for error in errors), errors)

    def test_registry_seat_field_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            payload = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            payload["seat"] = 1
            (root / "registry" / "row-ids.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            errors = verify_registry(root)
            self.assertTrue(any(error["code"] == "ORDINAL_PERSISTED" for error in errors), errors)
            repo_errors = validate_repository(root)
            self.assertTrue(any(error["code"] == "ORDINAL_PERSISTED" for error in repo_errors), repo_errors)


class AliasTests(unittest.TestCase):
    def test_rename_records_alias_and_old_name_still_resolves(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            result = apply_patch(
                root,
                {"table": "skills", "ops": [{"op": "rename", "name": "frostbolt", "to": "frost_bolt"}]},
            )
            self.assertEqual(result.errors, [], result.errors)
            registry = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            self.assertEqual(registry["skills"]["frost_bolt"], 40002)
            self.assertNotIn("frostbolt", registry["skills"])
            self.assertEqual(registry["aliases"]["skills"]["frostbolt"], 40002)
            drop = apply_patch(
                root,
                {
                    "table": "drops",
                    "ops": [
                        {
                            "op": "create",
                            "name": "legacy_cache",
                            "set": {
                                "skill_id": "frostbolt",
                                "chance_permille": 1,
                                "display_name": "Legacy",
                            },
                        }
                    ],
                },
            )
            self.assertEqual(drop.errors, [], drop.errors)
            text = (root / "tables" / "drops.txt").read_text(encoding="utf-8")
            self.assertIn("40002", text)

    def test_alias_conflicting_with_live_name_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            payload = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            payload.setdefault("aliases", {}).setdefault("skills", {})["fireball"] = 40002
            (root / "registry" / "row-ids.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            errors = verify_registry(root)
            self.assertTrue(any(error["code"] == "ALIAS_CONFLICT" for error in errors), errors)
            repo_errors = validate_repository(root)
            self.assertTrue(any(error["code"] == "ALIAS_CONFLICT" for error in repo_errors), repo_errors)


if __name__ == "__main__":
    unittest.main()

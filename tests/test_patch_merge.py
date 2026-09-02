import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.fingerprint import source_fingerprint
from lumio_config.patch import ApplyResult, apply_patch, merge_cell, merge_patch, validate_patch
from lumio_config.summary import summarize_ops
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


def _schema_fp(root: Path, table: str = "skills") -> str:
    return hashlib.sha256((root / "schemas" / f"{table}.json").read_bytes()).hexdigest()


def _source_fp(root: Path, table: str = "skills") -> str:
    return source_fingerprint(root / "tables" / f"{table}.txt", root / "schemas" / f"{table}.json")


def _authority_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.as_posix(): path.read_bytes()
        for path in [
            root / "tables" / "skills.txt",
            root / "registry" / "row-ids.json",
            root / "registry" / "tombstones.json",
        ]
    }


def _update_fireball_damage(root: Path, damage: int, *, base_fp: str, schema_fp: str, expect: str = "120") -> dict:
    return {
        "table": "skills",
        "base": {"sourceFingerprint": base_fp, "schemaFingerprint": schema_fp},
        "ops": [
            {
                "op": "update",
                "name": "fireball",
                "set": {"damage": damage},
                "expect": {"damage": expect, "id": "40001"},
            }
        ],
    }


class MergeCellTests(unittest.TestCase):
    def test_a_a_b_takes_draft(self):
        decision = merge_cell("120", "120", "130")
        self.assertEqual(decision.action, "take_draft")
        self.assertEqual(decision.token, "130")

    def test_a_b_b_is_noop_already_equal(self):
        decision = merge_cell("120", "130", "130")
        self.assertEqual(decision.action, "noop")

    def test_a_b_a_keeps_current(self):
        decision = merge_cell("120", "130", "120")
        self.assertEqual(decision.action, "noop")

    def test_a_b_c_conflicts_stale_baseline(self):
        decision = merge_cell("120", "130", "140")
        self.assertEqual(decision.action, "conflict")
        self.assertEqual(decision.code, "STALE_BASELINE")

    def test_deleted_current_conflicts(self):
        decision = merge_cell("120", None, "130")
        self.assertEqual(decision.action, "conflict")
        self.assertEqual(decision.code, "DELETED_ROW_CONFLICT")

    def test_four_state_tokens_are_not_collapsed(self):
        self.assertEqual(merge_cell('""', '""', "null").action, "take_draft")
        self.assertEqual(merge_cell("null", "null", "@default").action, "take_draft")
        self.assertEqual(merge_cell("0", "0", "@default").action, "take_draft")
        self.assertEqual(merge_cell('""', "null", "@default").action, "conflict")
        self.assertEqual(merge_cell('""', "null", "@default").code, "STALE_BASELINE")


class MergePatchApplyTests(unittest.TestCase):
    def test_take_draft_when_other_row_changed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            frost = apply_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "frostbolt", "set": {"damage": 91}}]},
            )
            self.assertEqual(frost, [])
            result = apply_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertIsInstance(result, ApplyResult)
            self.assertEqual(result.errors, [])
            table = load_sources(root)[1]["skills"]
            fireball = next(row for row in table.rows if row["name"].value == "fireball")
            self.assertEqual(fireball["damage"].token(), "130")
            frostbolt = next(row for row in table.rows if row["name"].value == "frostbolt")
            self.assertEqual(frostbolt["damage"].token(), "91")
            self.assertIn("fireball.damage", result.summary)
            self.assertIn("120", result.summary)
            self.assertIn("130", result.summary)

    def test_already_matching_draft_is_noop(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            first = apply_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(first.errors, [])
            before = _authority_bytes(root)
            merged = merge_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(merged.conflicts, [])
            self.assertEqual(merged.effective_ops, [])

    def test_keep_current_when_draft_matches_base(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            apply_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}]},
            )
            result = apply_patch(root, _update_fireball_damage(root, 120, base_fp=opened, schema_fp=schema_fp, expect="120"))
            self.assertEqual(result.errors, [])
            table = load_sources(root)[1]["skills"]
            fireball = next(row for row in table.rows if row["name"].value == "fireball")
            self.assertEqual(fireball["damage"].token(), "130")

    def test_stale_baseline_does_not_write_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            apply_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}]},
            )
            before = _authority_bytes(root)
            result = apply_patch(root, _update_fireball_damage(root, 140, base_fp=opened, schema_fp=schema_fp))
            self.assertTrue(result.errors)
            self.assertEqual(result.errors[0]["code"], "STALE_BASELINE")
            self.assertEqual(result.errors[0]["base"], "120")
            self.assertEqual(result.errors[0]["current"], "130")
            self.assertEqual(result.errors[0]["draft"], "140")
            self.assertEqual(str(result.errors[0]["rowId"]), "40001")
            self.assertEqual(before, _authority_bytes(root))

    def test_deleted_row_conflict_leaves_bytes_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            self.assertEqual(
                apply_patch(root, {"table": "drops", "ops": [{"op": "delete", "name": "ember_cache"}]}).errors,
                [],
            )
            self.assertEqual(
                apply_patch(root, {"table": "skills", "ops": [{"op": "delete", "name": "fireball"}]}).errors,
                [],
            )
            before = _authority_bytes(root)
            result = apply_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(result.errors[0]["code"], "DELETED_ROW_CONFLICT")
            self.assertEqual(str(result.errors[0]["rowId"]), "40001")
            self.assertIn("current", result.errors[0])
            self.assertEqual(before, _authority_bytes(root))

    def test_rename_is_relocated_by_permanent_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            table_path = root / "tables" / "skills.txt"
            table_path.write_text(
                table_path.read_text(encoding="utf-8").replace("frostbolt", "frost_bolt"),
                encoding="utf-8",
                newline="\n",
            )
            registry_path = root / "registry" / "row-ids.json"
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
            registry["skills"]["frost_bolt"] = registry["skills"].pop("frostbolt")
            registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
            result = apply_patch(
                root,
                {
                    "table": "skills",
                    "base": {"sourceFingerprint": opened, "schemaFingerprint": schema_fp},
                    "ops": [
                        {
                            "op": "update",
                            "name": "frostbolt",
                            "set": {"damage": 95},
                            "expect": {"damage": "90", "id": "40002"},
                        }
                    ],
                },
            )
            self.assertEqual(result.errors, [], result.errors)
            table = load_sources(root)[1]["skills"]
            row = next(item for item in table.rows if item["id"].value == "40002")
            self.assertEqual(row["name"].value, "frost_bolt")
            self.assertEqual(row["damage"].token(), "95")

    def test_schema_changed_blocks_apply(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            schema_path = root / "schemas" / "skills.json"
            schema_path.write_text(
                schema_path.read_text(encoding="utf-8").replace('"table": "skills"', '"table":  "skills"'),
                encoding="utf-8",
                newline="\n",
            )
            before = _authority_bytes(root)
            result = apply_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(result.errors[0]["code"], "SCHEMA_CHANGED")
            self.assertEqual(before, _authority_bytes(root))

    def test_no_base_patch_still_applies_like_before(self):
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
                            "name": "ice_lance",
                            "set": {
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
            self.assertEqual(errors, [])
            self.assertIsInstance(errors, ApplyResult)
            self.assertIn(40003, errors.assigned_ids.values())
            text = (root / "tables" / "skills.txt").read_text(encoding="utf-8")
            self.assertIn("ice_lance", text)

    def test_replay_reports_already_applied_and_files_stay_byte_identical(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            first = apply_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(first.errors, [])
            before = _authority_bytes(root)
            second = apply_patch(root, _update_fireball_damage(root, 130, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(second.errors[0]["code"], "ALREADY_APPLIED")
            self.assertEqual(before, _authority_bytes(root))

    def test_summarize_ops_follows_card_format(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            _, tables, _ = load_sources(root)
            schema = json.loads((root / "schemas" / "skills.json").read_text(encoding="utf-8"))
            summary = summarize_ops(
                schema,
                tables["skills"].rows,
                [
                    {"op": "update", "name": "fireball", "set": {"damage": 130}},
                    {
                        "op": "create",
                        "name": "ice_lance",
                        "set": {"display_name": "Ice Lance", "damage": 40},
                    },
                    {"op": "rename", "name": "frostbolt", "to": "frost_bolt"},
                    {"op": "delete", "name": "unused_skill"},
                ],
            )
            self.assertTrue(summary.startswith("skills: "))
            self.assertIn("fireball.damage 120 → 130", summary)
            self.assertIn("新增 ice_lance", summary)
            self.assertIn("frostbolt 改名 frost_bolt", summary)
            self.assertIn("删除 unused_skill", summary)
            self.assertIn("；", summary)

    def test_cli_apply_json_and_audit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            patch_path = root / "patch.json"
            audit_path = root / "audit.jsonl"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}],
                    }
                ),
                encoding="utf-8",
            )
            result = _run_cli(
                "patch",
                "apply",
                str(patch_path),
                "--audit",
                str(audit_path),
                "--reason",
                "tune damage",
                root=root,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["ok"])
            self.assertIn("summary", payload)
            self.assertEqual(payload["errors"], [])
            self.assertTrue(payload["sourceFingerprint"])
            self.assertTrue(payload["beforeSourceFingerprint"])
            self.assertIn("reason", payload)
            self.assertEqual(payload["reason"], "tune damage")
            audit = json.loads(audit_path.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(audit["table"], "skills")
            self.assertEqual(audit["summary"], payload["summary"])

    def test_validate_patch_returns_stale_conflicts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            opened = _source_fp(root)
            schema_fp = _schema_fp(root)
            apply_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}]},
            )
            errors = validate_patch(root, _update_fireball_damage(root, 140, base_fp=opened, schema_fp=schema_fp))
            self.assertEqual(errors[0]["code"], "STALE_BASELINE")


if __name__ == "__main__":
    unittest.main()

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"
CONTRACT = "lumio-config-tools/v1"
BANNED_ACTIONS = ("activate", "sign", "publish")


def _copy_authority(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _run_cli(*args: str, root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), *args, "--root", str(root)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _source_snapshot(root: Path) -> dict[str, str]:
    snapshot: dict[str, str] = {}
    for folder in ("tables", "registry", "schemas"):
        for path in (root / folder).rglob("*"):
            if path.is_file() and path.name != ".issue.lock":
                snapshot[path.relative_to(root).as_posix()] = _sha(path)
    return snapshot


class HelpAndPermissionTests(unittest.TestCase):
    def test_help_lists_five_actions_and_timeout_but_not_activate(self):
        result = subprocess.run(
            [sys.executable, str(CLI), "--help"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        help_text = result.stdout.lower()
        self.assertIn("query", help_text)
        self.assertIn("preview", help_text)
        self.assertIn("patch", help_text)
        for banned in BANNED_ACTIONS:
            self.assertIsNone(re.search(rf"\b{banned}\b", help_text), banned)
        query_help = subprocess.run(
            [sys.executable, str(CLI), "query", "--help"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        preview_help = subprocess.run(
            [sys.executable, str(CLI), "preview", "--help"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(query_help.returncode, 0, query_help.stdout + query_help.stderr)
        self.assertEqual(preview_help.returncode, 0, preview_help.stdout + preview_help.stderr)
        self.assertIn("--timeout", query_help.stdout)
        self.assertIn("--timeout", preview_help.stdout)
        combined = (query_help.stdout + preview_help.stdout).lower()
        for banned in BANNED_ACTIONS:
            self.assertIsNone(re.search(rf"\b{banned}\b", combined), banned)


class QueryTests(unittest.TestCase):
    def test_query_table_row_schema_and_card_emit_contract_json(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            table = json.loads(_run_cli("query", "table", "skills", root=root).stdout)
            self.assertEqual(table["contract"], CONTRACT)
            names = {row["name"] for row in table["rows"]}
            self.assertEqual(names, {"fireball", "frostbolt"})

            by_name = json.loads(_run_cli("query", "row", "skills", "fireball", root=root).stdout)
            by_id = json.loads(_run_cli("query", "row", "skills", "40001", root=root).stdout)
            self.assertEqual(by_name["contract"], CONTRACT)
            self.assertEqual(by_name["row"]["name"], "fireball")
            self.assertEqual(by_name["row"]["id"], 40001)
            self.assertEqual(by_name["row"], by_id["row"])

            schema = json.loads(_run_cli("query", "schema", "skills", root=root).stdout)
            self.assertEqual(schema["contract"], CONTRACT)
            columns = {column["name"] for column in schema["schema"]["columns"]}
            self.assertIn("damage", columns)

            card = json.loads(_run_cli("query", "card", "skills", "fireball", root=root).stdout)
            self.assertEqual(card["contract"], CONTRACT)
            related = {(item["table"], item["name"]) for item in card["related"]}
            self.assertIn(("effects", "burn"), related)
            self.assertIn(("drops", "ember_cache"), related)

    def test_query_does_not_write_authority(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            before = _source_snapshot(root)
            _run_cli("query", "table", "skills", root=root)
            _run_cli("query", "card", "skills", "fireball", root=root)
            self.assertEqual(_source_snapshot(root), before)


class PreviewTests(unittest.TestCase):
    def test_preview_reports_fingerprint_and_target_diff_without_writing_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            before = _source_snapshot(root)
            patch_path = root / "candidate.json"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}],
                    }
                ),
                encoding="utf-8",
            )
            result = _run_cli("preview", str(patch_path), root=root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["contract"], CONTRACT)
            self.assertTrue(payload["ok"], result.stdout)
            self.assertNotEqual(
                payload["fingerprints"]["before"]["contentFingerprint"],
                payload["fingerprints"]["after"]["contentFingerprint"],
            )
            self.assertTrue(payload["targets"]["S"]["changed"])
            self.assertEqual(_source_snapshot(root), before)

    def test_preview_invalid_patch_is_side_effect_free(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            before = _source_snapshot(root)
            patch_path = root / "bad.json"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": "nope"}}],
                    }
                ),
                encoding="utf-8",
            )
            result = _run_cli("preview", str(patch_path), root=root)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["contract"], CONTRACT)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["errors"][0]["code"], "TYPE_MISMATCH")
            self.assertEqual(_source_snapshot(root), before)


class SelfHealAndSubmitTests(unittest.TestCase):
    def test_unattended_type_error_is_fixed_from_structured_suggestion(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            patch_path = root / "proposal.json"
            audit_path = root / "audit.jsonl"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": "not-a-number"}}],
                    }
                ),
                encoding="utf-8",
            )
            failed = _run_cli("patch", "validate", str(patch_path), root=root)
            self.assertNotEqual(failed.returncode, 0)
            error = json.loads(failed.stdout)[0]
            self.assertEqual(error["code"], "TYPE_MISMATCH")
            self.assertEqual(error["column"], "damage")
            self.assertTrue(error["suggestion"])

            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}],
                    }
                ),
                encoding="utf-8",
            )
            precheck = _run_cli("patch", "validate", str(patch_path), root=root)
            self.assertEqual(precheck.returncode, 0, precheck.stdout + precheck.stderr)
            self.assertIn("patch-validate: OK", precheck.stdout)

            preview = _run_cli("preview", str(patch_path), root=root)
            self.assertEqual(preview.returncode, 0, preview.stdout + preview.stderr)
            preview_body = json.loads(preview.stdout)
            self.assertEqual(preview_body["contract"], CONTRACT)
            self.assertTrue(preview_body["ok"])

            apply = _run_cli(
                "patch",
                "apply",
                str(patch_path),
                "--audit",
                str(audit_path),
                "--reason",
                "fix type error from machine gate",
                "--actor",
                "ai",
                root=root,
            )
            self.assertEqual(apply.returncode, 0, apply.stdout + apply.stderr)
            applied = json.loads(apply.stdout)
            self.assertEqual(applied["contract"], CONTRACT)
            self.assertTrue(applied["ok"])
            self.assertEqual(applied["reason"], "fix type error from machine gate")
            self.assertEqual(applied["actor"], "ai")
            self.assertTrue(applied["beforeSourceFingerprint"])
            self.assertTrue(applied["sourceFingerprint"])
            self.assertNotEqual(applied["beforeSourceFingerprint"], applied["sourceFingerprint"])
            text = (root / "tables" / "skills.txt").read_text(encoding="utf-8")
            self.assertIn("130", text)
            audit = json.loads(audit_path.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(audit["actor"], "ai")
            self.assertEqual(audit["reason"], "fix type error from machine gate")
            self.assertEqual(audit["beforeSourceFingerprint"], applied["beforeSourceFingerprint"])
            self.assertEqual(audit["sourceFingerprint"], applied["sourceFingerprint"])

    def test_failed_submit_does_not_leave_partial_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_authority(root)
            before = _source_snapshot(root)
            patch_path = root / "bad.json"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": "nope"}}],
                    }
                ),
                encoding="utf-8",
            )
            result = _run_cli("patch", "apply", str(patch_path), root=root)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(_source_snapshot(root), before)


if __name__ == "__main__":
    unittest.main()

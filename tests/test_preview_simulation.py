import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.patch import validate_patch
from lumio_config.preview import preview_patch
from lumio_config.simulate import run as simulate_run
from lumio_config.summary import summarize_ops, summarize_patch
from lumio_config.validate import load_sources


ROOT = Path(__file__).resolve().parents[1]


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _source_snapshot(root: Path) -> dict[str, str]:
    snapshot: dict[str, str] = {}
    for folder in ("tables", "registry", "schemas", "generated"):
        base = root / folder
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.name != ".issue.lock":
                snapshot[path.relative_to(root).as_posix()] = _sha(path)
    return snapshot


def _damage_patch(value: object = 130) -> dict:
    return {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"damage": value}}]}


class SummaryTests(unittest.TestCase):
    def test_structured_summary_reuses_summarize_ops_and_keeps_id_unit_origin(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            schema = json.loads((root / "schemas" / "skills.json").read_text(encoding="utf-8"))
            _, tables, _ = load_sources(root)
            patch = _damage_patch(130)
            payload = summarize_patch(root, patch)
            self.assertEqual(payload["text"], summarize_ops(schema, tables["skills"].rows, patch["ops"]))
            self.assertIn("fireball.damage 120 → 130", payload["text"])
            change = next(item for item in payload["changes"] if item["column"] == "damage")
            self.assertEqual(change["table"], "skills")
            self.assertEqual(change["name"], "fireball")
            self.assertEqual(change["id"], 40001)
            self.assertEqual(change["before"], "120")
            self.assertEqual(change["after"], "130")
            self.assertEqual(change["origin"], "engine")
            self.assertIsNone(change.get("unit") or None)

    def test_four_state_tokens_are_not_collapsed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            empty = summarize_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"display_name": ""}}]},
            )
            missing_null = summarize_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"display_name": None}}]},
            )
            defaulted = summarize_patch(
                root,
                {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"display_name": "@default"}}]},
            )
            tokens = {
                next(item["after"] for item in empty["changes"] if item["column"] == "display_name"),
                next(item["after"] for item in missing_null["changes"] if item["column"] == "display_name"),
                next(item["after"] for item in defaulted["changes"] if item["column"] == "display_name"),
            }
            self.assertEqual(tokens, {'""', "null", "@default"})
            self.assertIn('fireball.display_name Fireball → ""', empty["text"])
            self.assertIn("fireball.display_name Fireball → null", missing_null["text"])

    def test_overlay_origin_is_the_winning_layer(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            overlay = root / "layers" / "product" / "skills.txt"
            overlay.parent.mkdir(parents=True, exist_ok=True)
            overlay.write_text(
                "table: skills\nschema: schemas/skills.json\n"
                "| name | damage |\n| --- | --- |\n| fireball | 300 |\n",
                encoding="utf-8",
                newline="\n",
            )
            payload = summarize_patch(root, _damage_patch(310))
            change = next(item for item in payload["changes"] if item["column"] == "damage")
            self.assertEqual(change["origin"], "product")
            self.assertEqual(change["before"], "300")
            self.assertEqual(change["after"], "310")


class SimulateTests(unittest.TestCase):
    def test_default_simulator_is_unavailable_and_does_not_block_validate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            result = simulate_run(root)
            self.assertEqual(result["status"], "unavailable")
            self.assertIn("evidence", result)
            self.assertNotEqual(result["status"], "ok")
            self.assertEqual(validate_patch(root, _damage_patch(130)), [])


class PreviewReportTests(unittest.TestCase):
    def test_preview_is_deterministic_and_includes_diffs_hashes_disclosure_and_simulation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            before = _source_snapshot(root)
            first = preview_patch(root, _damage_patch(130))
            second = preview_patch(root, _damage_patch(130))
            self.assertEqual(first, second)
            self.assertTrue(first["ok"])
            self.assertEqual(_source_snapshot(root), before)
            self.assertTrue(first["targets"]["S"]["changed"])
            modified = first["targets"]["S"]["modified"]
            self.assertTrue(any(item["column"] == "damage" and item["name"] == "fireball" for item in modified), modified)
            self.assertIn("contentFingerprint", first["fingerprints"]["before"])
            self.assertIn("packageFingerprint", first["fingerprints"]["before"])
            self.assertIn("sourceFingerprint", first["fingerprints"]["before"])
            self.assertNotEqual(first["fingerprints"]["before"]["contentFingerprint"], first["fingerprints"]["after"]["contentFingerprint"])
            self.assertEqual(first["firstDisclosure"], [])
            self.assertTrue(first["validation"]["ok"])
            self.assertEqual(first["simulation"]["status"], "unavailable")
            report = first["report"]
            self.assertEqual(report["summary"]["text"], first["summary"]["text"])
            self.assertIn("compilerHash", report["candidate"])
            self.assertIn("inputHash", report["candidate"])
            self.assertIn("outputHash", report["candidate"])
            self.assertEqual(report["simulation"]["status"], "unavailable")
            self.assertIn("risks", report)
            self.assertIn("fireball.damage 120 → 130", first["summary"]["text"])

    def test_failed_preview_does_not_write_authority_or_generated(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            (root / "generated").mkdir()
            (root / "generated" / "marker.txt").write_text("keep\n", encoding="utf-8")
            before = _source_snapshot(root)
            payload = preview_patch(root, _damage_patch("nope"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["errors"][0]["code"], "TYPE_MISMATCH")
            self.assertEqual(_source_snapshot(root), before)
            self.assertEqual((root / "generated" / "marker.txt").read_text(encoding="utf-8"), "keep\n")


if __name__ == "__main__":
    unittest.main()

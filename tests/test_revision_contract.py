import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.export import export_repository
from lumio_config.revision import load_revision_fixture, validate_revision_manifest


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "testdata" / "revision"


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


class LiveManifestIdentityTests(unittest.TestCase):
    def test_export_freezes_revision_id_and_roots(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _copy_repo(root)
            result = export_repository(root, output)
            release = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(release["revisionId"], release["contentFingerprint"])
            self.assertEqual(result["revisionId"], result["contentFingerprint"])
            self.assertEqual(release["publicRoot"], release["packageFingerprint"])
            self.assertEqual(set(release["projectionRoots"]), {"S", "C", "V"})
            for target, path in release["projectionRoots"].items():
                self.assertEqual(path, release["targetManifests"][target])
                self.assertNotEqual(path, release["publicRoot"])
            errors = validate_revision_manifest(release, required_tables=["skills", "effects", "drops"])
            self.assertEqual(errors, [])


class NegativeFixtureTests(unittest.TestCase):
    def test_fingerprint_mismatch_fixture(self):
        manifest, expected = load_revision_fixture(FIXTURES / "fingerprint-mismatch")
        errors = validate_revision_manifest(manifest, required_tables=expected.get("requiredTables"))
        self.assertTrue(any(item["code"] == "REVISION_FINGERPRINT_MISMATCH" for item in errors), errors)
        self.assertEqual(expected["code"], "REVISION_FINGERPRINT_MISMATCH")

    def test_required_table_missing_fixture(self):
        manifest, expected = load_revision_fixture(FIXTURES / "required-table-missing")
        errors = validate_revision_manifest(manifest, required_tables=expected.get("requiredTables"))
        self.assertTrue(any(item["code"] == "REQUIRED_TABLE_MISSING" for item in errors), errors)
        self.assertEqual(expected["code"], "REQUIRED_TABLE_MISSING")

    def test_projection_public_root_mixed_fixture(self):
        manifest, expected = load_revision_fixture(FIXTURES / "projection-public-root-mixed")
        errors = validate_revision_manifest(manifest, required_tables=expected.get("requiredTables"))
        self.assertTrue(any(item["code"] == "PROJECTION_PUBLIC_ROOT_MIXED" for item in errors), errors)
        self.assertEqual(expected["code"], "PROJECTION_PUBLIC_ROOT_MIXED")

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from lumio_config import export

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "tools" / "build-config-compiler.py"


class FrozenCompilerIdentityTests(unittest.TestCase):
    def test_frozen_compiler_uses_actual_source_digest_without_py_files(self):
        expected = export._compiler_hash()
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)
            (package / "compiler-hash.txt").write_text(expected + "\n", encoding="ascii")
            with patch.object(sys, "frozen", True, create=True), patch.object(export, "__file__", str(package / "export.pyc")):
                self.assertEqual(expected, export._compiler_hash())

    def test_frozen_compiler_fails_closed_when_identity_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(sys, "frozen", True, create=True), patch.object(export, "__file__", str(Path(directory) / "export.pyc")):
                with self.assertRaisesRegex(RuntimeError, "compiler identity"):
                    export._compiler_hash()

    def test_frozen_compiler_rejects_malformed_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)
            for invalid in ("", "f" * 63, "G" * 64, "a" * 64 + "\nextra"):
                (package / "compiler-hash.txt").write_text(invalid, encoding="ascii")
                with self.subTest(value=invalid), patch.object(sys, "frozen", True, create=True), patch.object(export, "__file__", str(package / "export.pyc")):
                    with self.assertRaisesRegex(RuntimeError, "compiler identity"):
                        export._compiler_hash()

    def test_source_compiler_does_not_trust_frozen_identity_data(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)
            (package / "export.py").write_text("# actual source\n", encoding="utf-8")
            with patch.object(sys, "frozen", False, create=True), patch.object(export, "__file__", str(package / "export.py")):
                expected = export._compiler_hash()
                (package / "compiler-hash.txt").write_text("a" * 64, encoding="ascii")
                self.assertEqual(expected, export._compiler_hash())


class AuthoringBuilderTests(unittest.TestCase):
    def setUp(self):
        specification = importlib.util.spec_from_file_location("authoring_builder", BUILDER)
        self.builder = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(self.builder)

    def test_official_build_entrypoint_is_available(self):
        result = subprocess.run([sys.executable, str(BUILDER), "--help"], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)
        for option in ("--rid", "--source-commit", "--install", "--out"):
            self.assertIn(option, result.stdout)

    def test_wrong_python_is_rejected_before_outputs(self):
        with patch.object(self.builder.platform, "python_version", return_value="3.12.10"):
            with self.assertRaisesRegex(ValueError, "3.11.9"):
                self.builder.verify_host("win-x64")

    def test_cross_rid_and_non_x64_are_rejected(self):
        with patch.object(self.builder.platform, "python_version", return_value="3.11.9"):
            with patch.object(self.builder.sys, "platform", "win32"), patch.object(self.builder.platform, "machine", return_value="AMD64"):
                self.builder.verify_host("win-x64")
                with self.assertRaisesRegex(ValueError, "native x64"):
                    self.builder.verify_host("linux-x64")
            with patch.object(self.builder.platform, "machine", return_value="arm64"):
                with self.assertRaisesRegex(ValueError, "native x64"):
                    self.builder.verify_host("win-x64")

    def test_source_identity_rejects_mismatch_and_dirty_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], check=True)
            commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
            with patch.object(self.builder, "ROOT", root):
                self.builder.verify_source(commit)
                with self.assertRaisesRegex(ValueError, "checkout HEAD"):
                    self.builder.verify_source("0" * 40)
                (root / "untracked.txt").write_text("changed", encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "clean"):
                    self.builder.verify_source(commit)


if __name__ == "__main__":
    unittest.main()

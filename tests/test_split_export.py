import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.export import ValidationFailure, export_repository, export_repository_split
from lumio_config.split import SPLIT_SPEC_VERSION, verify_split


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _write_shared_repo(root: Path, *, step: str = "1.25", visibility: str = "SC") -> None:
    (root / "schemas").mkdir(parents=True)
    (root / "tables").mkdir(parents=True)
    (root / "registry").mkdir(parents=True)
    (root / "schemas" / "movement.json").write_text(
        json.dumps(
            {
                "table": "movement",
                "idColumn": "id",
                "columns": [
                    {"name": "id", "ordinal": 0, "type": "u32", "required": True, "visibility": "SCV"},
                    {"name": "name", "ordinal": 1, "type": "string", "required": True, "visibility": "SCV"},
                    {
                        "name": "step_meters",
                        "ordinal": 2,
                        "type": "f64",
                        "required": True,
                        "visibility": visibility,
                        "sharedPrediction": True,
                    },
                    {"name": "server_budget", "ordinal": 3, "type": "i32", "required": True, "visibility": "S"},
                    {"name": "skin_scale", "ordinal": 4, "type": "f32", "required": True, "visibility": "C"},
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (root / "tables" / "movement.txt").write_text(
        "table: movement\nschema: schemas/movement.json\n"
        "| id | name | step_meters | server_budget | skin_scale |\n"
        "| --- | --- | --- | --- | --- |\n"
        f"| 1 | default | {step} | 7 | 1.0 |\n",
        encoding="utf-8",
        newline="\n",
    )
    (root / "registry" / "row-ids.json").write_text(
        json.dumps({"movement": {"default": 1}, "aliases": {"movement": {}}}, indent=2) + "\n",
        encoding="utf-8",
    )
    (root / "registry" / "tombstones.json").write_text("{}\n", encoding="utf-8")
    (root / "repository.yaml").write_text(
        "architecture:\n  baselineId: LGE-V1.4-2026-08-27\nsimulation:\n  tickRate: 60\n",
        encoding="utf-8",
        newline="\n",
    )


def _tree(base: Path) -> dict[str, bytes]:
    return {path.relative_to(base).as_posix(): path.read_bytes() for path in base.rglob("*") if path.is_file()}


def _run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )


class SplitLayoutTests(unittest.TestCase):
    def test_client_root_holds_only_the_c_projection(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _copy_repo(root)
            export_repository_split(root, client, server)

            client_files = sorted(_tree(client))
            self.assertTrue(client_files)
            for name in client_files:
                self.assertFalse(name.startswith("server/"), client_files)
                self.assertFalse(name.startswith("voxel/"), client_files)
            self.assertNotIn("origins.json", client_files)
            self.assertTrue((client / "client" / "manifest.json").exists())

            server_files = sorted(_tree(server))
            self.assertTrue(any(name.startswith("server/") for name in server_files), server_files)
            self.assertTrue(any(name.startswith("voxel/") for name in server_files), server_files)
            self.assertFalse(any(name.startswith("client/") for name in server_files), server_files)
            self.assertIn("origins.json", server_files)

    def test_projection_payloads_match_the_single_root_mode_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as temp:
            root, single, client, server = (
                Path(temp) / name for name in ("repo", "single", "client", "server")
            )
            _copy_repo(root)
            export_repository(root, single)
            export_repository_split(root, client, server)
            single_tree = _tree(single)
            for relative, data in _tree(client).items():
                if relative == "manifest.json":
                    continue
                self.assertEqual(data, single_tree[relative], relative)
            for relative, data in _tree(server).items():
                if relative == "manifest.json":
                    continue
                self.assertEqual(data, single_tree[relative], relative)


class SplitDeterminismTests(unittest.TestCase):
    def test_two_split_exports_into_different_directories_are_byte_identical(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            _copy_repo(root)
            first = [Path(temp) / "a-client", Path(temp) / "a-server"]
            second = [Path(temp) / "b-client", Path(temp) / "b-server"]
            one = export_repository_split(root, *first)
            two = export_repository_split(root, *second)
            self.assertEqual(_tree(first[0]), _tree(second[0]))
            self.assertEqual(_tree(first[1]), _tree(second[1]))
            self.assertEqual(one, two)


class EndManifestTests(unittest.TestCase):
    def test_identity_fingerprints_match_while_scoped_ones_differ(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _copy_repo(root)
            result = export_repository_split(root, client, server)
            client_manifest = json.loads((client / "manifest.json").read_text(encoding="utf-8"))
            server_manifest = json.loads((server / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(result["client"], client_manifest)
            self.assertEqual(result["server"], server_manifest)

            self.assertEqual(client_manifest["specVersion"], SPLIT_SPEC_VERSION)
            self.assertEqual(client_manifest["endpoint"], "client")
            self.assertEqual(server_manifest["endpoint"], "server")
            self.assertEqual(client_manifest["targets"], ["C"])
            self.assertEqual(server_manifest["targets"], ["S", "V"])
            self.assertEqual(set(client_manifest["projectionRoots"]), {"C"})
            self.assertEqual(set(server_manifest["projectionRoots"]), {"S", "V"})
            self.assertNotIn("origins", client_manifest)
            self.assertEqual(server_manifest["origins"], "origins.json")

            for key in ("compilerHash", "inputHash", "contentFingerprint", "sourceFingerprint", "releaseFingerprint", "revisionId", "baselineId"):
                self.assertEqual(client_manifest[key], server_manifest[key], key)
            for key in ("packageFingerprint", "outputHash"):
                self.assertNotEqual(client_manifest[key], server_manifest[key], key)
            self.assertEqual(client_manifest["revisionId"], client_manifest["contentFingerprint"])
            self.assertEqual(client_manifest["publicRoot"], client_manifest["packageFingerprint"])

            single_manifest = None
            with tempfile.TemporaryDirectory() as other:
                single_manifest = export_repository(root, Path(other))
            self.assertEqual(client_manifest["contentFingerprint"], single_manifest["contentFingerprint"])

    def test_output_hash_covers_only_its_own_end(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _copy_repo(root)
            export_repository_split(root, client, server)
            before = json.loads((client / "manifest.json").read_text(encoding="utf-8"))["outputHash"]
            (server / "server" / "skills.json").write_bytes(b"{}\n")
            export_repository_split(root, client, Path(temp) / "server2")
            after = json.loads((client / "manifest.json").read_text(encoding="utf-8"))["outputHash"]
            self.assertEqual(before, after)

    def test_end_manifest_lists_only_tables_present_in_that_end(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            (root / "schemas" / "server_only.json").write_text(
                json.dumps(
                    {
                        "table": "server_only",
                        "idColumn": "id",
                        "columns": [
                            {"name": "id", "ordinal": 0, "type": "u32", "required": True, "visibility": "S"},
                            {"name": "name", "ordinal": 1, "type": "string", "required": True, "visibility": "S"},
                        ],
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "tables" / "server_only.txt").write_text(
                "table: server_only\nschema: schemas/server_only.json\n"
                "| id | name |\n| --- | --- |\n| 1 | secret |\n",
                encoding="utf-8",
                newline="\n",
            )
            registry = json.loads((root / "registry" / "row-ids.json").read_text(encoding="utf-8"))
            registry["server_only"] = {"secret": 1}
            registry["aliases"]["server_only"] = {}
            (root / "registry" / "row-ids.json").write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")

            export_repository_split(root, client, server)
            client_manifest = json.loads((client / "manifest.json").read_text(encoding="utf-8"))
            server_manifest = json.loads((server / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual({entry["table"] for entry in client_manifest["tables"]}, {"movement"})
            self.assertEqual({entry["table"] for entry in server_manifest["tables"]}, {"movement", "server_only"})
            self.assertFalse((client / "client" / "server_only.json").exists())
            self.assertNotIn("secret", (client / "client" / "movement.json").read_text(encoding="utf-8"))


class SharedPredictionTests(unittest.TestCase):
    def test_declared_columns_produce_an_equal_fingerprint_on_both_ends(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            client_block = json.loads((client / "manifest.json").read_text(encoding="utf-8"))["sharedPrediction"]
            server_block = json.loads((server / "manifest.json").read_text(encoding="utf-8"))["sharedPrediction"]
            self.assertEqual(client_block["columns"], ["movement.step_meters"])
            self.assertEqual(client_block, server_block)
            self.assertEqual(len(client_block["fingerprint"]), 64)

    def test_undeclared_repository_gets_an_empty_but_defined_block(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _copy_repo(root)
            export_repository_split(root, client, server)
            block = json.loads((client / "manifest.json").read_text(encoding="utf-8"))["sharedPrediction"]
            self.assertEqual(block["columns"], [])
            self.assertEqual(len(block["fingerprint"]), 64)

    def test_declared_column_must_be_visible_to_both_ends(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root, visibility="S")
            with self.assertRaises(ValidationFailure) as ctx:
                export_repository_split(root, client, server)
            self.assertTrue(
                any(error["code"] == "SHARED_PREDICTION_NOT_SHARED" for error in ctx.exception.errors),
                ctx.exception.errors,
            )


class VerifySplitTests(unittest.TestCase):
    def test_equal_shared_prediction_is_compatible_even_across_revisions(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            report = verify_split(client, server)
            self.assertTrue(report["ok"], report)
            self.assertEqual(report["errors"], [])

            # A client-only value changes: revisions differ, shared prediction still matches.
            (root / "tables" / "movement.txt").write_text(
                (root / "tables" / "movement.txt").read_text(encoding="utf-8").replace("| 1.0 |", "| 2.0 |"),
                encoding="utf-8",
                newline="\n",
            )
            export_repository_split(root, client, Path(temp) / "server-next")
            drifted = verify_split(client, server)
            self.assertTrue(drifted["ok"], drifted)
            self.assertIn("SPLIT_REVISION_DIFFERS", [note["code"] for note in drifted["notes"]])

    def test_shared_value_drift_is_incompatible(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            _write_shared_repo(Path(temp) / "repo2", step="9.5")
            export_repository_split(Path(temp) / "repo2", Path(temp) / "client2", server)
            report = verify_split(client, server)
            self.assertFalse(report["ok"], report)
            self.assertEqual([error["code"] for error in report["errors"]], ["SHARED_PREDICTION_VALUE_MISMATCH"])

    def test_two_client_ends_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            report = verify_split(client, client)
            self.assertFalse(report["ok"], report)
            self.assertEqual([error["code"] for error in report["errors"]], ["SPLIT_ENDPOINT_INVALID"])


class SplitCliTests(unittest.TestCase):
    def test_cli_split_export_and_verify(self):
        with tempfile.TemporaryDirectory() as temp:
            client, server = Path(temp) / "client", Path(temp) / "server"
            export_cmd = _run_cli("export", "--client-out", str(client), "--server-out", str(server))
            self.assertEqual(export_cmd.returncode, 0, export_cmd.stderr + export_cmd.stdout)
            self.assertFalse((client / "server").exists())
            verify_cmd = _run_cli("verify-split", "--client-out", str(client), "--server-out", str(server))
            self.assertEqual(verify_cmd.returncode, 0, verify_cmd.stderr + verify_cmd.stdout)

    def test_cli_rejects_mixing_single_root_and_split(self):
        with tempfile.TemporaryDirectory() as temp:
            result = _run_cli(
                "export",
                "--out",
                str(Path(temp) / "out"),
                "--client-out",
                str(Path(temp) / "client"),
                "--server-out",
                str(Path(temp) / "server"),
            )
            self.assertEqual(result.returncode, 2, result.stdout)

    def test_cli_rejects_a_single_end(self):
        with tempfile.TemporaryDirectory() as temp:
            result = _run_cli("export", "--client-out", str(Path(temp) / "client"))
            self.assertEqual(result.returncode, 2, result.stdout)
            self.assertIn("SPLIT_OUT_INCOMPLETE", result.stdout + result.stderr)

    def test_cli_rejects_overlapping_ends(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp) / "shared"
            result = _run_cli("export", "--client-out", str(base), "--server-out", str(base / "inner"))
            self.assertEqual(result.returncode, 2, result.stdout)
            self.assertIn("SPLIT_OUT_OVERLAP", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.export import ValidationFailure, export_repository, export_repository_split
from lumio_config.split import SPLIT_SPEC_VERSION, shared_prediction_block, verify_split


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"

# The columns this repository's own source declares as shared GAS prediction inputs.
# Keep in sync with schemas/*.json; the rationale per column is in
# docs/reference/sample-config-handoff.md.
REPO_SHARED_PREDICTION_COLUMNS = [
    "mining.stamina_cost",
    "movement.step_meters",
    "movement.sweep_radius_meters",
]
# sha256 of the canonical payload when nothing is declared: {"columns": [], "values": {}}.
# It is a constant, which is exactly why an empty declaration set is not an assertion.
EMPTY_SHARED_PREDICTION_FINGERPRINT = "697d43dfa016bcd44630c7a35d8460f0bfb45c701afa0b106251d28d891a53eb"


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


def _replace_once(path: Path, old: str, new: str) -> None:
    """Hand-edit one generated file the way a person would, and prove the edit landed."""
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise AssertionError(f"{path}: expected exactly one {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")


def _rewrite_record(end: Path, block: dict) -> None:
    manifest_path = end / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sharedPrediction"] = block
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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

    def test_repository_source_declares_a_non_empty_shared_prediction_set(self):
        """The repository's own source must keep declaring columns.

        An empty ``columns`` array makes ``verify-split`` compare a constant against
        itself, so the check passes no matter what the two ends contain. This test is
        the guard against silently falling back to that state (R-00693).
        """
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _copy_repo(root)
            export_repository_split(root, client, server)
            block = json.loads((client / "manifest.json").read_text(encoding="utf-8"))["sharedPrediction"]
            self.assertEqual(block["columns"], REPO_SHARED_PREDICTION_COLUMNS)
            self.assertNotEqual(block["fingerprint"], EMPTY_SHARED_PREDICTION_FINGERPRINT)
            self.assertEqual(len(block["fingerprint"]), 64)
            server_block = json.loads((server / "manifest.json").read_text(encoding="utf-8"))["sharedPrediction"]
            self.assertEqual(block, server_block)

    def test_repository_source_shared_column_drift_is_caught(self):
        """Machine form of the R-00693 mutation proof, on the real source.

        Give one end a source whose declared shared column holds a different value and
        ``verify-split`` must refuse; put the value back and it must accept.
        """
        with tempfile.TemporaryDirectory() as temp:
            root, drifted = Path(temp) / "repo", Path(temp) / "repo-drifted"
            client, server = Path(temp) / "client", Path(temp) / "server"
            _copy_repo(root)
            export_repository_split(root, client, server)

            _copy_repo(drifted)
            source = (drifted / "tables" / "movement.txt").read_text(encoding="utf-8")
            self.assertIn("1.25", source)
            (drifted / "tables" / "movement.txt").write_text(
                source.replace("1.25", "1.30"), encoding="utf-8", newline="\n"
            )
            export_repository_split(drifted, Path(temp) / "client-drifted", server)
            report = verify_split(client, server)
            self.assertFalse(report["ok"], report)
            self.assertEqual([error["code"] for error in report["errors"]], ["SHARED_PREDICTION_VALUE_MISMATCH"])

            export_repository_split(root, Path(temp) / "client-restored", server)
            self.assertTrue(verify_split(client, server)["ok"])

    def test_repository_source_row_edit_is_caught_by_the_cli(self):
        """Machine form of the R-00745 repro, on the real source and through the CLI.

        Change one declared value in ``client/movement.json`` and leave both manifests
        alone: the two recorded fingerprints still agree, so only re-deriving from the
        rows can notice. Before the edit the same command must pass.
        """
        with tempfile.TemporaryDirectory() as temp:
            client, server = Path(temp) / "client", Path(temp) / "server"
            export_cmd = _run_cli("export", "--client-out", str(client), "--server-out", str(server))
            self.assertEqual(export_cmd.returncode, 0, export_cmd.stderr + export_cmd.stdout)
            args = ("verify-split", "--client-out", str(client), "--server-out", str(server))
            before = _run_cli(*args)
            self.assertEqual(before.returncode, 0, before.stderr + before.stdout)
            self.assertIn("verify-split: OK", before.stdout)

            manifests = [(end / "manifest.json").read_bytes() for end in (client, server)]
            _replace_once(client / "client" / "movement.json", '"step_meters": 1.25', '"step_meters": 9.99')
            self.assertEqual(manifests, [(end / "manifest.json").read_bytes() for end in (client, server)])

            after = _run_cli(*args)
            self.assertEqual(after.returncode, 1, after.stderr + after.stdout)
            self.assertIn("SHARED_PREDICTION_RECORD_MISMATCH: client:", after.stdout)
            self.assertNotIn("verify-split: OK", after.stdout)

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

    def test_declaring_table_id_must_be_readable_on_both_ends(self):
        """verify-split re-derives every (id, value) pair from each end's rows."""
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            _write_shared_repo(base / "ok")
            export_repository_split(base / "ok", base / "ok-client", base / "ok-server")

            for label, edit in (
                ("server-only id", lambda schema: schema["columns"][0].__setitem__("visibility", "SV")),
                ("renamed id column", lambda schema: schema.__setitem__("idColumn", "name")),
            ):
                with self.subTest(label):
                    root = base / label.replace(" ", "-")
                    _write_shared_repo(root)
                    schema_path = root / "schemas" / "movement.json"
                    schema = json.loads(schema_path.read_text(encoding="utf-8"))
                    edit(schema)
                    schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
                    with self.assertRaises(ValidationFailure) as ctx:
                        export_repository_split(root, base / f"{label}-client", base / f"{label}-server")
                    codes = [error["code"] for error in ctx.exception.errors]
                    self.assertIn("SHARED_PREDICTION_ID_NOT_SHARED", codes)


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
            # split-export.md §3/§7: a pair that is not one client and one server is a
            # usage error (2), not an incompatibility (1).
            self.assertEqual(report["exitCode"], 2)
            cli = _run_cli("verify-split", "--client-out", str(client), "--server-out", str(client))
            self.assertEqual(cli.returncode, 2, cli.stdout + cli.stderr)
            self.assertIn("SPLIT_ENDPOINT_INVALID", cli.stdout)

    def test_row_edit_without_manifest_edit_is_caught_on_either_end(self):
        for end_name, folder in (("client", "client"), ("server", "server")):
            with self.subTest(end_name), tempfile.TemporaryDirectory() as temp:
                root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
                _write_shared_repo(root)
                export_repository_split(root, client, server)
                clean = verify_split(client, server)
                self.assertTrue(clean["ok"], clean)
                self.assertEqual(clean["exitCode"], 0)

                end = client if end_name == "client" else server
                rows = end / folder / "movement.json"
                _replace_once(rows, '"step_meters": 1.25', '"step_meters": 9.99')
                tampered = verify_split(client, server)
                self.assertFalse(tampered["ok"], tampered)
                self.assertEqual(tampered["exitCode"], 1)
                self.assertEqual(
                    [error["code"] for error in tampered["errors"]], ["SHARED_PREDICTION_RECORD_MISMATCH"]
                )
                self.assertTrue(tampered["errors"][0]["message"].startswith(f"{end_name}: "), tampered)

                _replace_once(rows, '"step_meters": 9.99', '"step_meters": 1.25')
                self.assertTrue(verify_split(client, server)["ok"])

    def test_row_id_edit_and_row_removal_are_caught(self):
        def remove_rows(path: Path) -> None:
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertTrue(payload["rows"])
            payload["rows"] = []
            path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        for label, edit in (
            ("row id", lambda path: _replace_once(path, '"id": 1,', '"id": 2,')),
            ("row removal", remove_rows),
        ):
            with self.subTest(label), tempfile.TemporaryDirectory() as temp:
                root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
                _write_shared_repo(root)
                export_repository_split(root, client, server)
                edit(client / "client" / "movement.json")
                report = verify_split(client, server)
                self.assertEqual(
                    [error["code"] for error in report["errors"]], ["SHARED_PREDICTION_RECORD_MISMATCH"]
                )

    def test_missing_row_file_is_caught(self):
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            (server / "server" / "movement.json").unlink()
            report = verify_split(client, server)
            self.assertEqual([error["code"] for error in report["errors"]], ["SHARED_PREDICTION_RECORD_MISMATCH"])
            self.assertIn("server/movement.json is missing", report["errors"][0]["message"])

    def test_record_edit_without_row_edit_is_caught(self):
        """Rewriting both records to the same made-up value keeps them equal to each other."""
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            block = json.loads((client / "manifest.json").read_text(encoding="utf-8"))["sharedPrediction"]
            forged = dict(block, fingerprint="0" * 64)
            _rewrite_record(client, forged)
            _rewrite_record(server, forged)
            report = verify_split(client, server)
            self.assertEqual(
                [error["code"] for error in report["errors"]],
                ["SHARED_PREDICTION_RECORD_MISMATCH", "SHARED_PREDICTION_RECORD_MISMATCH"],
            )

    def test_missing_record_on_both_ends_is_not_compatible(self):
        """Two absent blocks used to compare equal (None == None) and pass."""
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)
            for end in (client, server):
                manifest = json.loads((end / "manifest.json").read_text(encoding="utf-8"))
                del manifest["sharedPrediction"]
                (end / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            report = verify_split(client, server)
            self.assertFalse(report["ok"], report)
            self.assertEqual(report["exitCode"], 1)
            self.assertEqual(
                [error["code"] for error in report["errors"]],
                ["SHARED_PREDICTION_RECORD_MISMATCH", "SHARED_PREDICTION_RECORD_MISMATCH"],
            )

    def test_trust_boundary_rows_and_record_rewritten_together(self):
        """split-export.md §7 trust boundary, pinned.

        An undeclared column is not looked at. Rewrite one end's rows and its record
        consistently: the integrity check has
        nothing to object to, and the cross-end comparison is what refuses. Rewrite the
        other end the same way and the pair is indistinguishable from a real compile —
        that is authenticity, which verify-split does not claim.
        """
        schema = {"movement": {"idColumn": "id", "columns": [{"name": "step_meters", "sharedPrediction": True}]}}
        with tempfile.TemporaryDirectory() as temp:
            root, client, server = (Path(temp) / name for name in ("repo", "client", "server"))
            _write_shared_repo(root)
            export_repository_split(root, client, server)

            def forge(end: Path, folder: str) -> None:
                rows_path = end / folder / "movement.json"
                _replace_once(rows_path, '"step_meters": 1.25', '"step_meters": 9.99')
                rows = json.loads(rows_path.read_text(encoding="utf-8"))["rows"]
                _rewrite_record(end, shared_prediction_block(schema, {"movement": rows}))

            # Undeclared columns are outside the check (ADR-102 compares the declared subset).
            _replace_once(client / "client" / "movement.json", '"name": "default"', '"name": "renamed"')
            self.assertTrue(verify_split(client, server)["ok"])

            forge(client, "client")
            one_end = verify_split(client, server)
            self.assertEqual([error["code"] for error in one_end["errors"]], ["SHARED_PREDICTION_VALUE_MISMATCH"])

            forge(server, "server")
            both_ends = verify_split(client, server)
            self.assertTrue(both_ends["ok"], both_ends)


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

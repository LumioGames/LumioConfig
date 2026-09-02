import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "tools" / "lumio_config.py"
MIXED = ROOT / "testdata" / "integration" / "mixed-table"
REVIEW_INPUT = ROOT / "testdata" / "integration" / "review-input.json"
CONTRACT = "lumio-config-tools/v1"
CANDIDATE_TAG = "integration-R-00327"
BANNED_ACTIONS = ("activate", "sign", "publish")
GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "ai",
    "GIT_AUTHOR_EMAIL": "ai@lumio.games",
    "GIT_COMMITTER_NAME": "ai",
    "GIT_COMMITTER_EMAIL": "ai@lumio.games",
}


def _run_cli(*args: str, root: Path | None = None) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, str(CLI), *args]
    if root is not None:
        command.extend(["--root", str(root)])
    return subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _git(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=check,
        env=GIT_ENV,
    )


def _copy_mixed(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(MIXED / name, dst / name)
    shutil.copy(MIXED / "repository.yaml", dst / "repository.yaml")
    shutil.copy(ROOT / ".gitignore", dst / ".gitignore")


def _copy_authority(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")
    shutil.copy(ROOT / ".gitignore", dst / ".gitignore")


def _init_git(root: Path, message: str = "baseline") -> None:
    _git(root, "init")
    _git(root, "config", "user.email", "ai@lumio.games")
    _git(root, "config", "user.name", "ai")
    _git(root, "config", "core.autocrlf", "false")
    _git(root, "config", "core.eol", "lf")
    (root / ".gitattributes").write_text("* text=auto eol=lf\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", message)


def _porcelain_paths(root: Path) -> list[str]:
    result = _git(root, "status", "--porcelain")
    paths: list[str] = []
    for line in result.stdout.splitlines():
        entry = line[3:].strip().replace("\\", "/")
        if " -> " in entry:
            entry = entry.split(" -> ", 1)[1]
        paths.append(entry)
    return paths


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _client_blob(output: Path) -> str:
    parts: list[str] = []
    client = output / "client"
    for path in sorted(client.rglob("*")):
        if path.is_file():
            parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts)


def _scan_secrets(blob: str, forbidden: list[str]) -> list[str]:
    return [token for token in forbidden if token in blob]


def _schema_forbidden_tokens(root: Path, table: str, projections: dict[str, dict]) -> list[str]:
    payload = json.loads(_run_cli("query", "schema", table, root=root).stdout)
    tokens: list[str] = []
    for column in payload["schema"]["columns"]:
        visibility = str(column.get("visibility") or "S")
        if "C" in visibility:
            continue
        name = str(column["name"])
        tokens.append(name)
        for body in projections.values():
            for row in body.get("rows") or []:
                if name in row and row[name] is not None:
                    tokens.append(str(row[name]))
    return tokens


def _review_payload(root: Path, manifest: dict) -> dict:
    return {
        "tag": CANDIDATE_TAG,
        "architectureCommit": _architecture_commit(root),
        "baselineId": manifest["baselineId"],
        "compilerHash": manifest["compilerHash"],
        "inputHash": manifest["inputHash"],
        "outputHash": manifest["outputHash"],
        "revisionId": manifest["revisionId"],
        "publicRoot": manifest["publicRoot"],
        "projectionRoots": manifest["projectionRoots"],
        "consumerCommits": {},
        "knownGaps": [
            "reload/replay vertical chain moved out with R-00326",
            "R-00325 typed readers and consumer-repo commits are out of this Room",
        ],
    }


class IntegrationLayoutTests(unittest.TestCase):
    def test_tests_live_under_integration_and_drive_cli_via_subprocess(self) -> None:
        here = Path(__file__).resolve()
        self.assertEqual(here.parent.name, "integration")
        self.assertEqual(here.parents[1].name, "tests")
        source = here.read_text(encoding="utf-8")
        self.assertIn("subprocess", source)
        self.assertIsNone(re.search(r"^(from|import) lumio_config\b", source, re.M))
        self.assertTrue((ROOT / "tools" / "lumio_config.py").is_file())
        self.assertNotIn("site-packages", str(CLI))


class MixedVisibilityProjectionTests(unittest.TestCase):
    def test_mixed_table_exports_three_targets_and_client_secret_scan_is_clean(self) -> None:
        self.assertTrue(MIXED.is_dir(), f"missing fixture {MIXED}")
        expected = _load_json(MIXED / "expected.json")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _copy_mixed(root)
            formatted = _run_cli("format", root=root)
            self.assertEqual(formatted.returncode, 0, formatted.stdout + formatted.stderr)
            exported = _run_cli("export", "--out", str(output), root=root)
            self.assertEqual(exported.returncode, 0, exported.stdout + exported.stderr)
            self.assertIn("export: OK", exported.stdout)

            table = expected["table"]
            server = _load_json(output / "server" / f"{table}.json")
            client = _load_json(output / "client" / f"{table}.json")
            voxel = _load_json(output / "voxel" / f"{table}.json")
            self.assertEqual(server["target"], "S")
            self.assertEqual(client["target"], "C")
            self.assertEqual(voxel["target"], "V")
            self.assertEqual([row["name"] for row in server["rows"]], expected["rows"])
            self.assertEqual([row["name"] for row in client["rows"]], expected["rows"])
            self.assertEqual([row["name"] for row in voxel["rows"]], expected["rows"])

            server_row = server["rows"][0]
            client_row = client["rows"][0]
            voxel_row = voxel["rows"][0]
            self.assertEqual(sorted(server_row), sorted(expected["serverColumns"]))
            self.assertEqual(sorted(client_row), sorted(expected["clientColumns"]))
            self.assertEqual(sorted(voxel_row), sorted(expected["voxelColumns"]))
            self.assertEqual(server_row["server_token"], expected["serverToken"])
            self.assertEqual(client_row["headline"], expected["headline"])
            self.assertEqual(voxel_row["voxel_tint"], expected["voxelTint"])
            self.assertNotIn("server_token", client_row)
            self.assertNotIn("voxel_tint", client_row)
            self.assertNotIn("headline", server_row)
            self.assertNotIn("headline", voxel_row)

            forbidden = _schema_forbidden_tokens(root, table, {"S": server, "V": voxel})
            self.assertTrue(forbidden, "schema must yield non-C column names/values")
            self.assertEqual(sorted(set(forbidden)), sorted(set(expected["clientForbidden"])))
            hits = _scan_secrets(_client_blob(output), forbidden)
            self.assertEqual(hits, [], hits)

            release = _load_json(output / "manifest.json")
            self.assertEqual(set(release["projectionRoots"]), {"S", "C", "V"})
            self.assertNotEqual(release["publicRoot"], release["projectionRoots"]["C"])


class AiFiveActionTests(unittest.TestCase):
    def test_self_heal_type_error_then_submit_with_git_audit_and_no_activate(self) -> None:
        help_text = _run_cli("--help")
        self.assertEqual(help_text.returncode, 0, help_text.stdout + help_text.stderr)
        combined = help_text.stdout.lower()
        self.assertIn("query", combined)
        self.assertIn("preview", combined)
        self.assertIn("patch", combined)
        for banned in BANNED_ACTIONS:
            self.assertIsNone(re.search(rf"\b{banned}\b", combined), banned)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            scratch = Path(temp) / "scratch"
            scratch.mkdir()
            _copy_authority(root)
            _init_git(root)

            queried = _run_cli("query", "row", "skills", "fireball", root=root)
            self.assertEqual(queried.returncode, 0, queried.stdout + queried.stderr)
            card = json.loads(queried.stdout)
            self.assertEqual(card["contract"], CONTRACT)
            self.assertEqual(card["row"]["damage"], 120)

            bad_patch = scratch / "proposal.json"
            bad_patch.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": "not-a-number"}}],
                    }
                ),
                encoding="utf-8",
            )
            failed = _run_cli("patch", "apply", str(bad_patch), root=root)
            self.assertNotEqual(failed.returncode, 0, failed.stdout + failed.stderr)
            failed_body = json.loads(failed.stdout)
            self.assertFalse(failed_body["ok"])
            error = failed_body["errors"][0]
            self.assertEqual(error["code"], "TYPE_MISMATCH")
            self.assertEqual(error["column"], "damage")
            self.assertTrue(error["suggestion"])
            still = json.loads(_run_cli("query", "row", "skills", "fireball", root=root).stdout)
            self.assertEqual(still["row"]["damage"], card["row"]["damage"])
            self.assertEqual(_porcelain_paths(root), [])

            schema = json.loads(_run_cli("query", "schema", "skills", root=root).stdout)
            column = next(item for item in schema["schema"]["columns"] if item["name"] == error["column"])
            self.assertIn(column["type"], {"i32", "i64", "u32", "u64"})
            fixed_value = int(card["row"]["damage"]) + 10
            bad_patch.write_text(
                json.dumps(
                    {
                        "table": "skills",
                        "ops": [{"op": "update", "name": "fireball", "set": {"damage": fixed_value}}],
                    }
                ),
                encoding="utf-8",
            )
            precheck = _run_cli("patch", "validate", str(bad_patch), root=root)
            self.assertEqual(precheck.returncode, 0, precheck.stdout + precheck.stderr)
            preview = _run_cli("preview", str(bad_patch), root=root)
            self.assertEqual(preview.returncode, 0, preview.stdout + preview.stderr)
            preview_body = json.loads(preview.stdout)
            self.assertEqual(preview_body["contract"], CONTRACT)
            self.assertTrue(preview_body["ok"])

            audit = scratch / "audit.jsonl"
            reason = "fix TYPE_MISMATCH on skills.damage"
            applied = _run_cli(
                "patch",
                "apply",
                str(bad_patch),
                "--audit",
                str(audit),
                "--reason",
                reason,
                "--actor",
                "ai",
                root=root,
            )
            self.assertEqual(applied.returncode, 0, applied.stdout + applied.stderr)
            body = json.loads(applied.stdout)
            self.assertEqual(body["contract"], CONTRACT)
            self.assertTrue(body["ok"])
            self.assertEqual(body["actor"], "ai")
            self.assertEqual(body["reason"], reason)
            self.assertTrue(body["beforeSourceFingerprint"])
            self.assertTrue(body["sourceFingerprint"])
            self.assertNotEqual(body["beforeSourceFingerprint"], body["sourceFingerprint"])

            dirty = _porcelain_paths(root)
            self.assertTrue(dirty, "submit must change authority")
            for path in dirty:
                self.assertTrue(
                    path.startswith("tables/") or path.startswith("registry/"),
                    dirty,
                )

            _git(root, "add", "tables", "registry")
            message = (
                f"submit {reason}\n\n"
                f"actor=ai\n"
                f"reason={reason}\n"
                f"beforeSourceFingerprint={body['beforeSourceFingerprint']}\n"
                f"sourceFingerprint={body['sourceFingerprint']}\n"
            )
            _git(root, "commit", "-m", message)
            log = _git(root, "log", "-1", "--format=%an%n%B")
            self.assertIn("ai", log.stdout)
            self.assertIn(reason, log.stdout)
            self.assertIn(body["beforeSourceFingerprint"], log.stdout)
            self.assertIn(body["sourceFingerprint"], log.stdout)
            self.assertEqual(_porcelain_paths(root), [])

            audit_line = json.loads(audit.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(audit_line["actor"], "ai")
            self.assertEqual(audit_line["reason"], reason)
            self.assertEqual(audit_line["beforeSourceFingerprint"], body["beforeSourceFingerprint"])
            self.assertEqual(audit_line["sourceFingerprint"], body["sourceFingerprint"])

            after = json.loads(_run_cli("query", "row", "skills", "fireball", root=root).stdout)
            self.assertEqual(after["row"]["damage"], fixed_value)


class RebuildRollbackTests(unittest.TestCase):
    def test_clean_rebuild_matches_and_rollback_restores_hashes(self) -> None:
        self.assertTrue(MIXED.is_dir(), f"missing fixture {MIXED}")
        with tempfile.TemporaryDirectory() as temp:
            first_root = Path(temp) / "one"
            first_out = Path(temp) / "one-out"
            second_root = Path(temp) / "two"
            second_out = Path(temp) / "two-out"
            mutated_out = Path(temp) / "mutated-out"
            rolled_out = Path(temp) / "rolled-out"
            scratch = Path(temp) / "scratch"
            scratch.mkdir()

            _copy_mixed(first_root)
            self.assertEqual(_run_cli("format", root=first_root).returncode, 0)
            _init_git(first_root, "integration candidate")
            _git(first_root, "tag", CANDIDATE_TAG)

            first = _run_cli("export", "--out", str(first_out), root=first_root)
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            first_manifest = _load_json(first_out / "manifest.json")
            for key in ("compilerHash", "inputHash", "outputHash"):
                self.assertEqual(len(first_manifest[key]), 64, key)
            review = _review_payload(first_root, first_manifest)
            pinned = _load_json(REVIEW_INPUT)
            for key in (
                "tag",
                "architectureCommit",
                "baselineId",
                "compilerHash",
                "inputHash",
                "outputHash",
                "revisionId",
                "publicRoot",
                "projectionRoots",
                "consumerCommits",
                "knownGaps",
            ):
                self.assertEqual(review[key], pinned[key], key)

            _copy_mixed(second_root)
            self.assertEqual(_run_cli("format", root=second_root).returncode, 0)
            second = _run_cli("export", "--out", str(second_out), root=second_root)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            second_manifest = _load_json(second_out / "manifest.json")
            for key in ("compilerHash", "inputHash", "outputHash"):
                self.assertEqual(first_manifest[key], second_manifest[key], key)
            for path in sorted(first_out.rglob("*.json")):
                other = second_out / path.relative_to(first_out)
                self.assertEqual(path.read_bytes(), other.read_bytes(), path.name)

            patch_path = scratch / "headline.json"
            patch_path.write_text(
                json.dumps(
                    {
                        "table": "notices",
                        "ops": [{"op": "update", "name": "launch_banner", "set": {"headline": "changed"}}],
                    }
                ),
                encoding="utf-8",
            )
            applied = _run_cli("patch", "apply", str(patch_path), "--actor", "ai", "--reason", "mutate", root=first_root)
            self.assertEqual(applied.returncode, 0, applied.stdout + applied.stderr)
            mutated = _run_cli("export", "--out", str(mutated_out), root=first_root)
            self.assertEqual(mutated.returncode, 0, mutated.stdout + mutated.stderr)
            mutated_manifest = _load_json(mutated_out / "manifest.json")
            self.assertEqual(mutated_manifest["compilerHash"], first_manifest["compilerHash"])
            self.assertNotEqual(mutated_manifest["inputHash"], first_manifest["inputHash"])
            self.assertNotEqual(mutated_manifest["outputHash"], first_manifest["outputHash"])

            _git(first_root, "reset", "--hard", CANDIDATE_TAG)
            rolled = _run_cli("export", "--out", str(rolled_out), root=first_root)
            self.assertEqual(rolled.returncode, 0, rolled.stdout + rolled.stderr)
            rolled_manifest = _load_json(rolled_out / "manifest.json")
            for key in ("compilerHash", "inputHash", "outputHash"):
                self.assertEqual(rolled_manifest[key], first_manifest[key], key)

            self.assertEqual(review["consumerCommits"], {})
            self.assertEqual(len(review["architectureCommit"]), 40)
            guide = (ROOT / "docs" / "operations" / "integration-candidate.md").read_text(encoding="utf-8")
            for token in ("compilerHash", "inputHash", "outputHash", CANDIDATE_TAG, "review-input.json"):
                self.assertIn(token, guide)


def _architecture_commit(root: Path) -> str:
    for line in (root / "repository.yaml").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("sourceCommit:"):
            return line.split(":", 1)[1].strip()
    raise AssertionError("repository.yaml missing sourceCommit")


if __name__ == "__main__":
    unittest.main()

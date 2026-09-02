import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.drafts import DraftStore
from lumio_config.editor.server import create_server
from lumio_config.editor.session import Session
from lumio_config.editor.settings import load_settings
from lumio_config.editor.submit import submit
from lumio_config.editor.vcs import GitAdapter, NoneAdapter, SvnAdapter, make_adapter
from lumio_config.fingerprint import source_fingerprint
from lumio_config.patch import apply_patch


ROOT = Path(__file__).resolve().parents[1]


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")
    if (ROOT / ".lumio").exists():
        shutil.copytree(ROOT / ".lumio", dst / ".lumio")


def _git_init(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "s@t"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "s"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True, text=True)


def _write_settings(root: Path, payload: dict) -> None:
    path = root / ".lumio" / "local.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _session(root: Path) -> tuple[Session, object]:
    settings = load_settings(root)
    adapter = make_adapter(root, settings)
    commit_allowed = settings.vcs != "none" and not adapter.status(["tables", "registry", "schemas"])
    return Session(root, settings, adapter, commit_allowed), adapter


def _start(root: Path):
    host = create_server(root, 0, False)
    thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
    thread.start()
    return host


def _request(host, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=8)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Authorization": f"Bearer {host.token}",
        "Host": f"127.0.0.1:{host.port}",
        "Content-Type": "application/json",
    }
    conn.request(method, path, body=payload, headers=headers)
    response = conn.getresponse()
    raw = response.read()
    conn.close()
    return response.status, json.loads(raw.decode("utf-8")) if raw else {}


class SubmitNoneTests(unittest.TestCase):
    def test_empty_ops_ok_and_bytes_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _write_settings(root, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": False}})
            session, adapter = _session(root)
            table = root / "tables" / "skills.txt"
            registry = root / "registry" / "row-ids.json"
            before_table = table.read_bytes()
            before_reg = registry.read_bytes()
            before_fp = source_fingerprint(table, root / "schemas" / "skills.json")
            result = submit(
                session,
                {"table": "skills", "base": {"sourceFingerprint": before_fp}, "ops": []},
                session.settings,
                adapter,
                DraftStore(root),
            )
            self.assertTrue(result.ok)
            self.assertEqual(table.read_bytes(), before_table)
            self.assertEqual(registry.read_bytes(), before_reg)
            self.assertEqual(result.source_fingerprint, before_fp)

    def test_update_matches_hand_written_apply(self):
        with tempfile.TemporaryDirectory() as temp:
            left = Path(temp) / "a"
            right = Path(temp) / "b"
            for path in (left, right):
                _copy_repo(path)
                _write_settings(path, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": False}})
            patch = {
                "table": "skills",
                "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}, "expect": {"damage": "120"}}],
            }
            apply_patch(right, patch)
            session, adapter = _session(left)
            result = submit(session, patch, session.settings, adapter, DraftStore(left))
            self.assertTrue(result.ok, result.errors)
            self.assertEqual((left / "tables" / "skills.txt").read_bytes(), (right / "tables" / "skills.txt").read_bytes())
            self.assertEqual((left / "registry" / "row-ids.json").read_bytes(), (right / "registry" / "row-ids.json").read_bytes())

    def test_create_rename_delete_match_hand_patch(self):
        with tempfile.TemporaryDirectory() as temp:
            left = Path(temp) / "a"
            right = Path(temp) / "b"
            for path in (left, right):
                _copy_repo(path)
                _write_settings(path, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": False}})
            patch = {
                "table": "skills",
                "ops": [
                    {"op": "update", "name": "fireball", "set": {"damage": 130}, "expect": {"damage": "120"}},
                    {"op": "rename", "name": "frostbolt", "to": "frost_bolt", "expect": {"name": "frostbolt"}},
                    {
                        "op": "create",
                        "name": "ice_lance",
                        "draftRowKey": "draft:abcd1234",
                        "set": {
                            "display_name": "Ice Lance",
                            "effect_id": "chill",
                            "damage": 40,
                            "cooldown_frames": 60,
                            "icon": "fx_ice_lance",
                        },
                    },
                ],
            }
            apply_patch(right, patch)
            session, adapter = _session(left)
            result = submit(session, patch, session.settings, adapter, DraftStore(left))
            self.assertTrue(result.ok, result.errors)
            self.assertIn("draft:abcd1234", result.assigned_ids)
            self.assertEqual((left / "tables" / "skills.txt").read_bytes(), (right / "tables" / "skills.txt").read_bytes())
            self.assertEqual((left / "registry" / "row-ids.json").read_bytes(), (right / "registry" / "row-ids.json").read_bytes())


class SubmitGitTests(unittest.TestCase):
    def test_empty_ops_auto_commit_leaves_head_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(root, {"vcs": "git", "submit": {"autoCommit": True, "autoExport": False}})
            session, adapter = _session(root)
            table = root / "tables" / "skills.txt"
            before_head = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True
            ).stdout.strip()
            before_bytes = table.read_bytes()
            fp = source_fingerprint(table, root / "schemas" / "skills.json")
            result = submit(
                session,
                {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": []},
                session.settings,
                adapter,
                DraftStore(root),
            )
            self.assertTrue(result.ok, result.errors)
            self.assertEqual(result.vcs.get("action") if result.vcs else "none", "none")
            after_head = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True
            ).stdout.strip()
            self.assertEqual(before_head, after_head)
            self.assertEqual(table.read_bytes(), before_bytes)
            self.assertEqual(result.source_fingerprint, fp)

    def test_auto_commit_whitelist_and_skip(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(root, {"vcs": "git", "submit": {"autoCommit": True, "autoExport": False}})
            session, adapter = _session(root)
            self.assertIsInstance(adapter, GitAdapter)
            fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
            patch = {
                "table": "skills",
                "base": {"sourceFingerprint": fp},
                "ops": [{"op": "update", "name": "fireball", "set": {"damage": 131}}],
            }
            result = submit(session, patch, session.settings, adapter, DraftStore(root))
            self.assertTrue(result.ok, result.errors)
            log = subprocess.run(["git", "log", "-1", "--format=%s"], cwd=root, capture_output=True, text=True, check=True)
            self.assertTrue(log.stdout.strip().startswith("config(skills):"))
            names = [
                line.replace("\\", "/")
                for line in subprocess.run(
                    ["git", "show", "--pretty=", "--name-only", "HEAD"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout.splitlines()
                if line.strip()
            ]
            self.assertTrue(names)
            self.assertTrue(set(names) <= {"tables/skills.txt", "registry/row-ids.json", "registry/tombstones.json"})

    def test_auto_commit_false_leaves_dirty_tree(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(root, {"vcs": "git", "submit": {"autoCommit": False, "autoExport": False}})
            session, adapter = _session(root)
            fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
            result = submit(
                session,
                {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": [{"op": "update", "name": "fireball", "set": {"damage": 140}}]},
                session.settings,
                adapter,
                DraftStore(root),
            )
            self.assertTrue(result.ok, result.errors)
            status = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True, check=True)
            self.assertIn("tables/skills.txt", status.stdout.replace("\\", "/"))

    def test_allow_dirty_skips_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(
                root,
                {"vcs": "git", "submit": {"autoCommit": True, "autoExport": False}, "openPolicy": {"allowDirtyWorkingTree": True}},
            )
            session, adapter = _session(root)
            fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
            before = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
            result = submit(
                session,
                {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": [{"op": "update", "name": "fireball", "set": {"damage": 141}}]},
                session.settings,
                adapter,
                DraftStore(root),
            )
            self.assertTrue(result.ok, result.errors)
            after = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
            self.assertEqual(before, after)

    def test_commit_failure_keeps_txt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(root, {"vcs": "git", "submit": {"autoCommit": True, "autoExport": False}})
            session, adapter = _session(root)

            def boom(_paths, _message):
                raise RuntimeError("commit failed")

            adapter.commit = boom  # type: ignore[method-assign]
            fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
            result = submit(
                session,
                {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": [{"op": "update", "name": "fireball", "set": {"damage": 142}}]},
                session.settings,
                adapter,
                DraftStore(root),
            )
            self.assertFalse(result.ok)
            self.assertTrue(any(error.get("code") == "VCS_COMMIT_FAILED" for error in result.errors))
            self.assertIn("142", (root / "tables" / "skills.txt").read_text(encoding="utf-8"))


class SubmitSvnAndExportTests(unittest.TestCase):
    def test_svn_add_then_commit_sequence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            (root / ".svn").mkdir()
            bin_dir = root / "bin"
            bin_dir.mkdir()
            log = root / "svn.log"
            stub = bin_dir / "svn_stub.py"
            stub.write_text(
                "import sys\n"
                f"open(r'{log.as_posix()}', 'a', encoding='utf-8').write(' '.join(sys.argv[1:]) + '\\n')\n"
                "args = sys.argv[1:]\n"
                "if args[:1] == ['status']:\n"
                "    if any('skills.txt' in a for a in args):\n"
                "        sys.stdout.write('?       tables/skills.txt\\n')\n"
                "elif args[:1] == ['info']:\n"
                "    sys.stdout.write('18\\n')\n"
                "elif args[:1] == ['commit']:\n"
                "    sys.stdout.write('Committed revision 18.\\n')\n",
                encoding="utf-8",
            )
            (bin_dir / "svn.cmd").write_text(f'@echo off\r\n"{sys.executable}" "{stub}" %*\r\n', encoding="utf-8")
            unix = bin_dir / "svn"
            unix.write_text(f"#!{sys.executable}\n" + stub.read_text(encoding="utf-8"), encoding="utf-8")
            unix.chmod(0o755)
            original = os.environ.get("PATH")
            os.environ["PATH"] = str(bin_dir) + os.pathsep + (original or "")
            try:
                _write_settings(root, {"vcs": "svn", "submit": {"autoCommit": True, "autoExport": False}})
                session, adapter = _session(root)
                self.assertIsInstance(adapter, SvnAdapter)
                fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
                result = submit(
                    session,
                    {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": [{"op": "update", "name": "fireball", "set": {"damage": 150}}]},
                    session.settings,
                    adapter,
                    DraftStore(root),
                )
                self.assertTrue(result.ok, result.errors)
                recorded = log.read_text(encoding="utf-8")
                self.assertIn("add", recorded)
                self.assertIn("commit", recorded)
            finally:
                if original is None:
                    del os.environ["PATH"]
                else:
                    os.environ["PATH"] = original

    def test_export_failure_keeps_txt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _write_settings(root, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": True}})
            session, adapter = _session(root)
            fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
            with patch("lumio_config.editor.submit.export_repository", side_effect=RuntimeError("boom")):
                result = submit(
                    session,
                    {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": [{"op": "update", "name": "fireball", "set": {"damage": 160}}]},
                    session.settings,
                    adapter,
                    DraftStore(root),
                )
            self.assertFalse(result.ok)
            self.assertTrue(any(error.get("code") == "EXPORT_FAILED" for error in result.errors))
            self.assertIn("160", (root / "tables" / "skills.txt").read_text(encoding="utf-8"))

    def test_auto_export_writes_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _write_settings(root, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": True}, "export": {"outDir": "build/export"}})
            session, adapter = _session(root)
            fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
            result = submit(
                session,
                {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": [{"op": "update", "name": "fireball", "set": {"damage": 161}}]},
                session.settings,
                adapter,
                DraftStore(root),
            )
            self.assertTrue(result.ok, result.errors)
            self.assertTrue((root / "build" / "export" / "manifest.json").exists())


class SubmitHttpTests(unittest.TestCase):
    def test_validate_and_apply_empty_ops(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(root, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": False}})
            host = _start(root)
            try:
                fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
                body = {"table": "skills", "base": {"sourceFingerprint": fp}, "ops": []}
                status, payload = _request(host, "POST", "/api/patch/validate", body)
                self.assertEqual(status, 200, payload)
                self.assertTrue(payload["ok"])
                status, payload = _request(host, "POST", "/api/patch/apply", body)
                self.assertEqual(status, 200, payload)
                self.assertTrue(payload["ok"])
            finally:
                host.shutdown()

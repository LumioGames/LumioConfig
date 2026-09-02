import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.server import create_server
from lumio_config.editor.settings import load_settings
from lumio_config.editor.vcs import ALLOWED_COMMANDS, GitAdapter, NoneAdapter, SvnAdapter, make_adapter, run_vcs
from lumio_config.export import export_repository
from lumio_config.fingerprint import source_fingerprint
from lumio_config.validate import effective_value, load_sources


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"
SESSION_KEYS = {"repoName", "revision", "tables", "schemas", "settings", "capabilities"}
REVISION_KEYS = {"vcs", "id", "branch", "dirty"}
TABLE_KEYS = {"name", "schemaPath", "rowCount", "sourceFingerprint", "schemaFingerprint"}
CAPABILITY_KEYS = {"submit", "commit", "export", "events"}
CELL_KEYS = {"state", "raw", "effective"}


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
    subprocess.run(["git", "config", "user.email", "editor@test"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Editor Test"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True, text=True)


def _write_settings(root: Path, payload: dict, local: bool = False) -> None:
    path = root / ".lumio" / ("local.json" if local else "editor.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _start(root: Path):
    host = create_server(root, 0, False)
    thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
    thread.start()
    host.thread = thread
    return host


def _stop(host) -> None:
    host.shutdown()


def _request(host, method: str, path: str, token: str | None = True, origin: str | None = None, host_header: str | None = None) -> tuple[int, dict | str, dict]:
    conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=5)
    headers = {}
    if token is True:
        headers["Authorization"] = f"Bearer {host.token}"
    elif isinstance(token, str):
        headers["Authorization"] = f"Bearer {token}"
    if origin is not None:
        headers["Origin"] = origin
    headers["Host"] = host_header or f"127.0.0.1:{host.port}"
    conn.request(method, path, headers=headers)
    response = conn.getresponse()
    raw = response.read()
    header_map = {key.lower(): value for key, value in response.getheaders()}
    body: dict | str
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except json.JSONDecodeError:
        body = raw.decode("utf-8")
    conn.close()
    return response.status, body, header_map


class SettingsTests(unittest.TestCase):
    def test_local_overrides_editor_and_detects_git(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            _write_settings(root, {"submit": {"autoExport": True}, "vcs": ""})
            _write_settings(root, {"submit": {"autoCommit": False}}, local=True)
            settings = load_settings(root)
            public = settings.as_public()
            self.assertEqual(public["vcs"], "git")
            self.assertFalse(public["submit"]["autoCommit"])
            self.assertTrue(public["submit"]["autoExport"])
            self.assertEqual(public["export"]["outDir"], "build/export")
            self.assertFalse(public["openPolicy"]["allowDirtyWorkingTree"])

    def test_invalid_vcs_names_the_key(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _write_settings(root, {"vcs": "hg"})
            with self.assertRaises(ValueError) as ctx:
                load_settings(root)
            self.assertIn("vcs", str(ctx.exception))


class VcsTests(unittest.TestCase):
    def test_git_status_and_revision(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            adapter = make_adapter(root, load_settings(root))
            self.assertIsInstance(adapter, GitAdapter)
            self.assertEqual(adapter.status(["tables", "registry", "schemas"]), [])
            revision = adapter.revision()
            self.assertEqual(revision.vcs, "git")
            self.assertTrue(revision.id)
            self.assertTrue(revision.branch)
            (root / "tables" / "skills.txt").write_text(
                (root / "tables" / "skills.txt").read_text(encoding="utf-8").replace("120", "121"),
                encoding="utf-8",
            )
            dirty = adapter.status(["tables", "registry", "schemas"])
            self.assertTrue(any("skills.txt" in path.replace("\\", "/") for path in dirty), dirty)
            with self.assertRaises(NotImplementedError):
                adapter.commit(["tables/skills.txt"], "nope")

    def test_svn_and_none_adapters(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            (root / ".svn").mkdir()
            bin_dir = root / "bin"
            bin_dir.mkdir()
            stub = bin_dir / "svn_stub.py"
            stub.write_text(
                "import sys\n"
                "args = sys.argv[1:]\n"
                "if args[:1] == ['status']:\n"
                "    sys.stdout.write('M       tables/skills.txt\\n')\n"
                "elif args[:1] == ['info']:\n"
                "    sys.stdout.write('17\\n')\n",
                encoding="utf-8",
            )
            (bin_dir / "svn.cmd").write_text(f'@echo off\r\n"{sys.executable}" "{stub}" %*\r\n', encoding="utf-8")
            unix = bin_dir / "svn"
            unix.write_text(f"#!{sys.executable}\n" + stub.read_text(encoding="utf-8"), encoding="utf-8")
            unix.chmod(0o755)
            env = os.environ.copy()
            env["PATH"] = str(bin_dir) + os.pathsep + env.get("PATH", "")
            _write_settings(root, {"vcs": "svn"})
            settings = load_settings(root)
            adapter = make_adapter(root, settings)
            self.assertIsInstance(adapter, SvnAdapter)
            original = os.environ.get("PATH")
            os.environ["PATH"] = env["PATH"]
            try:
                self.assertTrue(any("skills.txt" in path.replace("\\", "/") for path in adapter.status(["tables"])))
                revision = adapter.revision()
                self.assertEqual(revision.vcs, "svn")
                self.assertEqual(revision.id, "17")
            finally:
                if original is None:
                    del os.environ["PATH"]
                else:
                    os.environ["PATH"] = original
            _write_settings(root, {"vcs": "none"})
            none = make_adapter(root, load_settings(root))
            self.assertIsInstance(none, NoneAdapter)
            self.assertEqual(none.status(["tables"]), [])
            self.assertIsNone(none.revision())

    def test_whitelist_rejects_unknown_argv(self):
        self.assertIn(("git", "status"), ALLOWED_COMMANDS)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(ValueError):
                run_vcs(root, ["git", "push", "origin", "main"])


class ServerSecurityTests(unittest.TestCase):
    def test_loopback_token_origin_host_and_delete(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            host = _start(root)
            try:
                self.assertEqual(host.httpd.server_address[0], "127.0.0.1")
                status, body, headers = _request(host, "GET", "/api/session", token=None)
                self.assertEqual(status, 401)
                self.assertEqual(body["code"], "UNAUTHORIZED")
                self.assertEqual(body["errors"], [])
                self.assertIn("default-src 'self'", headers.get("content-security-policy", ""))
                self.assertNotIn("access-control-allow-origin", headers)
                status, body, _ = _request(host, "GET", "/api/session", origin="http://evil.example")
                self.assertEqual(status, 403)
                self.assertEqual(body["code"], "FORBIDDEN_ORIGIN")
                status, body, _ = _request(host, "GET", "/api/session", host_header="evil.example")
                self.assertEqual(status, 403)
                status, body, _ = _request(host, "DELETE", "/api/session")
                self.assertEqual(status, 204)
                time.sleep(0.3)
            finally:
                _stop(host)
            with self.assertRaises((ConnectionError, OSError, http.client.HTTPException)):
                _request(host, "GET", "/api/session")


class SessionContractTests(unittest.TestCase):
    def test_session_and_table_projection_match_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            schema_path = root / "schemas" / "skills.json"
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            schema["columns"].append(
                {
                    "name": "note",
                    "ordinal": 7,
                    "type": "string",
                    "required": False,
                    "default": "none",
                    "visibility": "S",
                }
            )
            schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
            (root / "tables" / "skills.txt").write_text(
                "table: skills\nschema: schemas/skills.json\n\n"
                "| id | name | display_name | effect_id | damage | cooldown_frames | icon | note |\n"
                "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
                "| 40001 | fireball | Fireball | 50001 | 120 | 150 | fx_fireball | @default |\n\n"
                '| 40002 | frostbolt | Frostbolt | 50002 | 90 | 90 | fx_frostbolt | "" |\n',
                encoding="utf-8",
            )
            subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", "states"], cwd=root, check=True, capture_output=True)
            host = _start(root)
            try:
                status, session, _ = _request(host, "GET", "/api/session")
                self.assertEqual(status, 200, session)
                self.assertEqual(set(session), SESSION_KEYS)
                self.assertEqual(session["repoName"], "LumioConfig")
                self.assertEqual(set(session["revision"]), REVISION_KEYS)
                self.assertEqual(session["revision"]["vcs"], "git")
                self.assertFalse(session["revision"]["dirty"])
                self.assertEqual(set(session["capabilities"]), CAPABILITY_KEYS)
                self.assertEqual(session["capabilities"]["export"], ["csv", "tsv"])
                self.assertTrue(session["capabilities"]["events"])
                skills_meta = next(item for item in session["tables"] if item["name"] == "skills")
                self.assertEqual(set(skills_meta), TABLE_KEYS)
                self.assertEqual(skills_meta["schemaPath"], "schemas/skills.json")
                self.assertTrue(skills_meta["sourceFingerprint"])
                expected_fp = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
                self.assertEqual(skills_meta["sourceFingerprint"], expected_fp)
                self.assertIn("skills", session["schemas"])
                status, table, _ = _request(host, "GET", "/api/tables/skills")
                self.assertEqual(status, 200, table)
                self.assertEqual(table["table"], "skills")
                id_col = next(column for column in table["columns"] if column["name"] == "id")
                self.assertTrue(id_col["readOnly"])
                fireball = next(row for row in table["rows"] if row["name"] == "fireball")
                frost = next(row for row in table["rows"] if row["name"] == "frostbolt")
                self.assertEqual(fireball["id"], 40001)
                self.assertNotIn("id", fireball["cells"])
                self.assertNotIn("name", fireball["cells"])
                self.assertEqual(set(fireball["cells"]["note"]), CELL_KEYS)
                self.assertEqual(fireball["cells"]["note"]["raw"], "@default")
                self.assertEqual(fireball["cells"]["note"]["state"], "default")
                self.assertEqual(frost["cells"]["note"]["raw"], '""')
                self.assertEqual(frost["cells"]["note"]["state"], "empty")
                schemas, tables, _ = load_sources(root)
                fireball_row = next(row for row in tables["skills"].rows if row["name"].value == "fireball")
                present, effective = effective_value(
                    fireball_row["note"],
                    next(col for col in schemas["skills"]["columns"] if col["name"] == "note"),
                )
                self.assertEqual(fireball["cells"]["note"]["effective"], effective if present else None)
                export = export_repository(root, root / "out")
                server = json.loads((root / "out" / "server" / "skills.json").read_text(encoding="utf-8"))
                exported = next(row for row in server["rows"] if row["name"] == "fireball")
                self.assertEqual(fireball["cells"]["damage"]["effective"], exported["damage"])
                self.assertEqual(export["targets"], ["S", "C", "V"])
            finally:
                _stop(host)


class OpenPolicyTests(unittest.TestCase):
    def test_dirty_tree_rejected_or_commit_disabled(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            (root / "tables" / "skills.txt").write_text(
                (root / "tables" / "skills.txt").read_text(encoding="utf-8").replace("120", "122"),
                encoding="utf-8",
            )
            blocked = subprocess.run(
                [sys.executable, str(CLI), "serve", "--no-open", "--port", "0", "--root", str(root)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=10,
            )
            self.assertEqual(blocked.returncode, 3, blocked.stdout + blocked.stderr)
            self.assertIn("WORKING_TREE_DIRTY", blocked.stdout + blocked.stderr)
            _write_settings(root, {"openPolicy": {"allowDirtyWorkingTree": True}})
            host = _start(root)
            try:
                status, session, _ = _request(host, "GET", "/api/session")
                self.assertEqual(status, 200, session)
                self.assertTrue(session["revision"]["dirty"])
                self.assertFalse(session["capabilities"]["commit"])
            finally:
                _stop(host)
            _write_settings(root, {"vcs": "none", "openPolicy": {"allowDirtyWorkingTree": False}})
            host = _start(root)
            try:
                status, session, _ = _request(host, "GET", "/api/session")
                self.assertEqual(status, 200, session)
                self.assertEqual(session["settings"]["vcs"], "none")
                self.assertFalse(session["capabilities"]["commit"])
            finally:
                _stop(host)


class SseTests(unittest.TestCase):
    def test_source_change_emits_repo_revision_changed_after_fingerprint(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            host = _start(root)
            try:
                status, session, _ = _request(host, "GET", "/api/session")
                skills_fp = next(item["sourceFingerprint"] for item in session["tables"] if item["name"] == "skills")
                conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=8)
                conn.request(
                    "GET",
                    "/api/events",
                    headers={
                        "Authorization": f"Bearer {host.token}",
                        "Host": f"127.0.0.1:{host.port}",
                        "Accept": "text/event-stream",
                    },
                )
                response = conn.getresponse()
                self.assertEqual(response.status, 200)
                self.assertIn("text/event-stream", response.getheader("Content-Type", ""))
                (root / "tables" / "skills.txt").write_text(
                    (root / "tables" / "skills.txt").read_text(encoding="utf-8").replace("120", "123"),
                    encoding="utf-8",
                )
                deadline = time.time() + 5
                chunks = b""
                while time.time() < deadline and b"data:" not in chunks:
                    line = response.fp.readline()
                    if not line:
                        break
                    chunks += line
                while time.time() < deadline and not chunks.endswith(b"\n\n"):
                    line = response.fp.readline()
                    if not line:
                        break
                    chunks += line
                text = chunks.decode("utf-8", errors="replace")
                self.assertIn("repo_revision_changed", text)
                self.assertIn("skills", text)
                after = source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")
                self.assertNotEqual(after, skills_fp)
                self.assertIn(after, text)
            finally:
                _stop(host)


if __name__ == "__main__":
    unittest.main()

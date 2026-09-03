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

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.history import table_history
from lumio_config.editor.server import create_server


ROOT = Path(__file__).resolve().parents[1]
HISTORY_KEYS = {"revision", "message", "time", "author", "cells", "created", "deleted", "schemaChanged"}
CELL_KEYS = {"row", "rowId", "column", "from", "to"}


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")
    if (ROOT / ".lumio").exists():
        shutil.copytree(ROOT / ".lumio", dst / ".lumio")


def _git(root: Path, *argv: str) -> str:
    done = subprocess.run(["git", *argv], cwd=root, check=True, capture_output=True, text=True)
    return done.stdout


def _git_init(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "editor@test"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Editor Test"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True, text=True)


def _write_settings(root: Path, payload: dict) -> None:
    path = root / ".lumio" / "local.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _start(root: Path):
    host = create_server(root, 0, False)
    thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
    thread.start()
    host.thread = thread
    return host


def _request(host, method: str, path: str) -> tuple[int, dict]:
    conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=30)
    headers = {"Authorization": f"Bearer {host.token}", "Host": f"127.0.0.1:{host.port}"}
    conn.request(method, path, headers=headers)
    response = conn.getresponse()
    raw = response.read()
    conn.close()
    body: dict = json.loads(raw.decode("utf-8")) if raw else {}
    return response.status, body


def _apply(host, patch: dict) -> dict:
    conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=30)
    payload = json.dumps(patch).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {host.token}",
        "Host": f"127.0.0.1:{host.port}",
        "Content-Type": "application/json",
    }
    conn.request("POST", "/api/patch/apply", body=payload, headers=headers)
    response = conn.getresponse()
    raw = response.read()
    conn.close()
    body = json.loads(raw.decode("utf-8")) if raw else {}
    assert response.status == 200 and body.get("ok"), body
    return body


class TableHistoryGitTests(unittest.TestCase):
    def _fixture(self, root: Path) -> str:
        _copy_repo(root)
        _write_settings(root, {"vcs": "git", "submit": {"autoCommit": True, "autoExport": False}})
        _git_init(root)
        return _git(root, "rev-parse", "HEAD").strip()

    def test_history_lists_cell_created_deleted_and_rename_diffs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base_revision = self._fixture(root)
            host = _start(root)
            try:
                status, session = _request(host, "GET", "/api/session")
                self.assertEqual(status, 200, session)
                self.assertEqual(session["capabilities"]["history"], True)

                first = _apply(
                    host,
                    {
                        "table": "skills",
                        "ops": [
                            {"op": "update", "name": "fireball", "set": {"damage": 130}, "expect": {"damage": "120"}},
                            {"op": "rename", "name": "frostbolt", "to": "frost_bolt", "expect": {"name": "frostbolt"}},
                            {
                                "op": "create",
                                "name": "ice_lance",
                                "draftRowKey": "draft:ice1",
                                "set": {
                                    "display_name": "Ice Lance",
                                    "effect_id": "chill",
                                    "damage": 40,
                                    "cooldown_frames": 60,
                                    "icon": "fx_ice_lance",
                                },
                            },
                        ],
                    },
                )
                ice_id = str(first["result"]["assignedIds"]["draft:ice1"])
                first_revision = first["result"]["vcs"]["id"]
                second = _apply(
                    host,
                    {
                        "table": "skills",
                        "ops": [{"op": "delete", "name": "ice_lance", "expect": {"id": ice_id}}],
                    },
                )
                head_revision = second["result"]["vcs"]["id"]

                status, body = _request(host, "GET", "/api/tables/skills/history?limit=20")
                self.assertEqual(status, 200, body)
                self.assertEqual(set(body), {"items"})
                items = body["items"]
                self.assertEqual([item["revision"] for item in items], [head_revision, first_revision, base_revision])
                for item in items:
                    self.assertEqual(set(item), HISTORY_KEYS)
                    for cell in item["cells"]:
                        self.assertEqual(set(cell), CELL_KEYS)
                    self.assertEqual(item["author"], "Editor Test")
                    self.assertIn("T", item["time"])

                top, middle, base = items
                self.assertFalse(top["schemaChanged"])
                self.assertEqual(top["deleted"], [ice_id])
                self.assertEqual(top["created"], [])
                self.assertEqual(top["cells"], [])
                self.assertTrue(top["message"].startswith("config(skills):"))

                self.assertFalse(middle["schemaChanged"])
                self.assertTrue(middle["message"].startswith("config(skills):"))
                self.assertEqual(middle["deleted"], [])
                self.assertEqual(middle["created"], [ice_id])
                cells = {(cell["rowId"], cell["column"]): cell for cell in middle["cells"]}
                self.assertEqual(set(cells), {("40001", "damage"), ("40002", "name")})
                damage = cells[("40001", "damage")]
                self.assertEqual(damage["row"], "fireball")
                self.assertEqual(damage["from"], "120")
                self.assertEqual(damage["to"], "130")
                rename = cells[("40002", "name")]
                self.assertEqual(rename["row"], "frost_bolt")
                self.assertEqual(rename["from"], "frostbolt")
                self.assertEqual(rename["to"], "frost_bolt")

                self.assertIn("40001", base["created"])
                self.assertIn("40002", base["created"])

                status, body = _request(host, "GET", f"/api/tables/skills/history?since={first_revision}")
                self.assertEqual(status, 200, body)
                self.assertEqual([item["revision"] for item in body["items"]], [head_revision])

                status, body = _request(host, "GET", "/api/tables/skills/history?since=" + "0" * 40)
                self.assertEqual(status, 200, body)
                self.assertEqual(body["items"], [])

                direct = table_history(host.session, "skills", first_revision, 5)
                self.assertEqual([item["revision"] for item in direct], [head_revision])
            finally:
                host.shutdown()

    def test_limit_validation_cap_and_unknown_table(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self._fixture(root)
            host = _start(root)
            try:
                status, body = _request(host, "GET", "/api/tables/skills/history?limit=abc")
                self.assertEqual(status, 422, body)
                self.assertEqual(body["code"], "BAD_LIMIT")
                self.assertEqual(body["errors"], [])
                status, body = _request(host, "GET", "/api/tables/skills/history?limit=0")
                self.assertEqual(status, 422, body)
                self.assertEqual(body["code"], "BAD_LIMIT")
                status, body = _request(host, "GET", "/api/tables/skills/history?limit=-3")
                self.assertEqual(status, 422, body)
                status, body = _request(host, "GET", "/api/tables/skills/history?limit=500")
                self.assertEqual(status, 200, body)
                self.assertEqual(len(body["items"]), 1)
                status, body = _request(host, "GET", "/api/tables/skills/history?limit=1")
                self.assertEqual(status, 200, body)
                self.assertEqual(len(body["items"]), 1)
                status, body = _request(host, "GET", "/api/tables/skills/history")
                self.assertEqual(status, 200, body)
                self.assertEqual(len(body["items"]), 1)

                status, body = _request(host, "GET", "/api/tables/nope/history")
                self.assertEqual(status, 404, body)
                self.assertEqual(body["code"], "UNKNOWN_TABLE")
            finally:
                host.shutdown()

    def test_schema_change_commit_marks_schema_changed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self._fixture(root)
            host = _start(root)
            try:
                _apply(host, {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"damage": 130}}]})
                schema_path = root / "schemas" / "skills.json"
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
                damage_column = next(column for column in schema["columns"] if column["name"] == "damage")
                damage_column["minimum"] = 5
                schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
                table_path = root / "tables" / "skills.txt"
                table_path.write_text(table_path.read_text(encoding="utf-8").replace("130", "135"), encoding="utf-8")
                _git(root, "add", "-A")
                _git(root, "commit", "-m", "schema(skills): tighten damage minimum")

                status, body = _request(host, "GET", "/api/tables/skills/history")
                self.assertEqual(status, 200, body)
                top = body["items"][0]
                self.assertTrue(top["schemaChanged"])
                self.assertEqual(top["cells"], [])
                below = body["items"][1]
                self.assertFalse(below["schemaChanged"])
                self.assertTrue(below["cells"])
            finally:
                host.shutdown()


class HistoryCapabilityTests(unittest.TestCase):
    def test_none_vcs_history_empty_and_capability_false(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _write_settings(root, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": False}})
            host = _start(root)
            try:
                status, session = _request(host, "GET", "/api/session")
                self.assertEqual(status, 200, session)
                self.assertEqual(session["capabilities"]["history"], False)
                status, body = _request(host, "GET", "/api/tables/skills/history")
                self.assertEqual(status, 200, body)
                self.assertEqual(body["items"], [])
            finally:
                host.shutdown()

    def test_svn_vcs_history_empty_and_capability_false(self):
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
                "    sys.stdout.write('')\n"
                "elif args[:1] == ['info']:\n"
                "    sys.stdout.write('17\\n')\n",
                encoding="utf-8",
            )
            (bin_dir / "svn.cmd").write_text(f'@echo off\r\n"{sys.executable}" "{stub}" %*\r\n', encoding="utf-8")
            unix = bin_dir / "svn"
            unix.write_text(f"#!{sys.executable}\n" + stub.read_text(encoding="utf-8"), encoding="utf-8")
            unix.chmod(0o755)
            _write_settings(root, {"vcs": "svn"})
            original = os.environ.get("PATH")
            os.environ["PATH"] = str(bin_dir) + os.pathsep + (original or "")
            try:
                host = _start(root)
                try:
                    status, session = _request(host, "GET", "/api/session")
                    self.assertEqual(status, 200, session)
                    self.assertEqual(session["capabilities"]["history"], False)
                    status, body = _request(host, "GET", "/api/tables/skills/history")
                    self.assertEqual(status, 200, body)
                    self.assertEqual(body["items"], [])
                finally:
                    host.shutdown()
            finally:
                if original is None:
                    del os.environ["PATH"]
                else:
                    os.environ["PATH"] = original


if __name__ == "__main__":
    unittest.main()

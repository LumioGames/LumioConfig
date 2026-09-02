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

from lumio_config.editor.drafts import DraftStore, DraftVersionConflict
from lumio_config.editor.server import create_server


ROOT = Path(__file__).resolve().parents[1]


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")
    if (ROOT / ".lumio").exists():
        shutil.copytree(ROOT / ".lumio", dst / ".lumio")


def _git_init(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "d@t"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "d"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True, text=True)


def _start(root: Path):
    host = create_server(root, 0, False)
    thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
    thread.start()
    return host


def _request(host, method: str, path: str, body: dict | None = None) -> tuple[int, dict | str]:
    conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=5)
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
    if not raw:
        return response.status, {}
    try:
        return response.status, json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return response.status, raw.decode("utf-8")


class DraftStoreTests(unittest.TestCase):
    def test_save_increments_version_and_conflict_leaves_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            store = DraftStore(root)
            first = store.save("skills", {"baseFingerprint": "abc", "rows": {"40001": {"damage": {"state": "value", "raw": "130"}}}}, 0)
            self.assertEqual(first, 1)
            loaded = store.load("skills")
            self.assertEqual(loaded["draftVersion"], 1)
            self.assertEqual(loaded["table"], "skills")
            self.assertIn("savedAt", loaded)
            with self.assertRaises(DraftVersionConflict) as ctx:
                store.save("skills", {"rows": {}}, 0)
            self.assertEqual(ctx.exception.current, 1)
            self.assertEqual(store.load("skills")["draftVersion"], 1)
            store.delete("skills")
            self.assertIsNone(store.load("skills"))

    def test_locked_saves_conflict_instead_of_double_write(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            store = DraftStore(root)
            store.save("skills", {"rows": {}}, 0)
            errors: list[BaseException] = []

            def writer(expected: int) -> None:
                try:
                    store.save("skills", {"rows": {"x": {}}}, expected)
                except BaseException as exc:
                    errors.append(exc)

            t1 = threading.Thread(target=writer, args=(1,))
            t2 = threading.Thread(target=writer, args=(1,))
            t1.start()
            t2.start()
            t1.join()
            t2.join()
            loaded = store.load("skills")
            self.assertEqual(loaded["draftVersion"], 2)
            self.assertTrue(any(isinstance(item, DraftVersionConflict) for item in errors))

    def test_replace_failure_keeps_previous_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            store = DraftStore(root)
            store.save("skills", {"rows": {}}, 0)
            path = root / ".lumio" / "drafts" / "skills.json"
            before = path.read_bytes()

            def boom(src: str, dst: str) -> None:
                raise OSError("replace failed")

            with patch("lumio_config.editor.drafts.os.replace", boom):
                with self.assertRaises(OSError):
                    store.save("skills", {"rows": {"x": {}}}, 1)
            self.assertEqual(path.read_bytes(), before)


class DraftApiTests(unittest.TestCase):
    def test_http_draft_roundtrip_conflict_and_local_settings(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            _git_init(root)
            host = _start(root)
            try:
                status, body = _request(host, "GET", "/api/drafts/skills")
                self.assertEqual(status, 404)
                self.assertEqual(body["code"], "NOT_FOUND")
                status, body = _request(
                    host,
                    "PUT",
                    "/api/drafts/skills",
                    {
                        "expectedDraftVersion": 0,
                        "baseFingerprint": "fp1",
                        "rows": {"40001": {"damage": {"state": "value", "raw": "130"}}},
                        "renamed": {},
                        "deleted": [],
                    },
                )
                self.assertEqual(status, 200, body)
                self.assertEqual(body["draftVersion"], 1)
                status, draft = _request(host, "GET", "/api/drafts/skills")
                self.assertEqual(status, 200)
                self.assertEqual(draft["draftVersion"], 1)
                self.assertEqual(draft["rows"]["40001"]["damage"]["raw"], "130")
                self.assertNotIn("expectedDraftVersion", draft)
                status, body = _request(
                    host,
                    "PUT",
                    "/api/drafts/skills",
                    {"expectedDraftVersion": 0, "rows": {}},
                )
                self.assertEqual(status, 409)
                self.assertEqual(body["code"], "DRAFT_VERSION_CONFLICT")
                status, _ = _request(host, "DELETE", "/api/drafts/skills")
                self.assertEqual(status, 204)
                status, _ = _request(host, "GET", "/api/drafts/skills")
                self.assertEqual(status, 404)
                status, body = _request(
                    host,
                    "PUT",
                    "/api/settings/local",
                    {"submit": {"autoCommit": False}},
                )
                self.assertEqual(status, 200, body)
                status, session = _request(host, "GET", "/api/session")
                self.assertFalse(session["settings"]["submit"]["autoCommit"])
                local = json.loads((root / ".lumio" / "local.json").read_text(encoding="utf-8"))
                self.assertFalse(local["submit"]["autoCommit"])
                status, body = _request(host, "PUT", "/api/drafts/foo..bar", {"expectedDraftVersion": 0, "rows": {}})
                self.assertEqual(status, 404)
            finally:
                host.shutdown()

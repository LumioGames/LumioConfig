import http.client
import json
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.server import create_server

# Importing the module registers its extension route via server.register().
# The production mount line lives in server.py and is added by the main loop.
import lumio_config.editor.source_view  # noqa: E402,F401

ROOT = Path(__file__).resolve().parents[1]
MAX_SOURCE_BYTES = 2 * 1024 * 1024
RESPONSE_KEYS = {"table", "kind", "path", "text", "bytes"}
# Files planted outside tables/ and schemas/; no response may ever leak them.
ROOT_SECRET = b"ROOT-SECRET-4b7d-do-not-leak"
PARENT_SECRET = b"OUTSIDE-SECRET-4b7d-do-not-leak"


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")
    if (ROOT / ".lumio").exists():
        shutil.copytree(ROOT / ".lumio", dst / ".lumio")


def _write_settings(root: Path, payload: dict) -> None:
    path = root / ".lumio" / "local.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _fixture(root: Path) -> None:
    """Repo copy + auth/traversal decoys.

    - root/secret.txt: target for tables/../secret.txt inside the repo.
    - root.parent/outside-secret.txt: target for tables/../../outside-secret.txt.
    - tables/orphan.txt: a table file that exists on disk but is not loaded
      (no schemas/orphan.json -> load_sources ignores it).
    """
    _copy_repo(root)
    (root / "secret.txt").write_bytes(ROOT_SECRET + b"\n")
    (root.parent / "outside-secret.txt").write_bytes(PARENT_SECRET + b"\n")
    (root / "tables" / "orphan.txt").write_text("orphan-payload-5c1e\n", encoding="utf-8")
    _write_settings(root, {"vcs": "none", "submit": {"autoCommit": False, "autoExport": False}})


def _start(root: Path):
    host = create_server(root, 0, False)
    thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
    thread.start()
    host.thread = thread
    return host


def _get(host, path, token="valid", host_header=None):
    headers = {}
    if host_header is not None:
        headers["Host"] = host_header
    if token == "valid":
        headers["Authorization"] = f"Bearer {host.token}"
    elif token is not None:
        headers["Authorization"] = token
    conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=30)
    conn.request("GET", path, headers=headers)
    response = conn.getresponse()
    raw = response.read()
    conn.close()
    body = json.loads(raw.decode("utf-8")) if raw else {}
    return response.status, body, raw


class _ServerTestCase(unittest.TestCase):
    def setUp(self) -> None:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / "repo"
        _fixture(self.root)

    def _server(self):
        host = _start(self.root)
        self.addCleanup(host.shutdown)
        return host

    def assertNoOutsideBytes(self, raw: bytes) -> None:
        self.assertNotIn(ROOT_SECRET, raw)
        self.assertNotIn(PARENT_SECRET, raw)


class SourceViewContentTests(_ServerTestCase):
    """S01: both kinds return byte-identical content with correct path/bytes."""

    def test_kind_table_returns_byte_identical_content(self):
        host = self._server()
        raw = (self.root / "tables" / "skills.txt").read_bytes()
        status, body, _ = _get(host, "/api/tables/skills/source?kind=table")
        self.assertEqual(status, 200, body)
        self.assertEqual(set(body), RESPONSE_KEYS)
        self.assertEqual(body["table"], "skills")
        self.assertEqual(body["kind"], "table")
        self.assertEqual(body["path"], "tables/skills.txt")
        self.assertEqual(body["bytes"], len(raw))
        self.assertEqual(body["text"].encode("utf-8"), raw)

    def test_kind_schema_returns_byte_identical_content(self):
        host = self._server()
        raw = (self.root / "schemas" / "skills.json").read_bytes()
        status, body, _ = _get(host, "/api/tables/skills/source?kind=schema")
        self.assertEqual(status, 200, body)
        self.assertEqual(set(body), RESPONSE_KEYS)
        self.assertEqual(body["table"], "skills")
        self.assertEqual(body["kind"], "schema")
        self.assertEqual(body["path"], "schemas/skills.json")
        self.assertEqual(body["bytes"], len(raw))
        self.assertEqual(body["text"].encode("utf-8"), raw)


class SourceViewBoundaryTests(_ServerTestCase):
    """S02: nine attack inputs, none may read outside tables/ and schemas/."""

    def test_dotdot_in_table_name_is_rejected(self):
        host = self._server()
        for path in (
            "/api/tables/..%2Fsecret.txt/source?kind=table",  # -> tables/../secret.txt
            "/api/tables/..%2F..%2Foutside-secret.txt/source?kind=table",  # escapes root
            "/api/tables/../source?kind=table",  # bare ".." still matches the route
            "/api/tables/%252e%252e%252fsecret/source?kind=table",  # double-encoded
        ):
            with self.subTest(path=path):
                status, body, raw = _get(host, path)
                self.assertEqual(status, 404, (path, body))
                self.assertEqual(body.get("code"), "NOT_FOUND", body)
                self.assertNoOutsideBytes(raw)

    def test_urlencoded_dotdot_slash_is_rejected(self):
        host = self._server()
        for path in (
            "/api/tables/%2e%2e%2fsecret/source?kind=table",
            "/api/tables/%2E%2E%2Fsecret.txt/source?kind=table",
            "/api/tables/%2e%2e%2f%2e%2e%2foutside-secret.txt/source?kind=table",
        ):
            with self.subTest(path=path):
                status, body, raw = _get(host, path)
                self.assertEqual(status, 404, (path, body))
                self.assertEqual(body.get("code"), "NOT_FOUND", body)
                self.assertNoOutsideBytes(raw)

    def test_absolute_path_is_rejected(self):
        host = self._server()
        status, body, raw = _get(host, "/api/tables/C:%2FWindows%2Fwin.ini/source?kind=table")
        self.assertEqual(status, 404, body)
        self.assertNoOutsideBytes(raw)
        status, body, raw = _get(host, "/api/tables/skills/source?kind=/etc/passwd")
        self.assertEqual(status, 400, body)
        self.assertEqual(body.get("code"), "BAD_REQUEST", body)
        self.assertNoOutsideBytes(raw)
        status, body, raw = _get(host, "/api/tables/skills/source?kind=..%2f..%2fetc%2fpasswd")
        self.assertEqual(status, 400, body)
        self.assertEqual(body.get("code"), "BAD_REQUEST", body)
        self.assertNoOutsideBytes(raw)

    def test_invalid_kind_is_rejected(self):
        host = self._server()
        for path in (
            "/api/tables/skills/source?kind=exe",
            "/api/tables/skills/source?kind=",
            "/api/tables/skills/source",
        ):
            with self.subTest(path=path):
                status, body, raw = _get(host, path)
                self.assertEqual(status, 400, (path, body))
                self.assertEqual(body.get("code"), "BAD_REQUEST", body)
                self.assertNoOutsideBytes(raw)

    def test_unknown_table_is_rejected(self):
        host = self._server()
        status, body, raw = _get(host, "/api/tables/nope/source?kind=table")
        self.assertEqual(status, 404, body)
        self.assertEqual(body.get("code"), "UNKNOWN_TABLE", body)
        self.assertNoOutsideBytes(raw)

    def test_existing_but_unloaded_table_is_rejected(self):
        host = self._server()
        self.assertTrue((self.root / "tables" / "orphan.txt").is_file())
        status, body, raw = _get(host, "/api/tables/orphan/source?kind=table")
        self.assertEqual(status, 404, body)
        self.assertEqual(body.get("code"), "UNKNOWN_TABLE", body)
        self.assertNotIn(b"orphan-payload-5c1e", raw)
        self.assertNoOutsideBytes(raw)
        status, body, raw = _get(host, "/api/tables/orphan/source?kind=schema")
        self.assertEqual(status, 404, body)
        self.assertEqual(body.get("code"), "UNKNOWN_TABLE", body)
        self.assertNoOutsideBytes(raw)

    def test_missing_token_is_rejected(self):
        host = self._server()
        status, body, raw = _get(host, "/api/tables/skills/source?kind=table", token=None)
        self.assertEqual(status, 401, body)
        self.assertEqual(body.get("code"), "UNAUTHORIZED", body)
        self.assertNoOutsideBytes(raw)

    def test_wrong_token_is_rejected(self):
        host = self._server()
        status, body, raw = _get(host, "/api/tables/skills/source?kind=table", token="Bearer not-the-token")
        self.assertEqual(status, 401, body)
        self.assertEqual(body.get("code"), "UNAUTHORIZED", body)
        self.assertNoOutsideBytes(raw)

    def test_non_loopback_host_header_is_rejected(self):
        host = self._server()
        status, body, raw = _get(host, "/api/tables/skills/source?kind=table", host_header="attacker.example:9999")
        self.assertEqual(status, 403, body)
        self.assertEqual(body.get("code"), "FORBIDDEN_HOST", body)
        self.assertNoOutsideBytes(raw)


class SourceViewSizeLimitTests(_ServerTestCase):
    def _write_oversized_fixtures(self) -> None:
        source = (self.root / "tables" / "skills.txt").read_text(encoding="utf-8")
        lines = source.splitlines()
        header_index = next(index for index, line in enumerate(lines) if line.startswith("|"))
        header = lines[header_index]
        separator = lines[header_index + 1]
        columns = [cell.strip() for cell in header.strip("|").split("|")]
        cells = []
        for index, column in enumerate(columns):
            if column == "id":
                cells.append(str(900000 + index))
            elif column == "name":
                cells.append(f"big_{index}")
            else:
                cells.append("x" * 240)
        row = "| " + " | ".join(cells) + " |"
        count = MAX_SOURCE_BYTES // len(row.encode("utf-8")) + 2
        big_text = "\n".join(["table: big", "schema: schemas/big.json", "", header, separator] + [row] * count) + "\n"
        (self.root / "tables" / "big.txt").write_text(big_text, encoding="utf-8", newline="\n")
        schema = json.loads((self.root / "schemas" / "skills.json").read_text(encoding="utf-8"))
        schema["table"] = "big"
        (self.root / "schemas" / "big.json").write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")

        large_schema = json.loads((self.root / "schemas" / "skills.json").read_text(encoding="utf-8"))
        large_schema["table"] = "large"
        large_schema["description"] = "L" * (MAX_SOURCE_BYTES + 128)
        (self.root / "schemas" / "large.json").write_text(json.dumps(large_schema, indent=2), encoding="utf-8")
        large_text = "\n".join(["table: large", "schema: schemas/large.json", "", header, separator, row]) + "\n"
        (self.root / "tables" / "large.txt").write_text(large_text, encoding="utf-8", newline="\n")

    def test_oversized_file_returns_payload_too_large(self):
        self._write_oversized_fixtures()
        self.assertGreater((self.root / "tables" / "big.txt").stat().st_size, MAX_SOURCE_BYTES)
        self.assertGreater((self.root / "schemas" / "large.json").stat().st_size, MAX_SOURCE_BYTES)
        host = self._server()
        # The tables must be loaded, otherwise the 413 would mask a 404.
        for name in ("big", "large"):
            status, _, _ = _get(host, f"/api/tables/{name}")
            self.assertEqual(status, 200, name)
        status, body, raw = _get(host, "/api/tables/big/source?kind=table")
        self.assertEqual(status, 413, body)
        self.assertEqual(body.get("code"), "PAYLOAD_TOO_LARGE", body)
        self.assertLess(len(raw), 64 * 1024)
        self.assertNoOutsideBytes(raw)
        status, body, raw = _get(host, "/api/tables/large/source?kind=schema")
        self.assertEqual(status, 413, body)
        self.assertEqual(body.get("code"), "PAYLOAD_TOO_LARGE", body)
        self.assertLess(len(raw), 64 * 1024)
        self.assertNoOutsideBytes(raw)


if __name__ == "__main__":
    unittest.main()

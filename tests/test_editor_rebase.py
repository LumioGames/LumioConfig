import json
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.drafts import DraftStore
from lumio_config.editor.server import create_server
from lumio_config.editor.session import Session
from lumio_config.editor.settings import load_settings
from lumio_config.editor.vcs import make_adapter
from lumio_config.fingerprint import source_fingerprint
from lumio_config.patch import apply_patch


ROOT = Path(__file__).resolve().parents[1]


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _session(root: Path) -> Session:
    settings = load_settings(root)
    adapter = make_adapter(root, settings)
    return Session(root, settings, adapter, commit_allowed=False)


def _fp(root: Path) -> str:
    return source_fingerprint(root / "tables" / "skills.txt", root / "schemas" / "skills.json")


def _draft(root: Path, rows: dict, version: int = 0, **extra) -> tuple[DraftStore, dict, int]:
    store = DraftStore(root)
    payload = {"table": "skills", "baseFingerprint": _fp(root), "rows": rows, **extra}
    version = store.save("skills", payload, version)
    loaded = store.load("skills")
    assert loaded is not None
    return store, loaded, version


def _apply(root: Path, ops: list[dict]) -> None:
    apply_patch(root, {"table": "skills", "ops": ops})


class RebaseDraftTests(unittest.TestCase):
    def test_a_a_b_keeps_draft_and_advances_fingerprint(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            before = _fp(root)
            store, draft, version = _draft(root, {"40001": {"damage": {"state": "value", "raw": "130"}}})
            _apply(root, [{"op": "update", "name": "frostbolt", "set": {"display_name": "Frost"}}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(result.ok, result.conflicts)
            self.assertEqual(result.conflicts, [])
            self.assertNotEqual(result.base_fingerprint, before)
            self.assertEqual(result.draft["baseFingerprint"], result.base_fingerprint)
            self.assertEqual(result.draft["rows"]["40001"]["damage"]["raw"], "130")
            self.assertGreater(result.draft_version, version)
            self.assertGreater(result.merged, 0)
            loaded = store.load("skills")
            self.assertEqual(loaded["draftVersion"], result.draft_version)
            self.assertEqual(loaded["baseFingerprint"], result.base_fingerprint)

    def test_a_b_b_drops_the_cell(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, _ = _draft(root, {"40001": {"damage": {"state": "value", "raw": "130"}}})
            _apply(root, [{"op": "update", "name": "fireball", "set": {"damage": 130}}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(result.ok, result.conflicts)
            self.assertNotIn("damage", result.draft["rows"].get("40001", {}))

    def test_a_b_a_drops_the_cell_keeping_warehouse(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, _ = _draft(root, {"40001": {"damage": {"state": "value", "raw": "120"}}})
            _apply(root, [{"op": "update", "name": "fireball", "set": {"damage": 140}}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(result.ok, result.conflicts)
            self.assertNotIn("damage", result.draft["rows"].get("40001", {}))

    def test_a_b_c_conflicts_stale_baseline(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, version = _draft(root, {"40001": {"damage": {"state": "value", "raw": "130"}}})
            _apply(root, [{"op": "update", "name": "fireball", "set": {"damage": 140}}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertFalse(result.ok)
            self.assertTrue(any(item.get("code") == "STALE_BASELINE" for item in result.conflicts))
            conflict = next(item for item in result.conflicts if item.get("code") == "STALE_BASELINE")
            self.assertEqual(conflict["rowId"], "40001")
            self.assertEqual(conflict["column"], "damage")
            self.assertEqual(conflict["base"], "120")
            self.assertEqual(conflict["current"], "140")
            self.assertEqual(conflict["draft"], "130")
            self.assertEqual(store.load("skills")["draftVersion"], version)

    def test_four_state_tokens_are_not_collapsed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, _ = _draft(root, {"40001": {"icon": {"state": "null", "raw": "null"}}})
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(result.ok, result.conflicts)
            self.assertEqual(result.draft["rows"]["40001"]["icon"]["raw"], "null")

    def test_warehouse_deleted_row_conflicts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            seeded = apply_patch(
                root,
                {
                    "table": "skills",
                    "ops": [
                        {
                            "op": "create",
                            "name": "temp_row",
                            "set": {
                                "display_name": "Temp",
                                "effect_id": "chill",
                                "damage": 1,
                                "cooldown_frames": 1,
                                "icon": "fx_temp",
                            },
                        }
                    ],
                },
            )
            assigned = str(seeded.assigned_ids["temp_row"])
            session.reload_from_disk()
            store, draft, _ = _draft(root, {assigned: {"damage": {"state": "value", "raw": "9"}}})
            _apply(root, [{"op": "delete", "name": "temp_row", "expect": {"id": assigned}}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(any(item.get("code") == "DELETED_ROW_CONFLICT" for item in result.conflicts), result.conflicts)

    def test_rename_still_locates_by_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, _ = _draft(root, {"40001": {"damage": {"state": "value", "raw": "130"}}})
            _apply(root, [{"op": "rename", "name": "fireball", "to": "fire_ball"}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(result.ok, result.conflicts)
            self.assertEqual(result.draft["rows"]["40001"]["damage"]["raw"], "130")

    def test_draft_delete_conflicts_when_warehouse_changed_row(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, _ = _draft(root, {}, deleted=["40002"])
            _apply(root, [{"op": "update", "name": "frostbolt", "set": {"display_name": "Frosty"}}])
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertTrue(any(item.get("code") == "STALE_BASELINE" for item in result.conflicts), result.conflicts)

    def test_schema_changed_does_not_write_draft(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            session = _session(root)
            store, draft, version = _draft(root, {"40001": {"damage": {"state": "value", "raw": "130"}}})
            schema = json.loads((root / "schemas" / "skills.json").read_text(encoding="utf-8"))
            schema["title"] = "skills-v2"
            (root / "schemas" / "skills.json").write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
            session.reload_from_disk()
            result = session.rebase_draft("skills", draft, store)
            self.assertFalse(result.ok)
            self.assertEqual(result.code, "SCHEMA_CHANGED")
            self.assertEqual(store.load("skills")["draftVersion"], version)


class RebaseHttpTests(unittest.TestCase):
    def test_post_rebase_advances_version(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            store, draft, version = _draft(root, {"40001": {"damage": {"state": "value", "raw": "131"}}})
            host = create_server(root, 0, False)
            thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
            thread.start()
            _apply(root, [{"op": "update", "name": "frostbolt", "set": {"display_name": "Cold"}}])
            try:
                import http.client

                conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=8)
                body = json.dumps({"expectedDraftVersion": version}).encode("utf-8")
                conn.request(
                    "POST",
                    "/api/drafts/skills/rebase",
                    body=body,
                    headers={
                        "Authorization": f"Bearer {host.token}",
                        "Host": f"127.0.0.1:{host.port}",
                        "Content-Type": "application/json",
                    },
                )
                response = conn.getresponse()
                payload = json.loads(response.read().decode("utf-8"))
                conn.close()
                self.assertEqual(response.status, 200, payload)
                self.assertTrue(payload.get("ok"), payload)
                self.assertGreater(payload.get("draftVersion", 0), version)
            finally:
                host.shutdown()

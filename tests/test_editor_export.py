import csv
import http.client
import json
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.editor.drafts import DraftStore
from lumio_config.editor.export_csv import export_tables
from lumio_config.editor.server import create_server
from lumio_config.fingerprint import source_fingerprint
from lumio_config.patch import apply_patch
from lumio_config.text_table import format_table_text, parse_table


ROOT = Path(__file__).resolve().parents[1]


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _fp(root: Path, table: str = "skills") -> str:
    return source_fingerprint(root / "tables" / f"{table}.txt", root / "schemas" / f"{table}.json")


def _read_csv(path: Path) -> list[list[str]]:
    text = path.read_bytes()
    self_bom = text.startswith(b"\xef\xbb\xbf")
    if not self_bom:
        raise AssertionError(f"{path} missing UTF-8 BOM")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.reader(handle))


class ExportTablesTests(unittest.TestCase):
    def test_csv_writes_tokens_bom_and_readme(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            out = root / "out"
            paths = export_tables(root, ["skills"], "csv", "repo", None, out)
            csv_path = out / "skills.csv"
            readme = out / "README.txt"
            self.assertIn(csv_path, paths)
            self.assertIn(readme, paths)
            rows = _read_csv(csv_path)
            self.assertEqual(rows[0][0:3], ["id", "name", "display_name"])
            fireball = next(row for row in rows[1:] if row[1] == "fireball")
            self.assertEqual(fireball[rows[0].index("damage")], "120")
            text = readme.read_text(encoding="utf-8")
            self.assertIn("GENERATED / NOT AUTHORITATIVE — do not import back", text)
            self.assertIn("source: repo", text)
            self.assertIn(_fp(root), text)

    def test_formula_injection_is_quoted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            apply_patch(root, {"table": "skills", "ops": [{"op": "update", "name": "fireball", "set": {"icon": "=1+1"}}]})
            out = root / "out"
            export_tables(root, ["skills"], "csv", "repo", None, out)
            rows = _read_csv(out / "skills.csv")
            header = rows[0]
            fireball = next(row for row in rows[1:] if row[1] == "fireball")
            self.assertEqual(fireball[header.index("icon")], "'=1+1")

    def test_draft_source_overlays_tokens(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            store = DraftStore(root)
            store.save(
                "skills",
                {
                    "table": "skills",
                    "baseFingerprint": _fp(root),
                    "rows": {"40001": {"damage": {"state": "value", "raw": "133"}}},
                },
                0,
            )
            out = root / "out"
            export_tables(root, ["skills"], "csv", "draft", None, out)
            rows = _read_csv(out / "skills.csv")
            header = rows[0]
            fireball = next(row for row in rows[1:] if row[1] == "fireball")
            self.assertEqual(fireball[header.index("damage")], "133")
            repo_rows = _read_csv(out / "skills.csv")
            export_tables(root, ["skills"], "tsv", "repo", None, out)
            tsv = (out / "skills.tsv").read_text(encoding="utf-8-sig")
            self.assertIn("120", tsv.splitlines()[1])
            self.assertNotIn("133", tsv.splitlines()[1])
            self.assertIn("source: repo", (out / "README.txt").read_text(encoding="utf-8"))

    def test_target_filter_drops_client_only_columns(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            out = root / "out"
            export_tables(root, ["skills"], "csv", "repo", ["S"], out)
            header = _read_csv(out / "skills.csv")[0]
            self.assertIn("damage", header)
            self.assertNotIn("display_name", header)
            self.assertNotIn("icon", header)

    def test_four_state_tokens_are_not_collapsed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            table_path = root / "tables" / "skills.txt"
            text = table_path.read_text(encoding="utf-8")
            table_path.write_text(text.replace("fx_fireball", "null"), encoding="utf-8")
            out = root / "out"
            export_tables(root, ["skills"], "csv", "repo", None, out)
            rows = _read_csv(out / "skills.csv")
            header = rows[0]
            fireball = next(row for row in rows[1:] if row[1] == "fireball")
            self.assertEqual(fireball[header.index("icon")], "null")

    def test_txt_repo_matches_source_tables_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            out = root / "out"
            paths = export_tables(root, ["skills", "drops", "effects"], "txt", "repo", None, out)
            for name in ("skills", "drops", "effects"):
                exported = out / f"{name}.txt"
                self.assertIn(exported, paths)
                self.assertEqual(
                    exported.read_bytes(),
                    (ROOT / "tables" / f"{name}.txt").read_bytes(),
                    f"exported {name}.txt differs from the repo source table",
                )
            readme = (out / "README.txt").read_text(encoding="utf-8")
            self.assertIn("read-only snapshot", readme)
            self.assertIn("do not copy them back over tables/", readme)
            self.assertNotIn("uncommitted draft", readme)

    def test_txt_preserves_four_state_tokens(self):
        crafted = (
            "table: skills\n"
            "schema: schemas/skills.json\n"
            "\n"
            "| id | name | display_name | effect_id | damage | cooldown_frames | icon |\n"
            "| --- | ---- | ------------ | --------- | ------ | --------------- | ---- |\n"
            "| 40001 | a | A | 50001 | 1 | 1 | @missing |\n"
            "\n"
            "| 40002 | b | B | 50001 | 2 | 2 | \"\" |\n"
            "\n"
            "| 40003 | c | C | 50001 | 3 | 3 | null |\n"
            "\n"
            "| 40004 | d | D | 50001 | 4 | 4 | @default |\n"
        )
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            table_path = root / "tables" / "skills.txt"
            canonical = format_table_text(parse_table(crafted, table_path))
            table_path.write_text(canonical, encoding="utf-8", newline="\n")
            out = root / "out"
            export_tables(root, ["skills"], "txt", "repo", None, out)
            exported = out / "skills.txt"
            self.assertEqual(exported.read_bytes(), canonical.encode("utf-8"))
            reparsed = parse_table(exported.read_text(encoding="utf-8"), exported)
            tokens = {row["name"].token(): row["icon"].token() for row in reparsed.rows}
            self.assertEqual(
                tokens,
                {"a": "@missing", "b": '""', "c": "null", "d": "@default"},
            )

    def test_txt_draft_suffix_overlay_and_readme_warning(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            store = DraftStore(root)
            store.save(
                "skills",
                {
                    "table": "skills",
                    "baseFingerprint": _fp(root),
                    "rows": {"40001": {"damage": {"state": "value", "raw": "133"}}},
                },
                0,
            )
            out = root / "out"
            paths = export_tables(root, ["skills"], "txt", "draft", None, out)
            draft_path = out / "skills.draft.txt"
            self.assertIn(draft_path, paths)
            self.assertFalse((out / "skills.txt").exists())
            text = draft_path.read_text(encoding="utf-8")
            self.assertIn("| 133 ", text)
            self.assertNotIn("| 120 ", text)
            readme = (out / "README.txt").read_text(encoding="utf-8")
            self.assertIn("read-only snapshot", readme)
            self.assertIn("uncommitted draft", readme)
            self.assertIn("does not match the repository", readme)

    def test_txt_rejects_nonempty_targets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            out = root / "out"
            with self.assertRaises(ValueError) as ctx:
                export_tables(root, ["skills"], "txt", "repo", ["S"], out)
            self.assertIn("targets", str(ctx.exception))
            self.assertFalse((out / "skills.txt").exists())


class ExportHttpTests(unittest.TestCase):
    def test_post_export_and_get_file_reject_path_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _copy_repo(root)
            host = create_server(root, 0, False)
            thread = threading.Thread(target=host.httpd.serve_forever, daemon=True)
            thread.start()
            try:
                conn = http.client.HTTPConnection("127.0.0.1", host.port, timeout=8)
                headers = {
                    "Authorization": f"Bearer {host.token}",
                    "Host": f"127.0.0.1:{host.port}",
                    "Content-Type": "application/json",
                }
                body = json.dumps({"format": "csv", "tables": ["skills"], "source": "repo"}).encode("utf-8")
                conn.request("POST", "/api/export", body=body, headers=headers)
                response = conn.getresponse()
                payload = json.loads(response.read().decode("utf-8"))
                self.assertEqual(response.status, 200, payload)
                self.assertTrue(payload.get("exportId"))
                href = payload["files"][0]["href"]
                conn.request("GET", href, headers=headers)
                file_resp = conn.getresponse()
                raw = file_resp.read()
                self.assertEqual(file_resp.status, 200)
                self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
                conn.request("GET", f"/api/exports/{payload['exportId']}/../repository.yaml", headers=headers)
                escape = conn.getresponse()
                escape.read()
                self.assertEqual(escape.status, 404)
                conn.close()
            finally:
                host.shutdown()

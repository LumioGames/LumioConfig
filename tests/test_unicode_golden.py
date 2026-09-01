import hashlib
import json
import shutil
import subprocess
import sys
import unicodedata
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.fingerprint import content_fingerprint
from lumio_config.text_table import parse_table
from lumio_config.unicode_policy import STRING_NORMALIZATION_FORM


ROOT = Path(__file__).resolve().parents[1]
VECTORS_JSON = ROOT / "testdata" / "unicode" / "vectors.json"
VECTORS_TSV = ROOT / "testdata" / "unicode" / "vectors.tsv"


def _digest_nfc_utf8(raw: bytes) -> str:
    text = raw.decode("utf-8")
    normalized = unicodedata.normalize("NFC", text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _parse_runner_output(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        name, digest = line.split()
        result[name] = digest
    return result


class UnicodeGoldenTests(unittest.TestCase):
    def test_policy_pins_nfc(self):
        self.assertEqual(STRING_NORMALIZATION_FORM, "NFC")

    def test_composed_and_decomposed_string_cells_share_content_fingerprint(self):
        schema = {
            "table": "labels",
            "idColumn": "id",
            "columns": [
                {"name": "id", "type": "u32", "required": True, "visibility": "S"},
                {"name": "name", "type": "string", "required": True, "visibility": "S"},
            ],
        }
        composed = (
            "table: labels\nschema: schemas/labels.json\n"
            "| id | name |\n| --- | --- |\n| 1 | \u00e1 |\n"
        )
        decomposed = (
            "table: labels\nschema: schemas/labels.json\n"
            "| id | name |\n| --- | --- |\n| 1 | a\u0301 |\n"
        )
        self.assertNotEqual(composed, decomposed)
        self.assertEqual(
            content_fingerprint(parse_table(composed, Path("labels.txt")), schema),
            content_fingerprint(parse_table(decomposed, Path("labels.txt")), schema),
        )

    def test_vector_pairs_collapse_under_python_nfc(self):
        payload = json.loads(VECTORS_JSON.read_text(encoding="utf-8"))
        self.assertEqual(payload["normalization"], "NFC")
        digests = {
            item["id"]: _digest_nfc_utf8(bytes.fromhex(item["utf8_hex"]))
            for item in payload["vectors"]
        }
        self.assertEqual(digests["latin-a-acute-composed"], digests["latin-a-acute-decomposed"])
        self.assertEqual(digests["hangul-ga-composed"], digests["hangul-ga-decomposed"])
        self.assertNotEqual(digests["latin-a-acute-composed"], digests["ascii-fireball"])

    def test_rust_and_csharp_runners_match_python_digests(self):
        rust_bin = ROOT / "testdata" / "unicode" / "rust" / "target" / "debug" / "unicode-golden.exe"
        if not rust_bin.exists():
            rust_bin = ROOT / "testdata" / "unicode" / "rust" / "target" / "debug" / "unicode-golden"
        csharp_dll = ROOT / "testdata" / "unicode" / "csharp" / "bin" / "Debug" / "net8.0" / "UnicodeGolden.dll"
        if not rust_bin.exists() or not csharp_dll.exists() or shutil.which("dotnet") is None:
            self.skipTest("prebuilt Unicode golden binaries are not present")
        rust_cmd = [str(rust_bin), str(VECTORS_TSV)]
        csharp_cmd = ["dotnet", "exec", str(csharp_dll), str(VECTORS_TSV)]
        payload = json.loads(VECTORS_JSON.read_text(encoding="utf-8"))
        expected = {
            item["id"]: _digest_nfc_utf8(bytes.fromhex(item["utf8_hex"]))
            for item in payload["vectors"]
        }
        rust = subprocess.run(rust_cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=20)
        csharp = subprocess.run(csharp_cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=20)
        self.assertEqual(rust.returncode, 0, rust.stdout + rust.stderr)
        self.assertEqual(csharp.returncode, 0, csharp.stdout + csharp.stderr)
        rust_digests = _parse_runner_output(rust.stdout)
        csharp_digests = _parse_runner_output(csharp.stdout)
        self.assertEqual(rust_digests, expected)
        self.assertEqual(csharp_digests, expected)
        self.assertEqual(rust_digests["latin-a-acute-composed"], rust_digests["latin-a-acute-decomposed"])
        self.assertEqual(csharp_digests["hangul-ga-composed"], csharp_digests["hangul-ga-decomposed"])


if __name__ == "__main__":
    unittest.main()

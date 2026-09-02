import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.export import ValidationFailure, export_repository
from lumio_config.fingerprint import package_fingerprint


ROOT = Path(__file__).resolve().parents[1]
LAYER_ORDER = ("engine", "platform", "server", "product", "environment")


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _write_overlay(root: Path, layer: str, table: str, body: str) -> None:
    path = root / "layers" / layer / f"{table}.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8", newline="\n")


def _write_mini_values(root: Path, wait: str = "2.5", chance: str = "5", scale: str = "1.0") -> None:
    (root / "schemas").mkdir(parents=True)
    (root / "tables").mkdir(parents=True)
    (root / "registry").mkdir(parents=True)
    (root / "schemas" / "values.json").write_text(
        json.dumps(
            {
                "table": "values",
                "idColumn": "id",
                "columns": [
                    {"name": "id", "ordinal": 0, "type": "u32", "required": True, "visibility": "SCV"},
                    {"name": "name", "ordinal": 1, "type": "string", "required": True, "visibility": "SCV"},
                    {
                        "name": "wait",
                        "ordinal": 2,
                        "type": "i32",
                        "required": True,
                        "minimum": 1,
                        "visibility": "S",
                        "unit": "seconds",
                    },
                    {
                        "name": "chance",
                        "ordinal": 3,
                        "type": "i32",
                        "required": True,
                        "minimum": 0,
                        "maximum": 1000,
                        "visibility": "S",
                        "unit": "percent",
                    },
                    {
                        "name": "scale",
                        "ordinal": 4,
                        "type": "f32",
                        "required": True,
                        "visibility": "C",
                    },
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (root / "tables" / "values.txt").write_text(
        "table: values\nschema: schemas/values.json\n"
        "| id | name | wait | chance | scale |\n"
        "| --- | --- | --- | --- | --- |\n"
        f"| 1 | demo | {wait} | {chance} | {scale} |\n",
        encoding="utf-8",
        newline="\n",
    )
    (root / "registry" / "row-ids.json").write_text(
        json.dumps({"values": {"demo": 1}, "aliases": {"values": {}}}, indent=2) + "\n",
        encoding="utf-8",
    )
    (root / "registry" / "tombstones.json").write_text("{}\n", encoding="utf-8")
    (root / "repository.yaml").write_text(
        "architecture:\n  baselineId: LGE-V1.4-2026-08-27\nsimulation:\n  tickRate: 60\n",
        encoding="utf-8",
        newline="\n",
    )


def _server_row(output: Path, table: str, index: int = 0) -> dict:
    payload = json.loads((output / "server" / f"{table}.json").read_text(encoding="utf-8"))
    return payload["rows"][index]


def _origins(output: Path) -> dict:
    return json.loads((output / "origins.json").read_text(encoding="utf-8"))


class LayerMergeTests(unittest.TestCase):
    def test_later_layer_wins_and_origins_stay_out_of_projections(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _copy_repo(root)
            _write_overlay(
                root,
                "engine",
                "skills",
                "table: skills\nschema: schemas/skills.json\n"
                "| name | damage |\n| --- | --- |\n| fireball | 200 |\n",
            )
            _write_overlay(
                root,
                "product",
                "skills",
                "table: skills\nschema: schemas/skills.json\n"
                "| name | damage |\n| --- | --- |\n| fireball | 300 |\n",
            )
            _write_overlay(
                root,
                "environment",
                "skills",
                "table: skills\nschema: schemas/skills.json\n"
                "| name | display_name |\n| --- | --- |\n| fireball | Inferno |\n",
            )
            export_repository(root, output)
            server = _server_row(output, "skills")
            client = json.loads((output / "client" / "skills.json").read_text(encoding="utf-8"))["rows"][0]
            self.assertEqual(server["damage"], 300)
            self.assertEqual(server["name"], "fireball")
            self.assertNotIn("origin", server)
            self.assertEqual(client["display_name"], "Inferno")
            self.assertNotIn("damage", client)
            origins = _origins(output)
            self.assertEqual(origins["skills"]["fireball"]["damage"], "product")
            self.assertEqual(origins["skills"]["fireball"]["display_name"], "environment")
            self.assertEqual(origins["skills"]["fireball"]["name"], "engine")
            self.assertEqual(origins["skills"]["frostbolt"]["damage"], "engine")
            self.assertEqual(LAYER_ORDER, ("engine", "platform", "server", "product", "environment"))

    def test_overlay_cannot_create_a_row(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _copy_repo(root)
            _write_overlay(
                root,
                "product",
                "skills",
                "table: skills\nschema: schemas/skills.json\n"
                "| name | damage |\n| --- | --- |\n| brand_new | 1 |\n",
            )
            with self.assertRaises(ValidationFailure) as ctx:
                export_repository(root, output)
            self.assertTrue(
                any(error["code"] == "LAYER_CREATE_FORBIDDEN" for error in ctx.exception.errors),
                ctx.exception.errors,
            )


class UnitConversionTests(unittest.TestCase):
    def test_seconds_and_percent_become_integers(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _write_mini_values(root)
            export_repository(root, output)
            row = _server_row(output, "values")
            self.assertEqual(row["wait"], 150)
            self.assertEqual(row["chance"], 50)
            self.assertIsInstance(row["wait"], int)
            self.assertIsInstance(row["chance"], int)
            client = json.loads((output / "client" / "values.json").read_text(encoding="utf-8"))["rows"][0]
            self.assertNotIn("wait", client)
            self.assertNotIn("chance", client)
            self.assertIn("scale", client)

    def test_negative_zero_float_canonicalizes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _write_mini_values(root, scale="-0.0")
            export_repository(root, output)
            client = json.loads((output / "client" / "values.json").read_text(encoding="utf-8"))["rows"][0]
            self.assertEqual(client["scale"], 0.0)
            self.assertNotIn("-0", (output / "client" / "values.json").read_text(encoding="utf-8"))


class ManifestAndHashTests(unittest.TestCase):
    def test_four_layer_manifests_and_chunk_fingerprint_equals_package(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            output = Path(temp) / "out"
            _copy_repo(root)
            result = export_repository(root, output)
            release = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(result["targets"], ["S", "C", "V"])
            self.assertEqual(set(release["targetManifests"]), {"S", "C", "V"})
            for target, relative in release["targetManifests"].items():
                target_manifest = json.loads((output / relative).read_text(encoding="utf-8"))
                self.assertEqual(target_manifest["target"], target)
                skills = next(entry for entry in target_manifest["tables"] if entry["table"] == "skills")
                self.assertEqual(len(skills["chunks"]), 1)
                chunk = skills["chunks"][0]
                payload = (output / chunk["path"]).read_bytes()
                self.assertEqual(chunk["packageFingerprint"], package_fingerprint(payload))
                self.assertEqual(chunk["packageFingerprint"], skills["packageFingerprint"])
            self.assertTrue((output / "origins.json").exists())
            self.assertTrue(any(entry["table"] == "skills" for entry in release["tables"]))

    def test_compiler_input_output_hashes_are_stable_and_scoped(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            first_out = Path(temp) / "one"
            second_out = Path(temp) / "two"
            overlay_out = Path(temp) / "overlay"
            _copy_repo(root)
            first = export_repository(root, first_out)
            second = export_repository(root, second_out)
            for key in ("compilerHash", "inputHash", "outputHash"):
                self.assertEqual(len(first[key]), 64, key)
                self.assertEqual(first[key], second[key], key)
            self.assertEqual(first_out.joinpath("origins.json").read_bytes(), second_out.joinpath("origins.json").read_bytes())
            for path in sorted(first_out.rglob("*.json")):
                other = second_out / path.relative_to(first_out)
                self.assertEqual(path.read_bytes(), other.read_bytes(), path.name)

            _write_overlay(
                root,
                "product",
                "skills",
                "table: skills\nschema: schemas/skills.json\n"
                "| name | damage |\n| --- | --- |\n| fireball | 321 |\n",
            )
            overlayed = export_repository(root, overlay_out)
            self.assertEqual(overlayed["compilerHash"], first["compilerHash"])
            self.assertNotEqual(overlayed["inputHash"], first["inputHash"])
            self.assertNotEqual(overlayed["outputHash"], first["outputHash"])
            self.assertEqual(_server_row(overlay_out, "skills")["damage"], 321)


if __name__ == "__main__":
    unittest.main()

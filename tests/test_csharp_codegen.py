import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lumio_config.cli import main as cli_main
from lumio_config.codegen.csharp import generate_csharp_readers, schema_fingerprint
from lumio_config.export import export_repository
from lumio_config.validate import load_sources


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "lumio_config.py"
SMOKE_DIR = ROOT / "tests" / "csharp-reader-smoke"
ROW_LITERALS = (
    "40001",
    "40002",
    "50001",
    "50002",
    "60001",
    "60002",
    "70001",
    "80001",
    "90001",
    "90002",
    "fireball",
    "frostbolt",
    "ember_cache",
    "1.25",
    "0.35",
)


def _copy_repo(dst: Path) -> None:
    for name in ("schemas", "tables", "registry"):
        shutil.copytree(ROOT / name, dst / name)
    if (ROOT / "layers").exists():
        shutil.copytree(ROOT / "layers", dst / "layers")
    shutil.copy(ROOT / "repository.yaml", dst / "repository.yaml")


def _export_json_bytes(root: Path, output: Path) -> dict[str, bytes]:
    export_repository(root, output)
    return {
        path.relative_to(output).as_posix(): path.read_bytes()
        for path in sorted(output.rglob("*"))
        if path.is_file()
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


class CsharpCodegenTests(unittest.TestCase):
    def test_cli_csharp_out_emits_row_and_table_without_row_literals(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "json"
            csharp = Path(temp) / "csharp"
            result = _run_cli("export", "--out", str(out), "--csharp-out", str(csharp))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("export: OK", result.stdout)
            expected = [
                "server/SkillsTable.cs",
                "client/SkillsTable.cs",
                "voxel/SkillsTable.cs",
                "server/EffectsTable.cs",
                "client/EffectsTable.cs",
                "voxel/EffectsTable.cs",
                "server/DropsTable.cs",
                "client/DropsTable.cs",
                "voxel/DropsTable.cs",
                "server/MovementTable.cs",
                "client/MovementTable.cs",
                "server/MiningTable.cs",
                "client/MiningTable.cs",
                "server/AttributesTable.cs",
                "client/AttributesTable.cs",
            ]
            for relative in expected:
                path = csharp / relative
                self.assertTrue(path.is_file(), relative)
                text = path.read_text(encoding="utf-8")
                self.assertIn("生成物不得手改", text)
                self.assertIn("schemaFingerprint:", text)
                table_name = relative.split("/")[1].replace("Table.cs", "")
                self.assertIn(f"public readonly struct {table_name}Row", text)
                self.assertIn(f"public readonly struct {table_name}Table", text)
                self.assertIn("public bool TryGet(", text)
                self.assertIn("out ", text)
                self.assertIn("public int Count", text)
                self.assertIn("IReadOnlyList<", text)
                for banned in ROW_LITERALS:
                    self.assertNotIn(banned, text, f"{relative} leaked {banned}")

            server_skills = (csharp / "server" / "SkillsTable.cs").read_text(encoding="utf-8")
            self.assertIn("namespace Lumio.Config.Generated.Server;", server_skills)
            self.assertIn("public uint Id { get; }", server_skills)
            self.assertIn("public uint EffectId { get; }", server_skills)
            self.assertIn("public int Damage { get; }", server_skills)
            self.assertNotIn("DisplayName", server_skills)
            client_skills = (csharp / "client" / "SkillsTable.cs").read_text(encoding="utf-8")
            self.assertIn("namespace Lumio.Config.Generated.Client;", client_skills)
            self.assertIn("public string DisplayName { get; }", client_skills)
            self.assertNotIn("Damage", client_skills)
            self.assertNotIn("EffectId", client_skills)

    def test_repeated_generation_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "one"
            second = Path(temp) / "two"
            json_out = Path(temp) / "json"
            first_run = _run_cli("export", "--out", str(json_out / "a"), "--csharp-out", str(first))
            second_run = _run_cli("export", "--out", str(json_out / "b"), "--csharp-out", str(second))
            self.assertEqual(first_run.returncode, 0, first_run.stdout + first_run.stderr)
            self.assertEqual(second_run.returncode, 0, second_run.stdout + second_run.stderr)
            first_files = {path.relative_to(first).as_posix(): path.read_bytes() for path in first.rglob("*.cs")}
            second_files = {path.relative_to(second).as_posix(): path.read_bytes() for path in second.rglob("*.cs")}
            self.assertEqual(first_files, second_files)

    def test_value_change_keeps_csharp_bytes_type_change_does_not(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            _copy_repo(root)
            baseline_cs = Path(temp) / "baseline"
            value_cs = Path(temp) / "value"
            type_cs = Path(temp) / "type"
            json_out = Path(temp) / "json"
            self.assertEqual(_run_cli("export", "--out", str(json_out / "b"), "--csharp-out", str(baseline_cs), root=root).returncode, 0)
            skills = (root / "tables" / "skills.txt").read_text(encoding="utf-8")
            (root / "tables" / "skills.txt").write_text(skills.replace("| 120    |", "| 121    |"), encoding="utf-8", newline="\n")
            self.assertEqual(_run_cli("export", "--out", str(json_out / "v"), "--csharp-out", str(value_cs), root=root).returncode, 0)
            baseline_files = {path.relative_to(baseline_cs).as_posix(): path.read_bytes() for path in baseline_cs.rglob("*.cs")}
            value_files = {path.relative_to(value_cs).as_posix(): path.read_bytes() for path in value_cs.rglob("*.cs")}
            self.assertEqual(baseline_files, value_files)

            schema_path = root / "schemas" / "skills.json"
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            for column in schema["columns"]:
                if column["name"] == "damage":
                    column["type"] = "i64"
            schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8", newline="\n")
            type_run = _run_cli("export", "--out", str(json_out / "t"), "--csharp-out", str(type_cs), root=root)
            self.assertEqual(type_run.returncode, 0, type_run.stdout + type_run.stderr)
            type_files = {path.relative_to(type_cs).as_posix(): path.read_bytes() for path in type_cs.rglob("*.cs")}
            self.assertNotEqual(baseline_files["server/SkillsTable.cs"], type_files["server/SkillsTable.cs"])
            self.assertIn(b"public long Damage { get; }", type_files["server/SkillsTable.cs"])
            self.assertEqual(baseline_files["server/EffectsTable.cs"], type_files["server/EffectsTable.cs"])
            self.assertEqual(baseline_files["client/SkillsTable.cs"], type_files["client/SkillsTable.cs"])

    def test_export_json_bytes_unchanged_when_csharp_out_is_set(self):
        with tempfile.TemporaryDirectory() as temp:
            json_only = Path(temp) / "json-only"
            json_with_cs = Path(temp) / "json-with-cs"
            csharp = Path(temp) / "csharp"
            without_cs = _export_json_bytes(ROOT, json_only)
            result = _run_cli("export", "--out", str(json_with_cs), "--csharp-out", str(csharp))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            with_cs = {
                path.relative_to(json_with_cs).as_posix(): path.read_bytes()
                for path in sorted(json_with_cs.rglob("*"))
                if path.is_file()
            }
            self.assertEqual(without_cs, with_cs)

    def test_schema_fingerprint_ignores_row_values_and_numeric_bounds(self):
        schemas, _tables, errors = load_sources(ROOT)
        self.assertEqual(errors, [])
        skills = schemas["skills"]
        first = schema_fingerprint(skills)
        mutated = json.loads(json.dumps(skills))
        mutated["columns"][4]["minimum"] = 99
        self.assertEqual(first, schema_fingerprint(mutated))
        mutated["columns"][4]["type"] = "i64"
        self.assertNotEqual(first, schema_fingerprint(mutated))

    def test_optional_column_emits_nullable_csharp_type(self):
        schema = {
            "table": "flags",
            "idColumn": "id",
            "columns": [
                {"name": "id", "ordinal": 0, "type": "u32", "required": True, "visibility": "SCV"},
                {"name": "name", "ordinal": 1, "type": "string", "required": True, "visibility": "SCV"},
                {"name": "note", "ordinal": 2, "type": "string", "required": False, "visibility": "S"},
                {"name": "scale", "ordinal": 3, "type": "f32", "required": False, "visibility": "S"},
            ],
        }
        files = generate_csharp_readers({"flags": schema})
        text = files["server/FlagsTable.cs"]
        self.assertIn("public string? Note { get; }", text)
        self.assertIn("public float? Scale { get; }", text)
        self.assertIn("TryGet(uint id, out FlagsRow row)", text)
        client = files["client/FlagsTable.cs"]
        self.assertNotIn("Note", client)
        self.assertNotIn("Scale", client)
        self.assertIn("public string Name { get; }", client)
        self.assertNotIn("client/MissingTable.cs", files)

    def test_custom_namespace_is_applied_per_target(self):
        with tempfile.TemporaryDirectory() as temp:
            csharp = Path(temp) / "csharp"
            json_out = Path(temp) / "json"
            result = _run_cli(
                "export",
                "--out",
                str(json_out),
                "--csharp-out",
                str(csharp),
                "--csharp-namespace",
                "Game.Tables",
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            text = (csharp / "voxel" / "DropsTable.cs").read_text(encoding="utf-8")
            self.assertIn("namespace Game.Tables.Voxel;", text)

    def test_smoke_csproj_builds_against_generated_readers(self):
        with tempfile.TemporaryDirectory() as temp:
            csharp = Path(temp) / "csharp"
            json_out = Path(temp) / "json"
            result = _run_cli("export", "--out", str(json_out), "--csharp-out", str(csharp))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            project_dir = Path(temp) / "smoke"
            shutil.copytree(
                SMOKE_DIR,
                project_dir,
                ignore=shutil.ignore_patterns("generated", "bin", "obj"),
            )
            generated = project_dir / "generated"
            shutil.copytree(csharp, generated)
            env = os.environ.copy()
            env["DOTNET_CLI_UI_LANGUAGE"] = "en"
            env["DOTNET_NOLOGO"] = "1"
            build = subprocess.run(
                ["dotnet", "build", str(project_dir / "Lumio.Config.Generated.Smoke.csproj"), "-nologo"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                env=env,
            )
            combined = build.stdout + build.stderr
            self.assertEqual(build.returncode, 0, combined)
            self.assertTrue(
                "Build succeeded" in combined or "已成功生成" in combined,
                combined,
            )

    def test_cli_module_entry_accepts_csharp_out(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "json"
            csharp = Path(temp) / "csharp"
            code = cli_main(["export", "--out", str(out), "--csharp-out", str(csharp), "--root", str(ROOT)])
            self.assertEqual(code, 0)
            self.assertTrue((csharp / "server" / "SkillsTable.cs").is_file())


class SampleTableReaderTests(unittest.TestCase):
    """Sample 消费面（R-00535 / 审计 P1-10）：步长/半径/体力/矿石有 typed Reader，数值只在 JSON。"""

    def test_sample_table_readers_match_consumed_types(self):
        schemas, _tables, errors = load_sources(ROOT)
        self.assertEqual(errors, [])
        files = generate_csharp_readers(schemas)
        movement = files["server/MovementTable.cs"]
        self.assertIn("public double StepMeters { get; }", movement)
        self.assertIn("public double SweepRadiusMeters { get; }", movement)
        self.assertIn("TryGet(uint id, out MovementRow row)", movement)
        mining = files["server/MiningTable.cs"]
        self.assertIn("public long StaminaCost { get; }", mining)
        self.assertIn("public int VeinHitsToBreak { get; }", mining)
        self.assertIn("public int OrePerVein { get; }", mining)
        attributes = files["server/AttributesTable.cs"]
        self.assertIn("public long Initial { get; }", attributes)

    def test_sample_tables_emit_no_voxel_reader(self):
        schemas, _tables, errors = load_sources(ROOT)
        self.assertEqual(errors, [])
        files = generate_csharp_readers(schemas)
        for name in ("MovementTable.cs", "MiningTable.cs", "AttributesTable.cs"):
            self.assertNotIn(f"voxel/{name}", files)

    def test_sample_row_values_live_only_in_exported_json(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            _copy_repo(root)
            out = Path(temp) / "out"
            csharp = Path(temp) / "csharp"
            self.assertEqual(_run_cli("export", "--out", str(out), "--csharp-out", str(csharp), root=root).returncode, 0)
            movement = json.loads((out / "server" / "movement.json").read_text(encoding="utf-8"))
            self.assertEqual(movement["rows"], [{"id": 70001, "name": "default", "step_meters": 1.25, "sweep_radius_meters": 0.35}])
            attributes = json.loads((out / "server" / "attributes.json").read_text(encoding="utf-8"))
            self.assertEqual(attributes["rows"], [{"id": 90001, "initial": 17, "name": "Stamina"}, {"id": 90002, "initial": 9, "name": "Ore"}])
            for path in csharp.rglob("*.cs"):
                for banned in ROW_LITERALS:
                    self.assertNotIn(banned, path.read_text(encoding="utf-8"), f"{path.name} leaked {banned}")
            for end in ("server", "client"):
                text = (csharp / end / "AttributesTable.cs").read_text(encoding="utf-8")
                self.assertNotIn("Stamina", text)
                self.assertNotIn("Ore", text)


class LoudFailureTests(unittest.TestCase):
    """消费方兜底可删的前提：缺表/错 schema 在导表侧就非零退出。"""

    def test_missing_table_file_fails_export_non_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            _copy_repo(root)
            (root / "tables" / "movement.txt").unlink()
            result = _run_cli("export", "--out", str(Path(temp) / "out"), "--csharp-out", str(Path(temp) / "cs"), root=root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("MISSING_TABLE", result.stdout + result.stderr)

    def test_wrong_schema_type_fails_export_non_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            _copy_repo(root)
            schema_path = root / "schemas" / "mining.json"
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            for column in schema["columns"]:
                if column["name"] == "stamina_cost":
                    column["type"] = "bool"
            schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8", newline="\n")
            result = _run_cli("export", "--out", str(Path(temp) / "out"), "--csharp-out", str(Path(temp) / "cs"), root=root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("TYPE_MISMATCH", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()

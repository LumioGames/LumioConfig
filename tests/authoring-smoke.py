"""Real compiled CLI parity checks. Run explicitly after building an authoring artifact."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def file_hashes(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(directory.rglob("*")) if p.is_file()}


def verify(artifact, evidence):
    evidence.mkdir(parents=True)
    isolated = evidence / "standalone tool"
    shutil.copytree(artifact, isolated)
    source = evidence / "input tables"
    source.mkdir()
    for name in ("schemas", "tables", "registry", "layers"):
        shutil.copytree(ROOT / name, source / name)
    shutil.copyfile(ROOT / "repository.yaml", source / "repository.yaml")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    frozen_env = {**env, "PATH": "", "PYTHONPATH": "", "PYTHONHOME": ""}
    python_cli = [sys.executable, str(ROOT / "tools/lumio_config.py")]
    suffix = ".exe" if sys.platform == "win32" else ""
    frozen_cli = [str(isolated / ("config-compiler" + suffix))]
    results = []

    def run(name, command, environment):
        result = subprocess.run(command, cwd=evidence, env=environment, capture_output=True)
        (evidence / f"{name}.stdout").write_bytes(result.stdout)
        (evidence / f"{name}.stderr").write_bytes(result.stderr)
        results.append({"name": name, "exit": result.returncode})
        return result

    def equivalent(name, args, expected=0):
        original = run(name + "-source", python_cli + args, env)
        frozen = run(name + "-frozen", frozen_cli + args, frozen_env)
        assert original.returncode == frozen.returncode == expected, (name, original, frozen)
        assert original.stdout == frozen.stdout and original.stderr == frozen.stderr, (name, original, frozen)

    equivalent("validate", ["validate", "--root", str(source)])
    equivalent("format", ["format", "--check", "--root", str(source)])
    counts = {}
    for mode in ("single", "split"):
        hashes = []
        for label, prefix, environment in (("source", python_cli, env), ("frozen", frozen_cli, frozen_env), ("repeat", frozen_cli, frozen_env)):
            target = evidence / f"{mode}-{label}"
            args = ["export", "--root", str(source)]
            args += ["--out", str(target)] if mode == "single" else ["--client-out", str(target / "client"), "--server-out", str(target / "server"), "--csharp-out", str(target / "readers")]
            result = run(f"export-{mode}-{label}", prefix + args, environment)
            assert result.returncode == 0, result.stderr
            hashes.append(file_hashes(target))
        assert hashes[0] == hashes[1] == hashes[2], mode
        counts[mode] = len(hashes[0])
        (evidence / f"{mode}-hashes.json").write_text(json.dumps(hashes[0], indent=2), encoding="utf-8")
    equivalent("verify-split", ["verify-split", "--client-out", str(evidence / "split-frozen/client"), "--server-out", str(evidence / "split-frozen/server")])
    schema = source / "schemas/skills.json"
    definition = json.loads(schema.read_text(encoding="utf-8"))
    definition["columns"][0]["type"] = "invalid-猫"
    schema.write_text(json.dumps(definition), encoding="utf-8")
    equivalent("invalid-unicode", ["validate", "--root", str(source), "--json"], expected=1)
    shutil.copyfile(ROOT / "schemas/skills.json", schema)

    identity = isolated / "_internal/lumio_config/compiler-hash.txt"
    identity.unlink()
    result = run("missing-hash", frozen_cli + ["export", "--root", str(source), "--out", str(evidence / "missing-hash")], frozen_env)
    assert result.returncode != 0 and b"frozen compiler identity" in result.stderr
    identity.write_text("broken", encoding="ascii")
    result = run("corrupt-hash", frozen_cli + ["export", "--root", str(source), "--out", str(evidence / "corrupt-hash")], frozen_env)
    assert result.returncode != 0 and b"frozen compiler identity" in result.stderr
    report = {"results": results, "matchingFiles": counts, "frozenPathEmpty": True,
              "metadata": json.loads((artifact / "authoring-tool.json").read_text(encoding="utf-8"))}
    (evidence / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return {"calls": len(results), "matchingFiles": counts}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.artifact.resolve(), args.out.resolve()), indent=2))

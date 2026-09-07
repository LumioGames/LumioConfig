# Generated outputs

`python tools/lumio_config.py export --out build/export` creates the four-layer manifests (release → target → table → chunk), S/C/V projections, `origins.json`, and `compilerHash` / `inputHash` / `outputHash` used for local inspection and later distribution.

`python tools/lumio_config.py export --out build/export --csharp-out generated/csharp` additionally writes typed C# readers (`server|client|voxel/<Table>Table.cs`) under `generated/csharp/`. Those files contain column types and `TryGet` / traversal only — never row values. They are committed with the source tables; rebuild them with the same command and never edit a generated file by hand. Interface: [`docs/reference/csharp-reader.md`](../docs/reference/csharp-reader.md).

The checked-in source of truth is under `schemas/`, `tables/`, and `registry/`. JSON export under `build/` is intentionally not committed in the bootstrap. When a future release publishes generated C#, the producing command, source commit, baseline, and schema fingerprints must be recorded alongside the artifact.

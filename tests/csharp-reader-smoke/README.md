# C# typed Reader smoke project

Minimal `net8.0` executable that references generated `<Table>Row` / `<Table>Table` sources and validates their immutable read boundary (R-00623).

```bash
python tools/lumio_config.py export --out build/export --csharp-out tests/csharp-reader-smoke/generated
dotnet build tests/csharp-reader-smoke/Lumio.Config.Generated.Smoke.csproj
python -m unittest discover -s tests -p test_csharp_codegen.py -v
```

`generated/` is produced by the command above and is not committed. The Python test exports into a temporary directory, builds the project and runs each scenario: array/list/`SyncRoot` aliases, caller-owned input and old-snapshot isolation, and allocation-free typed reads. Both generic and non-generic enumeration must preserve the snapshot. The executable does not load JSON; synthetic row values occur only in the test fixture.

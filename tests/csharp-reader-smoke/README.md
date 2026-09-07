# C# typed Reader smoke project

Minimal `net8.0` executable that references generated `<Table>Row` / `<Table>Table` sources.

```bash
python tools/lumio_config.py export --out build/export --csharp-out tests/csharp-reader-smoke/generated
dotnet build tests/csharp-reader-smoke/Lumio.Config.Generated.Smoke.csproj
```

`generated/` is produced by the command above and is not committed. The project only compiles the generated types; it does not load JSON or embed table values.

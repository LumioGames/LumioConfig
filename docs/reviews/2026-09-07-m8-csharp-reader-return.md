# R-00535 M8 C# typed Table Reader · 交回物（2026-09-07）

Baseline：`LGE-V1.4-2026-08-27`。接口文档先合入 `main`（PR #19 / `4b83519`），生成器在 `feat/m8-csharp-reader-codegen`。

## ① 改动清单

| 路径 | 说明 |
| --- | --- |
| `docs/reference/csharp-reader.md` | 冻结接口（已合 #19）；本卡补：零可见列跳过该端文件；`schemaFingerprint` 按端可见列 + `target` |
| `src/lumio_config/codegen/csharp.py` | 按端生成 `<Table>Row` / `<Table>Table`，UTF-8 LF，无行字面量 |
| `src/lumio_config/cli.py` | `export --csharp-out` / `--csharp-namespace`；JSON 仍走 `export_repository`，字节不变 |
| `generated/csharp/**` | 三表 × 三端 Reader，随源提交 |
| `tests/test_csharp_codegen.py` | 无行值、确定性、数值不变/类型变、JSON 字节、csproj `dotnet build` |
| `tests/csharp-reader-smoke/` | 最小 net8.0 csproj |
| `.github/workflows/repository-policy.yml` | CI 装 .NET 8；export 后 `git diff --exit-code -- generated/csharp` |
| `docs/reference/cli.md` 等 | 命令与重建口径 |

## ② 验证证据

- `python -m unittest discover -s tests -v` → `Ran 180 tests in 44.858s` **OK**
- `python tools/lumio_config.py validate` → `validate: OK`
- `python tools/lumio_config.py format --check` → `format: OK`
- `python tools/lumio_config.py export --out build/export --csharp-out generated/csharp` → `export: OK (3 table(s))`
- `git diff --exit-code -- generated/csharp` → 空
- `git diff --check` → 空
- `node <LumioAgentSpec lumio--v1.1.0>/plugin/tools/spec-lint.mjs .` → `spec-lint: OK`
- `dotnet build tests/csharp-reader-smoke/Lumio.Config.Generated.Smoke.csproj` → `Build succeeded. 0 Warning(s) 0 Error(s)`
- 数值 `skills.damage 120→121` 再生成：C# 树 `git diff --no-index` 空
- 类型 `skills.damage i32→i64` 再生成：仅 `server/SkillsTable.cs`（`int`→`long` + fingerprint）；client/voxel 字节不变
- 生成 `.cs` 内无 `40001` / `fireball` / `ember_cache` 等行值

## ③ known gaps

- 无。Rust 生成按卡不做；运行时装载器归 Runtime R-00544。
- 项目工作流从 `backlog` 只有 `in_review` / `rejected`，无单独「进行中」边；开工记录在评论，完成流转 `in_review`。

## ④ 知识沉淀落点

- 冻结接口：`docs/reference/csharp-reader.md`（Runtime M9 合同）。
- 教训：`.spec/knowledge/lessons.md`（`schemaFingerprint` 必须按端过滤可见列）。
- 不在 `.spec/knowledge/features/` 另立一份（导航已指向仓根接口文档）。

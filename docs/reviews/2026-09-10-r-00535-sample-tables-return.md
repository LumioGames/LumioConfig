# R-00535 Sample 消费面 · 交回物（2026-09-10）

Baseline：`LGE-V1.4-2026-08-27`，基线提交 `0b04a40`（09-08，本窗口 0 提交起算）。Reader 生成器本体已于 PR #20（`ed06f6e`）合入；本窗口做审计 P1-10 的 LumioConfig 半边：Sample 三张玩法表 + 交接面。

## ① 改动清单

| 路径 | 说明 |
| --- | --- |
| `schemas/movement.json` `mining.json` `attributes.json` | 新表 schema，可见性 `CS`（两端同码消费），列名/类型对齐 `SampleTables` 现读面 |
| `tables/movement.txt` `mining.txt` `attributes.txt` | 首批行经 **patch apply** 建（发号台落号）：movement `default`=70001、mining `default`=80001、attributes `Stamina`=90001 / `Ore`=90002；数值来自 `LumioSample/config/*.json` 原值 |
| `src/lumio_config/ids.py` | ID 命名空间扩段：movement 70000-79999、mining 80000-89999、attributes 90000-99999 |
| `registry/row-ids.json` `tombstones.json` | 发号台写入；墓碑播种各段基号（沿 skills 40000 先例） |
| `generated/csharp/{server,client}/{Movement,Mining,Attributes}Table.cs` | 六个新 Reader，只含类型与读法 |
| `docs/reference/sample-config-handoff.md` | **交接注释**：表/行号、最小样例 manifest 格式（真实导出原文）、消费方 AC 五条（缺指定 manifest 非零、父目录假表不得生效、缺表/指纹不符响亮失败、Tick 内快照不可变、数值不进程序集） |
| `docs/reference/csharp-reader.md` `.spec/knowledge/README.md` | 挂接交接文档导航 |
| `tests/test_csharp_codegen.py` | 新增 `SampleTableReaderTests` / `LoudFailureTests`；行值黑名单扩 70001/80001/90001/90002/1.25/0.35 |
| `tests/csharp-reader-smoke/Program.cs` | 冒烟工程引用六个新 Reader |
| `src/lumio_config/patch.py` | `PATCH_UNKNOWN_TABLE` 提示从硬编码三表名改为动态列出（六表后已过期） |

## ② 验证证据（命令原文）

- `python -m unittest discover -s tests -v` → `Ran 185 tests in 57.642s` **OK**（较上窗口 +5：Sample Reader 形状 / 无 voxel Reader / 数值只在 JSON / 缺表非零 / 错 schema 非零）
- `python tools/lumio_config.py validate` → `validate: OK`
- `python tools/lumio_config.py format --check` → `format: OK`
- `python tools/lumio_config.py registry verify` → `registry-verify: OK`
- `python tools/lumio_config.py export --out build/export --csharp-out generated/csharp` → `export: OK (6 table(s))`；随后 `git diff --exit-code -- generated/csharp` → 空
- `git diff --check` → 空；`node <LumioAgent plugin>/tools/spec-lint.mjs .` → `spec-lint: OK`
- `dotnet build tests/csharp-reader-smoke/Lumio.Config.Generated.Smoke.csproj`（先 export 进 `tests/csharp-reader-smoke/generated`）→ `Build succeeded. 0 Warning(s) 0 Error(s)`
- **改数据不重编证据（ADR-090 场景）**：patch `Stamina.initial 17 → 25` 再 export，`diff -r generated/csharp <新目录>` → `CS-TREE-IDENTICAL`；JSON 侧 `"initial": 25`。已还原 17
- 生成 `.cs` 内 grep 不到 `70001` / `80001` / `90001` / `90002` / `1.25` / `0.35` / `fireball` 等行值（测试 `test_cli_csharp_out_emits_row_and_table_without_row_literals` + `test_sample_row_values_live_only_in_exported_json` 锁死；attributes 两个文件另查 `Stamina` / `Ore` 零命中）

### 十仓 SHA（本窗口实际所用 checkout）

| 仓 | HEAD |
| --- | --- |
| LumioConfig | `0b04a40`（基线；本卡分支 `feat/r-00535-sample-tables`） |
| LumioSample | `bb5f1f7`（config/*.json 数值来源，只读） |
| LumioGameEngine | `d8b013c`（ADR-090 / 派活文档来源，只读） |
| LumioGameRuntime | `9ca40cb`（未改；M9 装载归 R-00544） |
| LumioServer | `7f81c90`（未改；boot 交 export 归 R-00547） |
| LumioClient | `576dd14` |
| LumioGame | `8b67728` |
| LumioNativeCore | `d996ff4` |
| LumioPlatform | `a09b8a6` |
| LumioVoxelEngine | `20e7e21` |

## ③ known gaps

- Reader 形状足够 Sample 删扫描/父目录兜底：生成物无任何路径解析，装载唯一输入是显式 manifest（AC 已写进交接文档）——**未 BLOCKED**。
- 装载器本体（manifest 解析、packageFingerprint 校验、快照激活）归 Runtime M9（R-00544）；Sample 接线归 R-00527；本仓只到 export + Reader + manifest 样例。
- Rust Reader 按卡不做；编辑器/热更新未碰。
- 本仓工作流无「进行中」语义边（沿 09-07 回款先例：开工/完成以 PR + 本文记录，线上流转待主 loop）。

## ④ 知识沉淀落点

- 交接面：`docs/reference/sample-config-handoff.md`（消费方 AC 与 manifest 样例唯一落点）。
- 冻结接口文档补 Sample 消费面指引；知识导航同步。
- 无新教训（`schemaFingerprint` 按端过滤等既有教训仍适用）。

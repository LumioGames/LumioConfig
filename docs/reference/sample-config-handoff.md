# Sample 配表交接面（R-00535 → Sample R-00527 / Runtime R-00544 / Server R-00547）

LumioConfig 侧对 Sample 的交付面：**三张玩法常量表 + typed Table Reader + 导出 manifest**。本文是给消费方（Sample 接线、Runtime M9 装载、Server 开机交 export）的交接注释，LumioConfig 不替任何消费方实现装载或改 launcher。

背景：审计 P1-10 点名 Sample 的 `SampleTables` 自造 JsonDocument 读取器、靠目录游走与父目录兜底找表，未接 LumioConfig。ADR-090（2026-09-10）裁定数值一律来自配表、经 typed 读取路径取出；本文即该路径的 LumioConfig 半边。

## 表与行号

三张表可见性均为 `CS`（移动/挖矿/属性账在 Sample 两端同一段玩法代码里读），Voxel 端零可见列、不生成 Reader。行号为终身编号，游戏代码允许引用：

| 表 | 行（名字 → 终身编号） | 列（类型） | Sample 消费点 |
| --- | --- | --- | --- |
| `movement` | `default` → **70001** | `step_meters`（f64）、`sweep_radius_meters`（f64） | 步长、扫掠半径（MoveAbility，两端同码） |
| `mining` | `default` → **80001** | `stamina_cost`（i64）、`vein_hits_to_break`（i32）、`ore_per_vein`（i32） | 一镐体力、挖穿次数、掉落数量（MineAbility / VeinReserve / 激活上下文） |
| `attributes` | `Stamina` → **90001**、`Ore` → **90002** | `name`（string，即 GAS 账本名）、`initial`（i64） | 属性账名字与初值（ADR-090 seed 路径） |

现有 `skills` / `effects` / `drops` 三表不变。数值改动的唯一路径：改 `tables/*.txt`（走补丁通道）→ 重新 export → 重启进程。改数值不重编任何程序集。

### 共享预测列（`sharedPrediction`，R-00693）

分端导出的两端兼容判据只看**已声明的共享预测列**（[`split-export.md`](../../.spec/knowledge/features/split-export.md) §7）。判据是「这一列的值有没有被两端同一段代码读进 GAS 预测计算」——只被 `*.Server.cs` 读、客户端靠复制字段看到结果的列不算。本仓源按 Sample 的实际读点逐列判定如下：

| 列 | 声明 | 依据（Sample 读点） |
| --- | --- | --- |
| `movement.step_meters` | ✅ | `Abilities/MoveAbility.cs:121` `CanActivate`，`[AbilityType(Prediction = PredictionKind.LogicPredict)]`，共享 `.cs` 两端同码；另 `MineAbility.cs:86 WithinReach` 同为 `LogicPredict` |
| `movement.sweep_radius_meters` | ✅ | `Abilities/MoveAbility.cs:123` `CanActivate`，同上；客户端预测碰撞扫掠与服务端权威用同一半径 |
| `mining.stamina_cost` | ✅ | `Abilities/MineAbility.cs:114` `Execute`（`LogicPredict`）读基础账扣减；基础账是 `Scope.Owner`，预测世界算得出（`gas.md` M4 准入③） |
| `mining.cooldown_ticks` | ✅（仅 Sample 源有此列） | `Abilities/MineAbility.cs:128` `Execute` `SetCooldown`，`LogicPredict`，两端同码；准入②冷却复查两端必须同值 |
| `mining.vein_hits_to_break` | ❌ | 只在 `Components/Vein/VeinReserveComponent.Server.cs:10` `PostAttribute` 读；客户端只看复制的 `Remaining`（`Sync<int>`），不参与预测计算 |
| `mining.ore_per_vein` | ❌ | 只在 `SampleMiningComponent.Server.cs:189` `StageFinal` 读，服务端独有 |
| `attributes.initial` | 待裁 | `Config/SampleConfigBinding.cs:29` `TryGetSeedValue` 两端都装；但 `gas.md` M5 写明远端权威投影不重新播种、预测克隆继承 Base/Current，联网下客户端不会用自己的 `initial`。见本节末 |
| `attributes.name` | 待裁 | `MineAbility.cs:113` `config.Stamina.Name` 在预测路径上读；但行选取 `Rows.Single(row => row.Name == "Stamina")` 用的是共享代码里的硬编码串，单端改名会在 `Project()` 当场抛异常而不是静默分叉。见本节末 |

`skills` / `effects` / `drops` 全表零 C# 读点，不声明。

**两处待裁**（`attributes.initial` / `attributes.name`）本轮**不声明**：它们确实出现在两端编译的文件里，但都不构成「两端各算一遍、结果必须相同」的预测输入——前者被权威复制值覆盖，后者失配是硬失败而非分叉。要不要把它们纳入是归属边界问题，由架构仓裁。

空声明集合下 `verify-split` 比的是同一个常量、**永远通过**；非空后单端漂移即以 `SHARED_PREDICTION_VALUE_MISMATCH` 退出 1。两条回归测试在 `tests/test_split_export.py::SharedPredictionTests`。

## 生成命令与 Reader

```bash
python tools/lumio_config.py export --out build/export --csharp-out generated/csharp
```

- JSON：`build/export/server|client/<table>.json` + 各端 `manifest.json` + 根 `manifest.json`。
- ADR-115 目标布局用分端导出（游戏仓迁移完成后即用此条，单根模式在迁移期继续可用）：

  ```bash
  python tools/lumio_config.py export \
    --client-out <游戏仓>/Client/Config/Tables \
    --server-out <游戏仓>/Server/Config/Tables
  ```

  `C` 投影进 `Client/Config/Tables`，`S` 与 `V` 进 `Server/Config/Tables`；投影文件与分端清单字节不变，消费方读表代码不用改，只是多了一份端 manifest。接口见 [`split-export.md`](../../.spec/knowledge/features/split-export.md)。
- C# Reader：`generated/csharp/server|client/<Table>Table.cs`，命名空间 `Lumio.Config.Generated.Server` / `.Client`。生成物只含类型与读法，无行数值；签名冻结见 [`csharp-reader.md`](csharp-reader.md)。

读法（装载后）：

```csharp
if (movement.TryGet(70001, out MovementRow row))
{
    double step = row.StepMeters;        // 1.25 只存在于 JSON，不存在于生成代码
}

foreach (AttributesRow attribute in attributes.Rows) { /* Name == "Stamina", Initial == 17 */ }
```

## 取件路径：`sync` 命令（CF1，取代手抄）

消费仓不得再从 `generated/csharp/` 手工复制文件。正式路径是本仓的同步命令：在持有 LumioConfig 检出（clone 或 submodule）的机器上、从检出内运行，Reader 永远从当前真源现场重生成，不信任任何缓存副本：

```bash
# 同步：把选定范围的 Reader 写进消费仓，并落一份校验 manifest
python tools/lumio_config_sync.py sync \
  --dest <消费仓>/src/.../generated/config \
  --tables movement,mining,attributes \
  --targets server,client

# 核验：消费仓 CI 例行跑，从当前源重生成并逐字节比对
python tools/lumio_config_sync.py check \
  --dest <消费仓>/src/.../generated/config
```

规则与保证：

- 产物是 `dest/server|client|voxel/<Table>Table.cs` 加 `dest/csharp-sync-manifest.json`；与 `export --csharp-out` 同源同算法，同一份源两路输出逐字节相同。
- `--tables` / `--targets` 缺省为全部；**两侧都显式给出**的 (表， 端) 若该端零可见列，报 `SYNC_TABLE_NOT_VISIBLE` 非零退出。`--namespace` 缺省 `Lumio.Config.Generated`（与仓内提交的 Reader 一致），check 时缺省沿用 manifest 记录的命名空间。
- manifest 只含校验元数据：每文件 SHA-256 与 schemaFingerprint、来源 revision、`inputFingerprint`（与 export 根 `manifest.json` 的 `inputHash` 同算法——两值相等即证明 Reader 与 JSON 出自同一份源状态）、全部文件的聚合指纹。**不含任何行数值**；它是核验凭证，不是程序集资源（AC 5 不变）。
- 幂等：源未变时重复 `sync` 零字节改动，消费仓 `git diff` 为空。「重跑生成 → diff 为空」由 `check` 在消费仓 CI 里变成机器门，任何不一致非零退出并输出 JSON 报告。`sync` 顺手清掉带生成头但已不在产物集里的孤儿文件（上游删表/改端遗留）。
- 换行纪律：产物是 UTF-8 + LF + 末尾换行（与本仓 `.gitattributes` 的 `*.cs text eol=lf` 一致）。消费仓必须给自己的 vendored 目录钉同样规则（如 `.gitattributes` 写 `src/.../generated/config/** text eol=lf`），否则 Windows `autocrlf` 检出成 CRLF 后 `check` 逐字节比对必然失配。
- 失败码（非零退出，JSON 报告）：

| 失败码 | 触发 |
| --- | --- |
| `SOURCE_LOAD_FAILED` / `SYNC_CODEGEN_FAILED` | 上游源加载失败 / schema 无法投影成 Reader |
| `SYNC_UNKNOWN_TABLE` / `SYNC_UNKNOWN_TARGET` | 选择集含未知表 / 端 |
| `SYNC_TABLE_NOT_VISIBLE` | 显式选定的表在该端零可见列 |
| `SYNC_MANIFEST_MISSING` / `SYNC_MANIFEST_INVALID` / `SYNC_MANIFEST_REQUIRED` | check 找不到 / 不认识 manifest / 显式禁用了 manifest |
| `SYNC_MANIFEST_FILE_MISSING` | 当前源会生成、manifest 未记（上游新增；重跑 sync） |
| `SYNC_FILE_MISSING` / `SYNC_HASH_MISMATCH` | manifest 列的文件缺失 / 字节 SHA-256 与记录不符 |
| `SYNC_DRIFT` | 与当前源重生成结果不一致；附诊断区分 `schema-changed-upstream`（重跑 sync）与 `modified-after-sync`（拷贝后被手改），并给出新旧 schemaFingerprint |
| `SYNC_ORPHAN` | 带生成头但不在当前产物集里的 `.cs`（check 报漂移，sync 清除） |
| `SYNC_AGGREGATE_MISMATCH` | 聚合指纹不符 |

选同步命令而非发包是 bootstrap 阶段的现实约束：本仓尚无包仓库与发布通道，而 `generated/README.md` 已要求未来发布必须随产物记录生成命令、源提交与指纹——manifest 正是这份记录，将来转发布通道时直接随包走。

Sample 对接（其 S2）：把上面两条命令接进仓库脚本与 CI，退役手工复制流程；本仓不替 Sample 改任何文件。下节五条消费方 AC 一字不动：`check` 只解决「手抄会静默漂移」这一个问题，不碰装载语义（那是 R-00544）。

## 最小样例 manifest 格式

端 manifest（`server/manifest.json`，客户端为 `client/manifest.json`、`target: "C"`）原文摘录——`tables` 内每张表一条，字段即消费方需要的全部：

```json
{
  "target": "S",
  "tables": [
    {
      "table": "movement",
      "contentFingerprint": "77d22b3c3b914789fba6f8eb2da236a3efa7d4848b06820a36d0e53b3ccef2bb",
      "sourceFingerprint": "923ea0373d6071141748b66727a693d0e83e95e45738a266e7798350f1af32bd",
      "packageFingerprint": "39aafbfc91edba7a53c6ef99d0ee7ae1cefd5eb80c2c632ea8b0cd4aa1c6b879",
      "path": "server/movement.json",
      "chunks": [
        { "id": 0, "path": "server/movement.json", "packageFingerprint": "39aafbfc91edba7a53c6ef99d0ee7ae1cefd5eb80c2c632ea8b0cd4aa1c6b879" }
      ]
    }
  ]
}
```

（实际文件含全部六张表，逐条同形；指纹值随源变化，以导出物为准。）

根 `manifest.json` 是整套Revision的身份（`formatVersion` / `revisionId` / `contentFingerprint` / `projectionRoots` 等，全字段见 [`revision-manifest.md`](revision-manifest.md)）。端进程只需端 manifest：`path` 相对导出根，`packageFingerprint` 是该文件字节的 SHA-256——装载前校验，不符即失败。

## 消费方 AC（验收判据，写在消费方的卡上）

1. **指定 manifest 缺失必须非零退出。** launcher 显式传 manifest 路径；文件不存在 → 进程非零 + 明确报错。不允许降级到「找一找附近的表」。
2. **父目录假表不得生效。** 装载的唯一输入是指定的 manifest 及其列出的 `path`；对目录扫描、向上递归找 `config/`、环境变量游走等一切兜底一律删除（Sample 现状 `SampleTables.ResolveDirectory` / `WalkForConfig` / `LUMIO_CONFIG_DIR` 整段退役）。manifest 没列的文件—even 在同一目录—不参与装载。
3. **缺表 / 指纹不符响亮失败。** manifest 声明的表文件缺失、或字节 SHA-256 与 `packageFingerprint` 不符 → 非零退出，不静默跳过、不装半套。
4. **Tick 内快照不可变。** 开机装一次：解析 JSON → 逐行构造 `<Table>Row` → 构造 `<Table>Table`（构造后不再读盘、不再解析）；帧内只走 `TryGet` / `Rows` / `Count`，同步、无 I/O。换版本 = 换进程（滚动更新），不是帧中途换表。
5. **数值不进程序集。** 玩法源码 grep 不到表数值（ADR-090 判据的机器形式：`grep -rnE "\b17\b"` 等零命中）；读表只经 Reader 属性（`row.StepMeters`），不自己拆 JSON。改表数值 + 重启 → 新值生效，程序集字节不变。

导表侧对偶义务（LumioConfig 已落实，tests/test_csharp_codegen.py 锁死）：schema 声明了表文件缺失、或单元格类型与 schema 不符 → `export` 非零退出（`MISSING_TABLE` / `TYPE_MISMATCH`），导出物里永远没有行数值。

## 本仓不做

- 不替 Sample 改 launcher / `SampleTables`（R-00527 的活）。
- 不实现运行时装载器、指纹校验与快照激活（Runtime M9 / R-00544 的活；装载语义按 [`csharp-reader.md`](csharp-reader.md)「与 M9 的分工」）。
- 不做 Server 开机接 export 目录（R-00547 的活）。
- 不生成 Rust Reader、不做热更新/编辑器范围。

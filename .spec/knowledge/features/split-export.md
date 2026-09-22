---
name: split-export
description: 分端导出规范 split-export/1——CLI 形状、各端 manifest、指纹算法与共享预测兼容校验；按端导出或消费两端产物时查
metadata:
  type: doc
  status: 设计中
---

# 分端导出（split-export/1）

**规范版本：`split-export/1`。** 本页是分端导出的冻结接口：消费方（游戏工作区、Runtime 装载、Server 开机）按本页对接，不读实现代码。字段增补走版本号递增（`split-export/2`），本版本内不改已冻结字段的含义。

依据架构仓（`LumioGameEngine`）`.spec/decisions/ADR-115-architecture-directory-contract.md`「接口与 Schema 影响」与 `.spec/knowledge/standards/repository-layout.md` §5 / `.spec/knowledge/features/game-workspace.md`：`C` 投影落 `Client/Config/Tables`，`S` 与 `V` 投影落 `Server/Config/Tables`（VoxelEngine 跑在 DS 进程里）。

## 1. 目标与非目标

- 目标：一次编译的三份投影按**端**写到两个互不重叠的目标目录，客户端目录不含任何服务端产物。
- 非目标：不退役单根导出（`--out` 保留，游戏仓迁移完成前仍在用；退役另开单）；不分端拆 C# Reader（`--csharp-out` 语义不变）；不要求两端整棵树哈希相等。

## 2. 端与投影的映射

| 端 | 目录键 | 投影 | 子目录 |
| --- | --- | --- | --- |
| client | `--client-out` | `C` | `client/` |
| server | `--server-out` | `S`、`V` | `server/`、`voxel/` |

映射是本规范的常量，不可由命令行改写。浏览器体素将来若需要 `V`，按 `split-export/2` 另加 client 端条目，**不共用同一份目录**。

## 3. CLI 形状

```bash
# 单根模式（既有，保留，零行为变化）
python tools/lumio_config.py export --out build/export [--csharp-out DIR] [--csharp-namespace NS]

# 分端模式（本规范新增）
python tools/lumio_config.py export --client-out <Client/Config/Tables> --server-out <Server/Config/Tables> [--csharp-out DIR] [--csharp-namespace NS]

# 两端兼容校验（只读两份 manifest.json）
python tools/lumio_config.py verify-split --client-out <DIR> --server-out <DIR> [--json]
```

- `--out` 与 `--client-out` / `--server-out` **互斥**；分端模式两个目录都必须给，缺一个报 `SPLIT_OUT_INCOMPLETE` 并以 2 退出。
- 两个目录不得相同、也不得互为祖先目录，违者报 `SPLIT_OUT_OVERLAP` 并以 2 退出；不相同即可，是否同父目录不限。
- 相对路径相对仓库根解析，与 `--out` 同规则。
- 目标目录已存在时按表增量覆盖：可见性收窄导致某表在某端消失时，编译器只删自己拥有的那一个路径（与单根模式同一条规则），不清扫目录里的其他文件。
- `export` 成功退出码 0；源校验失败打印错误 JSON 并以 1 退出，与单根模式一致。
- `verify-split` 兼容退出 0，不兼容退出 1，参数错误退出 2。

## 4. 各端目录形状

```text
<client-out>/                      <server-out>/
  manifest.json      端 manifest     manifest.json      端 manifest
  client/                            origins.json       层来源溯源（只在 server 端）
    manifest.json    投影 manifest    server/
    <table>.json                        manifest.json
                                        <table>.json
                                     voxel/
                                        manifest.json
                                        <table>.json
```

- **投影子目录与投影 manifest 的内部结构与单根模式逐字节相同**（`{"target", "tables":[{table, contentFingerprint, sourceFingerprint, packageFingerprint, path, chunks}]}`，`path` 仍相对本端根，形如 `server/skills.json`）。消费方已有的读表代码不需要改。
- `origins.json` 是排查用的层来源溯源，含全部列（含服务端专属列名），**只写 server 端**；client 端不写、端 manifest 不带 `origins` 键。
- client 端目录下不出现 `server/`、`voxel/` 任何文件。这是硬约束，由测试断言。

## 5. 端 manifest 结构

单根模式的根 `manifest.json` 不变。分端模式每端根 `manifest.json` 如下（`formatVersion: 1` 沿用，新增 `specVersion` / `endpoint` / `releaseFingerprint` / `sharedPrediction`）：

```json
{
  "formatVersion": 1,
  "specVersion": "split-export/1",
  "endpoint": "client",
  "baselineId": "LGE-V1.4-2026-08-27",
  "revisionId": "<= contentFingerprint>",
  "targets": ["C"],
  "compilerHash": "<64 hex>",
  "inputHash": "<64 hex>",
  "outputHash": "<64 hex，只覆盖本端树>",
  "contentFingerprint": "<64 hex，整次编译>",
  "sourceFingerprint": "<64 hex，整次编译>",
  "packageFingerprint": "<64 hex，只覆盖本端包>",
  "releaseFingerprint": "<64 hex，覆盖三投影全部包>",
  "publicRoot": "<= packageFingerprint>",
  "targetManifests": { "C": "client/manifest.json" },
  "projectionRoots": { "C": "client/manifest.json" },
  "sharedPrediction": { "specVersion": "split-export/1", "columns": [], "fingerprint": "<64 hex>" },
  "tables": [ { "table": "movement", "contentFingerprint": "…", "sourceFingerprint": "…" } ]
}
```

- `endpoint` 取 `client` / `server`，是端身份的唯一判据，消费方不靠目录名猜。
- `targets` / `targetManifests` / `projectionRoots` 只列本端投影；server 端是 `["S","V"]`。
- `tables` 只列在本端**至少写出一个文件**的表；某表在本端零可见列时不出现在该端 manifest 里。表条目的 `contentFingerprint` 仍是整表（含另一端列）的身份指纹——它是哈希不是值，不泄露数值。
- `origins` 键只在 server 端出现，值 `"origins.json"`。
- 既有 revision 契约（`revisionId == contentFingerprint`、`projectionRoots` 的值不得等于 `publicRoot`）在两端各自成立。

## 6. 指纹算法（分端后怎么算）

算法本体（`sha256`、canonical JSON、`fingerprint_files` 的长度前缀编码）全部沿用，只改作用域：

| 字段 | 作用域 | 两端是否相等 |
| --- | --- | --- |
| `compilerHash` | 编译器包 | 相等 |
| `inputHash` | 源树（`schemas`/`tables`/`registry`/`layers`） | 相等 |
| `contentFingerprint` / `revisionId` | **整次编译**全部表的内容指纹聚合 | 相等 |
| `sourceFingerprint` | **整次编译**全部表的源指纹聚合 | 相等 |
| `releaseFingerprint` | **三投影**全部包指纹聚合 | 相等 |
| `packageFingerprint` / `publicRoot` | **本端**包指纹聚合 | 不等（正常） |
| `outputHash` | **本端**目录树，排除本端根 `manifest.json` | 不等（正常） |
| `sharedPrediction.fingerprint` | 已声明的共享预测列 | 相等即兼容 |

要点：

1. **身份类指纹（`revisionId` / `contentFingerprint` / `sourceFingerprint` / `inputHash` / `compilerHash` / `releaseFingerprint`）在两端逐字相等**，它们回答「这两份产物是不是同一次编译出来的」。
2. **范围类指纹（`packageFingerprint` / `publicRoot` / `outputHash`）只覆盖本端**，它们回答「本端这棵树有没有被改过」。两端不等是正常的，**不得用它们相等与否判断两端一致**。
3. `outputHash` 的排除规则与单根一致：只排除自己所在目录的根 `manifest.json`，投影 manifest 计入。
4. 确定性：同一份源、同一编译器，导出到任意两个不同目录，两端每个文件逐字节相同、所有指纹相同。

## 7. 共享预测参数兼容校验

按 ADR-102 与 `game-workspace.md`：**不以整套端侧配置哈希相等作为两端一致的判据**，兼容检查只聚焦**已声明的**共享预测配置。

**声明方式**：schema 列上加布尔属性 `"sharedPrediction": true`。

```json
{ "name": "step_meters", "ordinal": 2, "type": "f64", "required": true, "visibility": "SC", "sharedPrediction": true }
```

- 该列的 `visibility` 必须同时含 `S` 与 `C`，否则 `validate` 与 `export` 都报 `SHARED_PREDICTION_NOT_SHARED`。参与同一段 GAS 预测的参数两端都得看得见。
- **判据（逐列过，不凭感觉）**：该列的值是否被**同一段两端共享的代码**读进 GAS 预测计算——客户端在预测世界里算一遍、服务端在权威世界里算同一遍。只被 `*.Server.cs` 读、客户端经复制字段看到结果的列**不声明**（它不参与预测，只是被复制）；只被客户端表现读的列同理。
- 未声明任何列时，`columns` 为空数组、`fingerprint` 是空集合的聚合指纹（定值 `697d43df…`），两端比的是同一个常量——**校验平凡通过，等于没有断言**。空集合是未接线状态，不是可接受的终态；R-00693 起本仓源已声明非空集合，并由 `tests/test_split_export.py::SharedPredictionTests` 的两条测试守住（集合非空 + 单端漂移必须被 `verify-split` 拒绝）。

**指纹算法**：对已声明列按 `"<table>.<column>"` 排序，取该列**投影后的类型化值**（含单位换算结果），按行的 id 列值排序，canonical JSON 后 sha256：

```json
{"columns": ["movement.step_meters"],
 "values": {"movement": {"step_meters": [[70001, 1.25]]}}}
```

值取自同一次编译的同一份类型化行，因此两端由构造即相等；写进两端 manifest 是给**跨次编译**的消费方作证据。

**校验口径**（`verify-split` 与消费方自检同一套）：

| 情况 | 判定 | 码 |
| --- | --- | --- |
| 两端 `sharedPrediction.columns` 与 `fingerprint` 均相等 | 兼容，退出 0 | — |
| 声明列集合不同 | 不兼容，退出 1 | `SHARED_PREDICTION_COLUMNS_DIFFER` |
| 列集合相同、指纹不同 | 不兼容，退出 1 | `SHARED_PREDICTION_VALUE_MISMATCH` |
| `endpoint` 不是一个 client 一个 server | 参数错，退出 2 | `SPLIT_ENDPOINT_INVALID` |
| 两端 `revisionId` 不同但共享预测相等 | **兼容**，仅记 `note` | `SPLIT_REVISION_DIFFERS`（提示，不是错误） |

最后一行是本节的要害：两端来自不同次编译（画质表改过、服务端存储参数改过）**不构成不兼容**；只有已声明的共享预测配置对不上才不兼容。

## 8. 验收

- [ ] 分端导出把 `C` 与 `S`+`V` 写到两个不同目录，client 端不含 `server/` `voxel/` 任何文件。
- [ ] 分端导出两次到不同临时目录，逐字节相同。
- [ ] 单根模式保留可用，既有测试计数不变。
- [ ] 两端一致性判据是 `sharedPrediction`，不是整树哈希相等。

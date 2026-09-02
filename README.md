# LumioConfig

> LumioGameEngine 的 Schema-first 配表源、校验工具和导表工具仓库。

## 架构基线

- **Architecture baseline**：`LGE-V1.4-2026-08-27`
- **设计来源**：[`LumioConfig 设计概要`](docs/architecture/lumioconfig-design.md)
- **架构源最新提交**：`a7c1221d3797db696e60bf8a8c748c907975a64c`
- **设计来源提交**：`d2a7883ea447d2c34b92269c1f84ac9c3c53f5eb`（架构仓 PR [#49](https://github.com/LumioGames/LumioGameEngineArchitecture/pull/49)）
- **仓库元数据**：[`repository.yaml`](repository.yaml)
- **管理定义**：[`docs/management/repository-definition.md`](docs/management/repository-definition.md)
- **操作手册**：[`docs/management/operations.md`](docs/management/operations.md)
- **源格式**：[`docs/reference/source-format.md`](docs/reference/source-format.md)
- **命令行**：[`docs/reference/cli.md`](docs/reference/cli.md)
- **验证证据清单**：[`docs/operations/validation-evidence.md`](docs/operations/validation-evidence.md)
- **本地脚本**：[`scripts/README.md`](scripts/README.md)

LumioConfig 是工具仓，不是游戏运行时仓。它保存策划表的权威文本源、表结构、行号墓碑和配表工具；实现仓只消费可重建的只读导出物。架构仓仍是跨仓 Schema、Canonical、ID Namespace、运行时装载和公共失败语义的唯一来源。

## 职责

- 管理每张配置表的 Schema、规范化文本源和删除行墓碑。
- 提供确定性的 `validate`、`format`、`patch` 和 `export` 工具入口。
- 在导出时执行类型、引用、默认值、可见性和三端投影检查。
- 生成服务器（`S`）、客户端（`C`）和 Voxel（`V`）的只读 JSON 投影及三重指纹。
- 以名字补丁为唯一写入口：机器门结构化报错，发号台在合入时分配终身编号。
- 为后续 Web 编辑器、AI 五动作接口、Rust/C# 只读生成面和发布工具提供稳定的目录边界。

## 明确不负责什么

- 不拥有架构仓的公共协议、Envelope、ID Namespace 授权或运行时状态机。
- 不实现 ECS、GAS、Voxel Storage、网络、Host、Renderer 或游戏玩法逻辑。
- 不把 Excel、数据库或运行时对象图当作权威源。
- 不提供生产激活按钮；导出不等于上线，AI 没有激活权。
- 不实现运行时装载器、开发 reload、握手配对或回放播放；本仓只交付 manifest 里的 Revision 身份字段与负向 fixture，运行时行为由各实现仓在需要时自行立卡。
- 不允许表格承载 `if`、脚本或蓝图式逻辑；逻辑属于游戏代码。

## 子模块

| 模块 | 目录 | 首版职责 |
| --- | --- | --- |
| Source | `tables/` | 规范化的逐行文本表 |
| Schema | `schemas/` | 列类型、默认值、范围、引用和可见性 |
| Registry | `registry/` | 永久行号和墓碑 |
| Validator | `src/lumio_config/validate.py` | 结构化错误与机器门 |
| Formatter | `src/lumio_config/text_table.py` | 幂等文本排版 |
| Exporter | `src/lumio_config/export.py` | 五层合并、三端投影和指纹 |
| Patch / ID | `src/lumio_config/patch.py`, `ids.py` | 名字补丁、机器门合入、域内发号 |
| CLI | `tools/lumio_config.py` | 本地与 CI 统一入口 |
| Editor（M6，实施中） | `editor/`、`src/lumio_config/editor/` | Univer 前端 + Python Host：投影、草稿、语义补丁提交、三方合并、CSV 导出；见 `docs/decisions/0-7`、`0-8` |

## Source / Compile-Time Dependencies

- Python 3.11 或更高版本；首版只使用 Python 标准库。
- 架构源提交由 `repository.yaml` 固定；公共契约变更先在 `LumioGameEngineArchitecture` 按 ADR 流程完成。
- 导出产物供 `LumioGameRuntime`、`LumioGame`、`LumioServer`、`LumioClient` 和 `LumioVoxelEngine` 的后续适配器消费；本仓不反向依赖这些实现源码。
- 未来二进制后端只能通过导出器适配，不改变文本源和内容指纹语义。

## Headless Test Surface

- Schema 类型、必填列、范围、引用和可见性错误。
- 四态单元格（缺列、空字符串、明确 null、默认值）的解析与导出。
- 格式化幂等性和稳定行/列排序。
- 内容、包裹、底稿三种指纹的确定性。
- `S`/`C`/`V` 投影的列隔离和跨端引用拒绝。
- CLI 的 validate、format-check、export 以及仓库元数据一致性。

## 当前阶段与开发节奏

1. **阶段 0：立规矩**：六条决议暂落 [`docs/decisions/`](docs/decisions/README.md)，不占架构仓 ADR 号；待并入清单见同目录。M6 网页编辑器的两条决议（`0-7` 选型与边界、`0-8` 草稿 / 提交 / 合并）2026-09-02 同样暂落该目录。
2. **阶段 1：垂直切片**：扩展本仓的源表、机器门、发号台、导表器和最小读取面。
3. **阶段 2：发布与工具**：接入人门签名、模拟预演、Web 编辑器和实现仓分发。
4. **阶段 3：性能与二进制**：完成基准测试后再选择二进制后端；没有实测不冻结格式赢家。

剩余工作的派活提示词见 [`.spec/plans/2026-09-02-lumioconfig-dispatch-prompt.md`](.spec/plans/2026-09-02-lumioconfig-dispatch-prompt.md)，网页编辑器逐卡实现指引见 [`.spec/plans/2026-09-02-web-editor-design-prompt.md`](.spec/plans/2026-09-02-web-editor-design-prompt.md)（v2：Univer OSS + React 前端，Python 标准库 Host）。

## 快速开始

```bash
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --out build/export
python tools/lumio_config.py patch validate path/to/patch.json
```

`build/` 是本地生成目录，不提交到 Git。请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md) 和 [`SECURITY.md`](SECURITY.md)。

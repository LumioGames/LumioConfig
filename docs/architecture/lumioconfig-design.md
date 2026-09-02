# LumioConfig 配表管线设计

本文是架构仓设计概要在本仓的执行入口。完整设计与裁决流水以架构仓为准（架构仓已于 2026-09-01 改名 `LumioGameEngine`、文档收敛到唯一根 `.spec/`）：

- 设计概要：[`LumioGameEngine/.spec/knowledge/features/config-table.md`](https://github.com/LumioGames/LumioGameEngine/blob/main/.spec/knowledge/features/config-table.md)（2026-08-30 定稿；2026-09-02 M6 网页编辑器节按落地方案更新为「首版完整编辑」）。
- 裁决流水：[`LumioGameEngine/.spec/reviews/2026-08-30-config-table-architecture-decisions.md`](https://github.com/LumioGames/LumioGameEngine/blob/main/.spec/reviews/2026-08-30-config-table-architecture-decisions.md)。
- M6 落地方案：[`LumioGameEngine/.spec/plans/2026-09-02-config-web-editor-landing.md`](https://github.com/LumioGames/LumioGameEngine/blob/main/.spec/plans/2026-09-02-config-web-editor-landing.md)。
- 历史指针：本文首版对应架构仓旧名 `LumioGameEngineArchitecture` PR `#49`（提交 `d2a7883ea447d2c34b92269c1f84ac9c3c53f5eb`，旧路径 `docs/specs/2026-08-30-lumioconfig-design-overview.md`，已随文档收敛迁移）。

## 核心不变量

1. Schema-first 文本源是表的真身，编辑器只是补丁客户端。
2. 内容指纹描述逻辑值，与文本或未来二进制包装格式无关。
3. 一台生产实例绑定一套完整 Revision，不在运行中混用版本。
4. AI 可以查、提案、预检、预演和提交，但没有生产激活权。

## 本仓落点

- `schemas/`、`tables/`、`registry/` 提供源数据闭环；`src/lumio_config/` 提供解析、校验、指纹、补丁门、发号与导出实现；`tools/lumio_config.py` 是本地和 CI 的统一入口。
- 生成目录只用于验证和预览；提交的产物必须标记为生成物并可从源重建。
- 本仓决议 `docs/decisions/`：`0-1`~`0-6` 为阶段 0 六条；`0-7`（网页编辑器权威边界与技术选型）、`0-8`（草稿、提交与合并生命周期）为 M6 网页编辑器两条。全部为并行期暂落，不占架构仓 ADR 号，待并入清单见 `docs/decisions/pending-architecture-merge.md`。

## M6 网页编辑器（2026-09-02 定稿）

- 表格内核 Univer OSS（Apache-2.0，锁 0.25.x，禁 `@univerjs-pro/*`）+ React + Vite，源码在 `editor/`，构建产物随源提交到 `src/lumio_config/editor_static/`。
- Host 用 Python 标准库（`tools/lumio_config.py serve`），复用本仓 Canonical Core，不写第二套解析器，不建 Rust Host。
- `Ctrl+S` 只存本地草稿（`.lumio/drafts/`）；「提交补丁」生成带基线底稿指纹与 `expect` 的逐格补丁，M2 做单元格级三方合并（`STALE_BASELINE` / `DELETED_ROW_CONFLICT` 结构化冲突）。
- 提交成功后是否自动 commit（Git / SVN / 无）、是否自动导表，是 `.lumio/editor.json` 设置项。
- 首版导出只做 CSV / TSV 单向；XLSX、技能卡、领域插件、多人协作推迟并记有触发条件。
- 分卡与逐模块实现指引：`.spec/plans/2026-09-02-web-editor-design-prompt.md`（v2）；派活顺序：`.spec/plans/2026-09-02-lumioconfig-dispatch-prompt.md`。

## 暂不冻结

文本方言的最终标准、二进制后端、压缩和分块数值、签名信任链细则、跨仓自动分发，按设计概要阶段 0–3 顺序推进。Unicode 归一化在本仓阶段 0 决议 0-3 钉为 NFC，待并入架构仓，不在此提升为公共契约。

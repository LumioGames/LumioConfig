# 计划目录（历史记录）

历史实现计划留在这里：`YYYY-MM-DD-<name>.md`，靠日期自然排序，本目录不设索引。新工作任务真值由 Workflow 管理，项目文档不复制插件通用规程。

## 格式契约

- 文档 frontmatter 使用 `name`、单行 `description`、`metadata.type`、`metadata.status`；状态口径由已安装的官方 Workflow linter 校验。
- 本轮九份旧计划只增加 `metadata.type: doc` 与 `metadata.status: 历史归档` 等必需项；原顶层 `status: pending` / `in_progress` / `completed` 原样保留为当时事实，不据此断言今天的任务完成度。
- 历史归档描述文档用途，不把 pending 或 in_progress 改成 completed。原正文不修改，原件 SHA-256 与归档路径见 [治理历史说明](../../docs/reviews/2026-10-03-config-governance-history/README.md)。
- 本轮迁移依据 [ADR 0009](../decisions/0009-workflow-governance-migration.md)。
- 功能现状落 `knowledge/features/`；交回物与台账落 `docs/reviews/`，见 [dispatch](../knowledge/standards/dispatch.md)。

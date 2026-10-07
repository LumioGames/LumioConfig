---
name: dispatch
description: LumioConfig 的任务和审查交接格式——调度或收口时查
metadata:
  type: doc
  status: 已交付
---

# 任务与审查交接

任务卡或计划必须说明目标、文件范围、接口、验收标准和验证命令。交回物与进度台账一律落 `docs/reviews/`（入库路径）；worker 简报、中间 diff 等临时材料落已忽略的 `build/agent-work/`，不落任何台账或交回物。历史 `.sdd/` 原 README 与 ignore 已按字节归档，迁移依据与 M7-J/R-00402 选项 A 的历史边界见 [ADR 0009](../../decisions/0009-workflow-governance-migration.md)。交回物必须包含：

1. 改动清单。
2. 实际命令和关键输出。
3. known gaps。
4. 知识沉淀落点或无需沉淀声明。

审查者对照任务和仓库边界检查源/生成物区分、客户端可见性、错误语义和测试证据；不能只接受“已通过”的口头声称。

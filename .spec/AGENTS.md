# LumioConfig Agent 中心文档

LumioConfig 是 LumioGameEngine 的配表源和工具仓，拥有 Schema 实例、文本表、墓碑、校验器、格式化器和导出器；不拥有跨仓公共契约或运行时状态。

- 架构基线：LGE-V1.4-2026-08-27。
- 架构来源：LumioGames/LumioGameEngineArchitecture，设计来源为 PR #49 / 提交 d2a7883。
- 架构仓拥有公共 Envelope、Canonical/Hash、ID Namespace 授权、运行时生命周期和跨仓 Schema。
- 本仓拥有内容与工具；实现仓只消费可重建的只读投影。

## 调度核心

本仓只保留需要隔离审查的 reviewer 角色；编码任务由主 loop 按任务卡或计划执行。新功能遵循 brainstorming -> writing-plans -> 执行 -> 验证；公共契约缺口必须停下并回报架构仓。

| 名称 | 职责 | 何时调度 |
| --- | --- | --- |
| `reviewer` | 对照任务、边界和验证证据审查交付 | 实质代码或治理变更收口时 |

## 编码约定

- 先读 .spec/knowledge/README.md 和相关标准，再改文件。
- 新行为先写失败测试；纯文档和机械同步可声明 TDD 豁免。
- 源表、Schema、registry 是真源；build/ 和导出物不可手改。
- AI 只有查、提案、预检、预演、提交五个动作；没有激活动作。
- 完成前运行 Repository Policy 等价的本地命令，并提供实际输出。

## 仓库边界

1. tables/ 是权威文本源，不能以 Excel 或数据库覆盖它。
2. schemas/ 只描述数据，不承载 if、脚本或玩法逻辑。
3. 需要跨仓字段、错误码、稳定 ID 或字节规则时，先在架构仓走 ADR 流程。
4. 生成 Rust/C# 读取面和生产发布门属于后续阶段；首版不得伪造已冻结 API。

## 交回物

每次交付包含改动清单、命令与关键输出、known gaps，以及知识沉淀落点或无需沉淀声明。.spec/tasks/ 只保留在途卡，完成后删除。

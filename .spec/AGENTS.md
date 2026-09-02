# 项目中心文档

本项目使用 [LumioAgentSpec](https://github.com/LumioGames/LumioAgentSpec) 插件提供的调度与编码规程。
**通用规程（调度核心 / 编码约定 / 交回物格式 / 宿主差异）由插件在每次会话注入，本文件不复述**——这里只写 LumioConfig 独有的东西。

## 项目是什么

LumioConfig 是 LumioGameEngine 的配表源和工具仓，拥有 Schema 实例、文本表、墓碑、校验器、格式化器和导出器；不拥有跨仓公共契约或运行时状态。

- 架构基线：LGE-V1.4-2026-08-27。
- 架构来源：LumioGames/LumioGameEngineArchitecture，当前主线提交为 a7c1221；设计来源为 PR #49 / 提交 d2a7883。
- 架构仓拥有公共 Envelope、Canonical/Hash、ID Namespace 授权、运行时生命周期和跨仓 Schema；本仓拥有内容与工具，实现仓只消费可重建的只读投影。
- 生成 Rust/C# 读取面和生产发布门属于后续阶段；首版不得伪造已冻结 API。

## 收口门槛

```bash
python -m unittest discover -s tests -v
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
git diff --check
```

- 表源、Schema、registry 变更另附 `export` 与 `patch validate` 证据。
- `.spec/` 结构校验走 lumio 插件的 `/lumio:lint`（等价于 `node <插件目录>/tools/spec-lint.mjs .`），提交前必须通过。

## 项目专属约定

**红线（与插件通用规程冲突时，以本节为准）：**

1. `tables/` 是权威文本源，不得以 Excel 或数据库覆盖；`schemas/` 只描述数据，不得承载 if、脚本、蓝图式逻辑或隐式运行时行为。
2. `tables/`、`schemas/`、`registry/` 是真源；`build/`、`dist/`、`generated/` 是生成物，只能经工具命令重建并与源一起提交，不得手改。
3. 密钥、生产数据、用户数据、真实未公开业务数据不得入库。
4. AI 对生产 Revision 只有查、提案、预检、预演、提交五个动作；没有激活动作，生产激活必须过人类 Owner 门。
5. 跨仓字段、错误码、稳定 ID、字节规则等公共契约归架构仓所有，先在架构仓走 ADR 与契约校验流程，不得在本仓发明。
6. 对外 push、发布、改访问控制、生产操作须用户/Owner 明确授权。

**审查要点（插件 reviewer 审本仓交付时必查）：**

- 权威源与生成物边界是否清楚；客户端投影是否物理排除隐藏列。
- Schema、错误、指纹和行号规则是否与任务一致。
- 测试是否覆盖成功与失败路径，并附实际命令输出。
- 是否把架构仓公共契约或生产激活职责错误下沉到本仓。

**项目专属技能（插件不提供，留在 `skills/`）：** `cross-repo-delivery`（七仓派活与核验）、`td-progress-audit`（TD 进度盘点）。

## 知识与决策

- 规范与功能记录：[`knowledge/README.md`](knowledge/README.md)（导航）
- 决策唯一落点：[`decisions/`](decisions/README.md)（ADR，不改写、只新增取代）；跨仓架构 ADR 镜像在 `docs/decisions/`（来源架构仓，本仓不改写）
- 实现计划：[`plans/`](plans/README.md)（历史记录，日期前缀、不设索引）
- 离线任务卡：[`tasks/`](tasks/README.md)（无内置任务工具的宿主用）

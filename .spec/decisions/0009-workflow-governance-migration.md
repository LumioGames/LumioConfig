# 0009 · Config 治理文档迁移与官方 Workflow 校验身份统一

- 日期:2026-10-03
- 状态:生效

## 背景

Config ADR 0001/0002 采用 LumioAgentSpec lumio--v1.1.0；当前宿主实际执行 Workflow 1.3.6，CI 仍拉旧上游、旧入口且未开 strict。九份历史计划只有旧 status，现行 linter 要求 name、description、metadata.type、metadata.status。M7-J/R-00402 的 Owner 选项 A 把永久交回物放 docs/reviews，并明确要求仓根 .sdd/README.md 入库；历史执行与 QA 均确认此选择。现行官方 linter 禁仓根 .sdd，不能靠删除合法历史、关闭 fingerprint 或根例外关闭诊断。

## 决策

1. 保留 M7-J 选项 A 的永久交回物落 docs/reviews；仅取代它的临时目录位置与 tracked .sdd README 要求：新临时材料落已忽略的 build/agent-work，旧 .sdd README/.gitignore 按原字节迁入 docs/reviews/2026-10-03-config-governance-history/sdd-originals。先核验归档哈希和完整目录备份，后移出仓根 .sdd，绝不删除未备份材料。
2. 九份历史计划保留路径、原顶层 status 和正文，仅添加现行四项元数据，metadata.status 为历史归档。九份整文件原件另归档，pending/in_progress 不改 completed，不据历史文档推断当前任务状态。
3. CI 使用官方 LumioGames/workflow-plugin v1.3.6，确认完整提交 4911c828e2f2c9913443985d253ca030b33a7c7b 与 plugin/plugin.json 版本后运行 plugin/bin/spec-lint.mjs . --strict。本地运行同版官方 bin/spec-lint.mjs，保留默认 fingerprint；不 vendoring、不复制替身、不添加 check disable 或 project-root 例外。
4. 宿主托管安装走宿主刷新/更新渠道，回读版本并重启会话；不以官网手动渠道清单覆盖托管缓存。现有完整缓存已是 1.3.6，旧 marketplace 快照 0.5.0 的处理需宿主渠道确认，不宣称本次已更新宿主。
5. 部分取代 ADR 0001 的插件名称/分发路径与 status-only 元数据约定，取代 ADR 0002 的 CI tag/入口；旧 ADR 仅改状态链接，正文保留。其他所有权、公开契约和永久交回物路径不变。

## 授权与验证边界

本次协调者于 2026-10-03 依据用户完整交付附件第六节“普通实现、依赖恢复、可逆配置和环境修复自行处理”及剩余协调授权，选择执行本条可逆项目治理迁移。该选择是协调者依已有授权作出的实施决定；M7-J/R-00402 的人类 Owner 于 2026-09-04 选择 A 的历史不改写，不记为人类本次另选了新临时路径。

本次只处理项目文档、临时材料落点与官方工具身份。本地验收使用真实 owning Config 文件系统及 git 索引上的正常 strict lint，默认 fingerprint 保持启用，并核验原件归档、旧状态和正文、链接导航与精确差异。CI 的固定来源/入口已更新，实际远端 CI 运行须在获准推送后另附结果；本地通过不能替代远端执行。官方编译器重建、发布或公共契约验收仍各有独立证据门，本条不关闭这些门。

## 后果

增加可审计历史快照；永久交回物仍可检索，临时材料不被误当作台账。CI 依赖官方上游 Git，tag 漂移将因完整提交检查失败；后续升级须同一更改统一 CI/local 并重新冻结证据。治理诊断是否关闭以实际严格校验结果为准。

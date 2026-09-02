# 0001 · Agent 治理框架改用 LumioAgentSpec 插件分发

- 日期:2026-09-02
- 状态:生效

## 背景

本仓自 bootstrap 起以 vendored 方式内置 Agent 治理框架：`.spec/rules`、`.spec/agents`、`.spec/tools`（spec-lint）与 13 个 `.spec/skills`，来源 Go1c/LumioAgent@28610f8，由 `.spec/lumio-agent.lock` 锁定。框架上游已演化为 [LumioGames/LumioAgentSpec](https://github.com/LumioGames/LumioAgentSpec) 并改为插件分发（Agent Plugins 1.0.0 + Claude Code marketplace），上游决策 0006 将技能精简为 6 个（劝导型技能下线并入规则）、0007 改为契约先行、并行派发、统一合入后审一次。双源维护导致本仓与上游持续漂移，升级需手工同步整目录。

## 决策

- 框架面（通用技能、红线规则、reviewer 子 Agent、spec-lint、hooks/commands）全部改由 `lumio` 插件提供；本仓 `.spec/` 只留项目实例：`AGENTS.md`、`knowledge/`、`decisions/`、`plans/`、`tasks/` 与项目专属技能。
- 技能以插件原版 6 个为准。`before-you-code`、`verification-before-completion`、`receiving-code-review`、`using-git-worktrees` 已被上游下线（要求并入插件 `rules/dispatch.md`），`task-breakdown` 并入 `writing-plans`，本仓随之删除，不保留本地副本。
- `cross-repo-delivery`、`td-progress-audit` 是七仓派活流程的项目技能，插件不提供，保留在 `.spec/skills/`，经 `.agents/skills`、`.claude/skills` 链接待用。
- 原 `.spec/rules/system.md` 的项目红线与 `.spec/agents/reviewer.agent.md` 的审查要点并入 `.spec/AGENTS.md`「项目专属约定」；调度、编码约定、交回物格式等通用规程由插件每次会话注入，本仓不复述。
- 计划唯一根收敛到 `.spec/plans/`：`docs/plans/2026-08-30-lumioconfig-repository-bootstrap.md` 迁入并补 `status: completed` frontmatter（spec-lint 禁并行文档根）。`docs/decisions/` 保留为架构仓 ADR 镜像，与本地决策落点 `.spec/decisions/` 分工。
- `scripts/ensure-agent-links.*` 不再链接 `.claude/agents`（reviewer 由插件提供）。

## 后果

- 未安装插件的宿主拿不到通用技能与自动规则注入，靠 `AGENTS.md` 入口指针主动读项目实例兜底；安装 `lumio` 插件后恢复全部能力。提交前结构校验由插件 PreToolUse hook 接管，无 hook 的宿主须手动跑 `/lumio:lint`。
- ZCode 侧插件为按官方目录布局（`cache/`、`marketplaces/`、`data/`）手工安装的 1.1.0 快照；上游发版后需同步更新该安装或改走客户端 Plugin Management UI 重装。
- 本仓 `.spec/` 从此不含任何框架代码，框架升级 = 更新插件，不再产生仓内 diff。
- 迁移前快照：分支 `backup/agent-framework-vendored`、tag `backup-20260902`、仓外副本 `../LumioConfig.spec-backup-20260902/`。

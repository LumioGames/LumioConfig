# 0002 · CI 结构校验改从 LumioAgentSpec 上游拉取

- 日期:2026-09-02
- 状态:生效

## 背景

ADR 0001 删除仓内 `.spec/tools/spec-lint.mjs` 后，`repository-policy.yml` 仍引用该路径（迁移遗漏，推送必红）。GitHub runner 上没有 lumio 插件，`/lumio:lint` 与 PreToolUse hook 只覆盖装了插件的宿主，CI 必须另行取得 linter。

## 决策

- CI「Validate governance structure」步骤按 tag `lumio--v1.1.0`（commit b0fa9ca，经比对与本机插件缓存 1.1.0 逐字节一致）浅克隆 LumioGames/LumioAgentSpec，运行其 `plugin/tools/spec-lint.mjs .`。
- 不再在 CI 跑框架自测（原 `spec-lint.test.mjs`）：框架代码的测试归上游仓，本仓 CI 只校验本仓 `.spec/` 结构。
- 框架升级 = 同步 bump workflow 中的该 tag，与本机插件版本保持一致。

## 后果

- CI 新增对 github.com 上游仓的网络依赖；tag 被移动或删除会使 CI 失败（视为升级信号而非事故）。
- 未装插件的宿主与 CI 跑同一版本 linter，口径一致。

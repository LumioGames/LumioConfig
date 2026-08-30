---
name: workflow
description: LumioConfig 的分支、提交、评审和验证流程——改动或开 PR 前查
metadata:
  type: doc
  status: 已交付
---

# 工作流

- main 只接受经过 Pull Request 和 Repository Policy 的变更。
- 一次提交只做一类事，标题使用 type(scope): subject。
- 表源、Schema、registry 变更必须附 validate、format --check 和导出证据。
- 公共契约变更先在架构仓完成 ADR、Schema/ID/Fixture，再同步本仓。
- 生成物必须由命令重建；不要直接编辑 build/ 或未来的 generated/。
- 对外 push、发布或生产激活动作须有用户/Owner 的明确授权；本仓 CLI 不具备激活权限。

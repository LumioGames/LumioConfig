---
status: pending
---

# 收口验证：editor UI 基础组件重构

整体收口验证——确认 `editor-ui-*` 全部卡片合入后，`editor/` 应用行为与视觉均未回归，且知识文档状态可以从"设计中"更新为"已交付"。本卡不改代码，只跑收口门槛并汇总证据。

## 涉及范围

- 修改：`.spec/knowledge/features/editor-ui-primitives.md`（仅 frontmatter 的 `metadata.status` 字段：`设计中` → `已交付`）

## 实现

依次执行并记录输出：

```bash
cd editor
pnpm lint
pnpm build
pnpm test
pnpm e2e
```

全部通过后，把 `.spec/knowledge/features/editor-ui-primitives.md` frontmatter 的 `metadata.status: 设计中` 改为 `metadata.status: 已交付`，其余内容不变。

提交：

```bash
git add .spec/knowledge/features/editor-ui-primitives.md
git commit -m "docs(editor): mark editor UI primitives feature as delivered"
```

## 验收标准

- [ ] `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm e2e` 四条命令全部通过，交付证据附带命令与关键输出（不得只声称"已通过"）。
- [ ] `.spec/knowledge/features/editor-ui-primitives.md` 的 `metadata.status` 为 `已交付`。
- [ ] `/lumio:lint`（`.spec/` 结构校验）通过。

## 依赖

editor-ui-app-css-cleanup

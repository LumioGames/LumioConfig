---
status: pending
---

# 新增 UI 基础组件的汇出入口

新增 `editor/src/components/ui/index.ts`，把 `Button`/`Panel`/`DataTable` 及其类型统一汇出，后续所有面板迁移卡都从这一个入口导入（`import { Button, Panel, DataTable } from "../components/ui";`），而不是分别 `import` 三个文件。小任务，不新增单测（本身没有可测行为，靠 `tsc` 校验导出齐全）。

## 涉及范围

- 新增：`editor/src/components/ui/index.ts`

## 接口

**Consumes**（来自本卡依赖的三张卡，导出名必须逐一匹配）：
- `editor/src/components/ui/Button.tsx` 的 `Button`、`ButtonProps`、`ButtonVariant`
- `editor/src/components/ui/Panel.tsx` 的 `Panel`、`PanelProps`、`PanelTag`、`PanelTone`、`PanelVariant`
- `editor/src/components/ui/DataTable.tsx` 的 `DataTable`、`DataTableColumn`、`DataTableProps`

**Produces**（供 `editor-ui-migrate-simple-panels`、`editor-ui-migrate-diff-preview`、`editor-ui-migrate-conflict-panel` 三张卡使用）：单一入口 `editor/src/components/ui/index.ts`，重新汇出上述全部符号。

## 实现

完整写入 `editor/src/components/ui/index.ts`：

```ts
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant } from "./Button";
export { Panel } from "./Panel";
export type { PanelProps, PanelTag, PanelTone, PanelVariant } from "./Panel";
export { DataTable } from "./DataTable";
export type { DataTableColumn, DataTableProps } from "./DataTable";
```

提交：

```bash
git add editor/src/components/ui/index.ts
git commit -m "feat(editor): barrel-export UI primitives"
```

## 验收标准

- [ ] `editor/src/components/ui/index.ts` 内容与上文完全一致。
- [ ] `pnpm lint`、`pnpm build`（`tsc --noEmit` 部分）通过，确认三个组件的导出名与本文件一致、无拼写错误。

## 依赖

editor-ui-button、editor-ui-panel、editor-ui-datatable

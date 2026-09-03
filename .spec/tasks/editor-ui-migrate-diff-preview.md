---
status: pending
---

# 迁移 DiffPreview 到 Panel + DataTable

把 `editor/src/panels/DiffPreview.tsx` 的外壳 `<section>` 换成 `Panel`、手写 `<table>` 换成 `DataTable`。纯重构，不改变视觉或交互行为，所有 `data-testid` 原值必须保留。小任务，不新增单测，靠现有 e2e 验证。

暂时不要动 `editor/src/styles/app.css`——`.diff-preview`（padding/max-height/overflow）、`.diff-preview__actions`、`.diff-preview table/th/td` 这几条规则留到 `editor-ui-app-css-cleanup` 卡统一清理；本卡改完之后，`.diff-preview table` 之类的旧标签选择器规则会和新的 `.data-table` 规则同时命中同一个 `<table>`、声明值不冲突，是预期的中间状态。

## 涉及范围

- 修改：`editor/src/panels/DiffPreview.tsx`

## 实现

完整替换为：

```tsx
import type { PatchObject, PatchOp } from "../api/types";
import { Button, DataTable, Panel } from "../components/ui";

interface DiffPreviewProps {
  patch: PatchObject | null;
  summary: string;
  revision: string;
  autoCommit: boolean;
  autoExport: boolean;
  canValidate: boolean;
  canSubmit: boolean;
  disabled: boolean;
  onValidate: () => void;
  onSubmit: () => void;
}

interface OpRow {
  op: PatchOp;
  index: number;
}

function describeOp(op: PatchOp): string {
  if (op.op === "update") {
    return Object.entries(op.set ?? {})
      .map(([column, value]) => `${column}: ${op.expect?.[column] ?? ""} → ${String(value)}`)
      .join("; ");
  }
  if (op.op === "rename") {
    return `${op.name} → ${op.to}`;
  }
  if (op.op === "delete") {
    return op.name;
  }
  return op.name;
}

export function DiffPreview({
  patch,
  summary,
  revision,
  autoCommit,
  autoExport,
  canValidate,
  canSubmit,
  disabled,
  onValidate,
  onSubmit,
}: DiffPreviewProps) {
  const rows: OpRow[] = (patch?.ops ?? []).map((op, index) => ({ op, index }));
  return (
    <Panel className="diff-preview" data-testid="diff-preview">
      <div className="diff-preview__actions">
        <Button data-testid="btn-validate" disabled={disabled || !canValidate} onClick={onValidate}>
          预检
        </Button>
        <Button data-testid="btn-submit" disabled={disabled || !canSubmit} onClick={onSubmit}>
          提交补丁
        </Button>
      </div>
      <p data-testid="diff-target">
        将提交到：{revision || "—"}，autoCommit={String(autoCommit)}，autoExport={String(autoExport)}
      </p>
      <p data-testid="diff-summary">{summary || "尚未预检"}</p>
      <DataTable
        rowKey={(row) => `${row.op.op}-${row.op.name}-${row.index}`}
        rows={rows}
        columns={[
          { key: "table", header: "表", render: () => patch?.table },
          { key: "row", header: "行", render: (row) => row.op.name },
          { key: "op", header: "操作", render: (row) => row.op.op },
          { key: "change", header: "改动", render: (row) => describeOp(row.op) },
        ]}
      />
    </Panel>
  );
}
```

提交：

```bash
git add editor/src/panels/DiffPreview.tsx
git commit -m "refactor(editor): migrate DiffPreview to Panel/DataTable"
```

## 验收标准

- [ ] `DiffPreview.tsx` 里的 `data-testid`（`diff-preview`/`btn-validate`/`btn-submit`/`diff-target`/`diff-summary`）与改动前完全一致。
- [ ] `pnpm lint`、`pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm e2e` 中覆盖预检/提交补丁与 diff 表格渲染的用例（如 `host-submit.spec.ts`）全部通过。

## 依赖

editor-ui-index-barrel

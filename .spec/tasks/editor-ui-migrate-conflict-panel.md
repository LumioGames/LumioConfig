---
status: pending
---

# 迁移 ConflictPanel 到 Panel + DataTable

把 `editor/src/panels/ConflictPanel.tsx` 的外壳 `<section>` 换成 `Panel tone="warning"`、手写 `<table>` 换成 `DataTable`、7 个动作按钮换成 `Button`。纯重构，不改变视觉或交互行为，所有 `data-testid` 原值必须保留。小任务，不新增单测，靠现有 e2e 验证。

暂时不要动 `editor/src/styles/app.css`——`.conflict-panel`（padding/font-size/background/border-top/max-height/overflow）、`.conflict-panel table/th/td`、`.conflict-panel button` 这几条规则留到 `editor-ui-app-css-cleanup` 卡统一清理；本卡改完之后旧规则与 `editor-ui-tokens-styles` 卡新增的 `.panel--warning`/`.data-table` 规则同时命中、声明值不冲突，是预期的中间状态。

## 涉及范围

- 修改：`editor/src/panels/ConflictPanel.tsx`

## 实现

完整替换为：

```tsx
import type { RebaseConflict } from "../api/types";
import { Button, DataTable, Panel } from "../components/ui";

export type ConflictAction = "warehouse" | "mine" | "input" | "default" | "null" | "drop" | "cancel";

interface ConflictPanelProps {
  conflicts: RebaseConflict[];
  onAction: (conflict: RebaseConflict, action: ConflictAction, value?: string) => void;
}

export function ConflictPanel({ conflicts, onAction }: ConflictPanelProps) {
  if (!conflicts.length) {
    return null;
  }
  return (
    <Panel tone="warning" className="conflict-panel" data-testid="conflict-panel" title="提交冲突">
      <p>没有强制覆盖。解决全部冲突后重新预检并提交。</p>
      <DataTable
        rowKey={(conflict) => `${conflict.rowId}-${conflict.column}-${conflict.code}`}
        rows={conflicts}
        columns={[
          { key: "table", header: "表", render: (conflict) => conflict.table },
          { key: "row", header: "行", render: (conflict) => `${conflict.row} (${conflict.rowId})` },
          { key: "column", header: "列", render: (conflict) => conflict.column || conflict.code },
          { key: "base", header: "打开时", render: (conflict) => conflict.base ?? "" },
          { key: "current", header: "仓库当前", render: (conflict) => conflict.current ?? "" },
          { key: "draft", header: "你的草稿", render: (conflict) => conflict.draft ?? "" },
          {
            key: "actions",
            header: "动作",
            render: (conflict) =>
              conflict.code === "DELETED_ROW_CONFLICT" || !conflict.column ? (
                <>
                  <Button data-testid="conflict-drop" onClick={() => onAction(conflict, "drop")}>
                    放弃我的改动
                  </Button>
                  <Button data-testid="conflict-cancel" onClick={() => onAction(conflict, "cancel")}>
                    取消提交
                  </Button>
                </>
              ) : (
                <>
                  <Button data-testid="conflict-warehouse" onClick={() => onAction(conflict, "warehouse")}>
                    采仓库值
                  </Button>
                  <Button data-testid="conflict-mine" onClick={() => onAction(conflict, "mine")}>
                    采我的值
                  </Button>
                  <Button
                    data-testid="conflict-input"
                    onClick={() => {
                      const value = window.prompt("手工输入", conflict.draft ?? "");
                      if (value !== null) {
                        onAction(conflict, "input", value);
                      }
                    }}
                  >
                    手工输入
                  </Button>
                  <Button data-testid="conflict-default" onClick={() => onAction(conflict, "default")}>
                    恢复默认
                  </Button>
                  <Button data-testid="conflict-null" onClick={() => onAction(conflict, "null")}>
                    设为 null
                  </Button>
                  <Button data-testid="conflict-cancel" onClick={() => onAction(conflict, "cancel")}>
                    取消本次提交
                  </Button>
                </>
              ),
          },
        ]}
      />
    </Panel>
  );
}
```

提交：

```bash
git add editor/src/panels/ConflictPanel.tsx
git commit -m "refactor(editor): migrate ConflictPanel to Panel/DataTable"
```

## 验收标准

- [ ] `ConflictPanel.tsx` 里的全部 `data-testid`（`conflict-panel`/`conflict-drop`/`conflict-cancel`/`conflict-warehouse`/`conflict-mine`/`conflict-input`/`conflict-default`/`conflict-null`）与改动前完全一致。
- [ ] `pnpm lint`、`pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm e2e` 中覆盖冲突解决流程的用例（`host-rebase.spec.ts`）全部通过。

## 依赖

editor-ui-index-barrel

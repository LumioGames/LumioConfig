---
status: pending
---

# 新增 DataTable 基础组件

在 `editor/src/components/ui/DataTable.tsx` 新增泛型 `DataTable` 组件，替代 ConflictPanel 和 DiffPreview 里结构与 CSS 完全重复的 `<table>/<thead>/<tbody>` 手写标签。命名为 `DataTable` 而非 `Table`，避免与仓库里"表"（`tables/` 配表）这一业务概念混淆。新组件，属于"大任务"，先写失败测试再实现。

## 涉及范围

- 新增：`editor/src/components/ui/DataTable.tsx`
- 新增：`editor/tests/DataTable.test.tsx`

## 接口

**Produces**（供 `editor-ui-index-barrel` 及后续迁移卡使用，签名必须精确一致）：

```ts
export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  "data-testid"?: string;
}

export function DataTable<T>(props: DataTableProps<T>): JSX.Element;
```

渲染为 `<table className="data-table" data-testid={...}><thead><tr>{按 columns 顺序渲染 <th>{column.header}</th>}</tr></thead><tbody>{按 rows 顺序渲染 <tr key={rowKey(row)}>{按 columns 顺序渲染 <td>{column.render(row)}</td>}</tr>}</tbody></table>`。

## 步骤

- [ ] **Step 1：写失败测试** —— 完整写入 `editor/tests/DataTable.test.tsx`：

```tsx
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable } from "../src/components/ui/DataTable";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

interface Row {
  id: string;
  name: string;
}

describe("DataTable", () => {
  const rows: Row[] = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
  ];

  it("renders one header cell per column and one row per item, in order", () => {
    const el = mount(
      <DataTable
        data-testid="dt"
        rowKey={(row) => row.id}
        rows={rows}
        columns={[
          { key: "id", header: "ID", render: (row) => row.id },
          { key: "name", header: "Name", render: (row) => row.name },
        ]}
      />,
    );
    const table = el.querySelector('[data-testid="dt"]') as HTMLTableElement;
    expect(table.tagName).toBe("TABLE");
    expect(table.className).toBe("data-table");
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toEqual(["ID", "Name"]);
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].textContent).toBe("aAlpha");
    expect(bodyRows[1].textContent).toBe("bBeta");
  });

  it("renders an empty tbody when rows is empty", () => {
    const el = mount(
      <DataTable
        data-testid="dt"
        rowKey={(row) => row.id}
        rows={[]}
        columns={[{ key: "id", header: "ID", render: (row) => row.id }]}
      />,
    );
    const table = el.querySelector('[data-testid="dt"]') as HTMLTableElement;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(table.querySelectorAll("thead th")).toHaveLength(1);
  });
});
```

- [ ] **Step 2：确认测试失败** —— 运行 `pnpm vitest run tests/DataTable.test.tsx`，预期报错 `Failed to resolve import "../src/components/ui/DataTable"`。

- [ ] **Step 3：写最小实现** —— 完整写入 `editor/src/components/ui/DataTable.tsx`：

```tsx
import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  "data-testid"?: string;
}

export function DataTable<T>({ columns, rows, rowKey, "data-testid": dataTestId }: DataTableProps<T>) {
  return (
    <table className="data-table" data-testid={dataTestId}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td key={column.key}>{column.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4：确认测试通过** —— 运行 `pnpm vitest run tests/DataTable.test.tsx`，全部 PASS。

- [ ] **Step 5：提交**

```bash
git add editor/src/components/ui/DataTable.tsx editor/tests/DataTable.test.tsx
git commit -m "feat(editor): add DataTable UI primitive"
```

## 验收标准

- [ ] `editor/tests/DataTable.test.tsx` 全部用例通过。
- [ ] `pnpm lint`、`pnpm build`（`tsc --noEmit` 部分）通过。

## 依赖

无

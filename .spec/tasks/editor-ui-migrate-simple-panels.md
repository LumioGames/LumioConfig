---
status: pending
---

# 迁移不含表格的面板到 Button/Panel

把 TableList、App.tsx 里的四态菜单（four-state-menu）与"刷新"按钮、SettingsPanel、ErrorPanel、ExportPanel 改为使用 `editor/src/components/ui` 的 `Button`/`Panel`，消除手写 `<button>`/外壳标签。这些面板都不涉及表格，不需要 `DataTable`。纯重构，不改变任何现有视觉或交互行为，所有 `data-testid` 原值必须保留——e2e 测试（Playwright，只用 `getByTestId` 选择）是本次重构的回归安全网。小任务（每个文件的净改动都远小于 50 有效行），不新增单测，靠现有 e2e 验证。

暂时不要删除 `editor/src/styles/app.css` 里任何现有规则——旧的 `.table-list button`/`.four-state-menu button`/`.draft-refresh` 等按 CSS 标签选择器（如 `.table-list button`）依然会命中新组件渲染出的真实 `<button>` DOM 元素，与 `editor-ui-tokens-styles` 卡新增的 `.btn--nav`/`.btn--menu`/`.btn--primary` 规则同时生效、声明值完全相同，不会冲突。app.css 的清理统一放到 `editor-ui-app-css-cleanup` 卡，等全部消费者都迁移完再一次性做，避免中间状态下有文件还依赖旧规则却被误删。

## 涉及范围

- 修改：`editor/src/panels/TableList.tsx`
- 修改：`editor/src/app/App.tsx`（仅四态菜单渲染块与"刷新"按钮渲染块，其余逻辑不动）
- 修改：`editor/src/panels/SettingsPanel.tsx`
- 修改：`editor/src/panels/ErrorPanel.tsx`
- 修改：`editor/src/panels/ExportPanel.tsx`

## 实现

**`editor/src/panels/TableList.tsx`**（完整替换）：

```tsx
import { FIXTURES } from "../fixtures/catalog";
import { Button } from "../components/ui";

interface TableListProps {
  selected: string;
  onSelect: (name: string) => void;
  dirtyCounts?: Record<string, number>;
  names?: { name: string; label?: string }[];
}

export function TableList({ selected, onSelect, dirtyCounts = {}, names }: TableListProps) {
  const items = names ?? FIXTURES;
  return (
    <nav className="table-list" data-testid="table-list" aria-label="tables">
      <h1>LumioConfig</h1>
      <p className="table-list__note">草稿自动保存，不写权威源</p>
      <ul>
        {items.map((fixture) => (
          <li key={fixture.name}>
            <Button
              variant="nav"
              active={fixture.name === selected}
              data-testid={`table-${fixture.name}`}
              onClick={() => onSelect(fixture.name)}
            >
              {fixture.label ?? fixture.name}
              {dirtyCounts[fixture.name] ? ` · ${dirtyCounts[fixture.name]}` : ""}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

**`editor/src/panels/SettingsPanel.tsx`**（完整替换）：

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Panel } from "../components/ui";
import type { SessionResponse } from "../api/types";

interface SettingsPanelProps {
  enabled: boolean;
}

export function SettingsPanel({ enabled }: SettingsPanelProps) {
  const [autoCommit, setAutoCommit] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void api<SessionResponse>("/api/session")
      .then((session) => {
        setAutoCommit(session.settings.submit.autoCommit);
      })
      .catch(() => undefined);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <Panel data-testid="settings-panel">
      <label>
        <input
          type="checkbox"
          data-testid="setting-autocommit"
          checked={autoCommit}
          onChange={async (event) => {
            const value = event.target.checked;
            setAutoCommit(value);
            try {
              await api("/api/settings/local", {
                method: "PUT",
                body: JSON.stringify({ submit: { autoCommit: value } }),
              });
              setMessage("已写入 local.json");
            } catch (error) {
              setMessage(String(error));
            }
          }}
        />
        autoCommit
      </label>
      <span data-testid="settings-message">{message}</span>
    </Panel>
  );
}
```

**`editor/src/panels/ErrorPanel.tsx`**（完整替换）：

```tsx
import { Button, Panel } from "../components/ui";

interface ErrorItem {
  table?: string;
  row?: string;
  column?: string;
  code?: string;
  message?: string;
}

interface ErrorPanelProps {
  errors: ErrorItem[];
  onJump?: (row?: string, column?: string) => void;
}

export function ErrorPanel({ errors, onJump }: ErrorPanelProps) {
  if (!errors.length) {
    return null;
  }
  return (
    <Panel as="ul" data-testid="error-panel">
      {errors.map((error, index) => (
        <li key={`${error.code}-${index}`}>
          <Button onClick={() => onJump?.(error.row, error.column)}>
            {error.code}: {error.message}
          </Button>
        </li>
      ))}
    </Panel>
  );
}
```

**`editor/src/panels/ExportPanel.tsx`**（完整替换——只有外层 `<section>` 换成 `<Panel variant="boxed" title=...>`、末尾 `<button>` 换成 `<Button>`，选择框/列表逻辑原样保留）：

```tsx
import { useState } from "react";
import { api } from "../api/client";
import { Button, Panel } from "../components/ui";

interface ExportFile {
  table?: string | null;
  href: string;
}

interface ExportResponse {
  exportId: string;
  files: ExportFile[];
}

interface ExportPanelProps {
  tables: string[];
  selected: string;
}

export function ExportPanel({ tables, selected }: ExportPanelProps) {
  const [format, setFormat] = useState<"csv" | "tsv">("csv");
  const [source, setSource] = useState<"repo" | "draft">("repo");
  const [target, setTarget] = useState("");
  const [files, setFiles] = useState<ExportFile[]>([]);
  const [hint, setHint] = useState("");

  return (
    <Panel variant="boxed" className="export-panel" data-testid="export-panel" title="导出 CSV / TSV">
      <p>单向生成物，不能导回仓库。</p>
      <label>
        格式
        <select data-testid="export-format" value={format} onChange={(event) => setFormat(event.target.value as "csv" | "tsv")}>
          <option value="csv">CSV</option>
          <option value="tsv">TSV</option>
        </select>
      </label>
      <label>
        来源
        <select data-testid="export-source" value={source} onChange={(event) => setSource(event.target.value as "repo" | "draft")}>
          <option value="repo">仓库</option>
          <option value="draft">草稿</option>
        </select>
      </label>
      <label>
        目标
        <select data-testid="export-target" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">全部列</option>
          <option value="S">S</option>
          <option value="C">C</option>
          <option value="V">V</option>
        </select>
      </label>
      <Button
        data-testid="btn-export"
        onClick={() => {
          void (async () => {
            try {
              const result = await api<ExportResponse>("/api/export", {
                method: "POST",
                body: JSON.stringify({
                  format,
                  source,
                  tables: tables.length ? tables : [selected],
                  targets: target ? [target] : undefined,
                }),
              });
              setFiles(result.files);
              setHint("");
            } catch (error) {
              setHint(error instanceof Error ? error.message : String(error));
            }
          })();
        }}
      >
        导出
      </Button>
      {hint ? <p data-testid="export-hint">{hint}</p> : null}
      <ul data-testid="export-files">
        {files.map((file) => (
          <li key={file.href}>
            <a
              href={file.href}
              data-testid="export-link"
              onClick={(event) => {
                event.preventDefault();
                void (async () => {
                  const token = sessionStorage.getItem("lumio-token");
                  const response = await fetch(file.href, {
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  });
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = file.href.split("/").pop() ?? "export";
                  link.click();
                  URL.revokeObjectURL(url);
                })();
              }}
            >
              {file.table ?? file.href}
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
```

**`editor/src/app/App.tsx`** —— 两处局部修改：

1. 在现有 import 块（`import { TableList } from "../panels/TableList";` 之后）新增一行：

```tsx
import { Button } from "../components/ui";
```

2. 把四态菜单渲染块（原 `{menu ? (<ul className="four-state-menu" ...>...）` 一段）里的每个 `<button>` 换成 `<Button variant="menu">`——即把：

```tsx
                <button
                  type="button"
                  data-testid={`four-state-${item.kind}`}
                  onClick={() => {
```

换成：

```tsx
                <Button
                  variant="menu"
                  data-testid={`four-state-${item.kind}`}
                  onClick={() => {
```

对应地把该按钮的收尾标签从 `</button>` 换成 `</Button>`（整段 `onClick` 回调函数体和 `{item.label}` 子节点不变）。

3. 把"刷新"按钮：

```tsx
          <button
            type="button"
            data-testid="draft-refresh"
            className="draft-refresh"
            onClick={() => window.location.reload()}
          >
            刷新
          </button>
```

换成：

```tsx
          <Button
            variant="primary"
            data-testid="draft-refresh"
            onClick={() => window.location.reload()}
          >
            刷新
          </Button>
```

（不再需要 `className="draft-refresh"`——`variant="primary"` 已经带上对应样式，旧的 `.draft-refresh` app.css 规则会在 `editor-ui-app-css-cleanup` 卡里删除。）

提交（一次性覆盖本卡改动的全部文件）：

```bash
git add editor/src/panels/TableList.tsx editor/src/panels/SettingsPanel.tsx editor/src/panels/ErrorPanel.tsx editor/src/panels/ExportPanel.tsx editor/src/app/App.tsx
git commit -m "refactor(editor): migrate TableList/Settings/Error/Export panels and App shell buttons to Button/Panel"
```

## 验收标准

- [ ] 五个文件改动后，`grep -rn "data-testid" editor/src/panels/TableList.tsx editor/src/panels/SettingsPanel.tsx editor/src/panels/ErrorPanel.tsx editor/src/panels/ExportPanel.tsx editor/src/app/App.tsx` 输出的 testid 集合与改动前完全一致（可先在改动前跑一次记录基线）。
- [ ] `pnpm lint`、`pnpm build` 通过。
- [ ] `pnpm test`（vitest + check-deps）通过。
- [ ] `pnpm e2e` 全部通过，尤其是覆盖 TableList 切表、四态菜单、"刷新"按钮、ExportPanel 导出、SettingsPanel autoCommit 勾选的用例。

## 依赖

editor-ui-index-barrel

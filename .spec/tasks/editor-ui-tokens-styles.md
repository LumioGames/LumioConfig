---
status: pending
---

# 新增 editor 设计 token 与 UI 基础组件样式表

新增 `editor/src/styles/tokens.css`（颜色 token）与 `editor/src/styles/ui.css`（Button/Panel/DataTable 的基础样式），并在 `editor/src/main.tsx` 里按 tokens → ui → app 的顺序引入。这两份样式表是 `editor-ui-button`、`editor-ui-panel`、`editor-ui-datatable` 三张卡产出组件的视觉基础——class 名必须与那三张卡的组件产出完全一致（本卡已按最终约定写好，无需等待那三张卡完成即可开工）。

## 涉及范围

- 新增：`editor/src/styles/tokens.css`
- 新增：`editor/src/styles/ui.css`
- 修改：`editor/src/main.tsx`

## 实现

`editor/src/styles/tokens.css`（完整内容）：

```css
:root {
  --color-bg-app: #f6f7f9;
  --color-bg-surface: #fff;
  --color-border: #d8dee6;
  --color-border-subtle: #e6ebf1;
  --color-border-faint: #eef2f6;
  --color-text: #3c434c;
  --color-text-muted: #5c6570;
  --color-danger-text: #a1260d;
  --color-accent-bg: #e8f1ff;
  --color-accent-border: #8ab4f8;
  --color-warning-bg: #fff8e5;
  --color-warning-border: #f0d78c;
  --color-warning-border-subtle: #f3e6b8;
}
```

`editor/src/styles/ui.css`（完整内容——规则顺序不可打乱，`.panel--boxed`/`.panel--warning` 必须在 `.panel` 之后，靠源码顺序覆盖同优先级的 `border`/`padding`）：

```css
.btn--nav {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.btn--nav.is-active {
  background: var(--color-accent-bg);
  border-color: var(--color-accent-border);
}

.btn--menu {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
}

.btn--menu:hover {
  background: var(--color-accent-bg);
}

.btn--primary {
  margin: 6px 12px;
  padding: 6px 12px;
  border: 1px solid var(--color-accent-border);
  background: var(--color-accent-bg);
  border-radius: 6px;
  cursor: pointer;
}

.panel {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border-subtle);
  --data-table-border-color: var(--color-border-faint);
}

.panel--boxed {
  margin: 8px 12px;
  padding: 8px 12px;
  font-size: inherit;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
}

.panel--warning {
  padding: 8px 12px;
  background: var(--color-warning-bg);
  border-top-color: var(--color-warning-border);
  max-height: 220px;
  overflow: auto;
  --data-table-border-color: var(--color-warning-border-subtle);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  text-align: left;
  padding: 2px 6px;
  border-bottom: 1px solid var(--data-table-border-color, var(--color-border-faint));
}
```

`editor/src/main.tsx` 里的引入顺序（在 `import "./styles/app.css";` 之前插入两行，顺序必须是 tokens → ui → app，因为 app.css 里保留的 `.diff-preview` 覆盖规则要能压过 `ui.css` 的 `.panel` 基类）：

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/ui.css";
import "./styles/app.css";
```

这两份新样式表目前没有任何组件消费（Button/Panel/DataTable 还未创建），是预期状态——`editor-ui-app-css-cleanup` 卡会在所有消费者迁移完成后验证视觉效果。

## 验收标准

- [ ] `editor/src/styles/tokens.css`、`editor/src/styles/ui.css` 内容与上文完全一致。
- [ ] `editor/src/main.tsx` 按 tokens → ui → app 顺序引入三份样式表。
- [ ] `pnpm lint` 通过（本卡不改 .ts/.tsx 逻辑，只做纯配置改动，不要求先写失败测试）。
- [ ] `pnpm build`（`tsc --noEmit && vite build && ...`）通过，确认新增的两个 CSS 文件被 Vite 正常打包、不报错。

## 依赖

无

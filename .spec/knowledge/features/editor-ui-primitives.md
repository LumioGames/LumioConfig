---
name: editor-ui-primitives
description: editor/ 面板共享的 Button/Panel/DataTable 基础组件与 design token——改 editor/src/panels 或新增面板时查
metadata:
  type: doc
  status: 设计中
---

# editor 面板 UI 基础组件

## 目标

`editor/` 现有 7 个面板（ConflictPanel、DiffPreview、ErrorPanel、ExportPanel、SettingsPanel、StatusBar、TableList）各自手写按钮、表格和面板外壳标签，颜色以十六进制硬编码散落在 `app.css` 各处。抽取三个最小化可复用组件（Button、Panel、DataTable）和一份 design token，消除已存在的重复，为面板注入统一的视觉基础；不引入 Storybook、不建独立 package、不产出 `dist/`。

## 边界

只拥有 `editor/src/components/ui/` 下的组件源码和 `editor/src/styles/tokens.css`、`editor/src/styles/ui.css`；不拥有 `editor/` 之外任何代码，不构成可发布的设计系统包，不是 `/design-sync` 的同步目标（那是后续、有真实需求时才做的独立工作）。纯重构：不改变任何现有面板的视觉呈现或交互行为，所有 `data-testid` 原值保留（e2e 测试用 `getByTestId` 选择，是本次重构的回归安全网）。

## 组件设计

### tokens（`editor/src/styles/tokens.css`）

把 `app.css` 中重复出现的颜色值收进 `:root` 自定义属性，供 `ui.css` 和 `app.css` 共同引用。至少覆盖：边框色（`#d8dee6`、`#e6ebf1`、`#eef2f6`）、强调色（`#8ab4f8`、`#e8f1ff`）、警示色（`#fff8e5`、`#f0d78c`、`#f3e6b8`）、文本色（`#3c434c`、`#5c6570`、`#a1260d`）、背景色（`#f6f7f9`、`#fff`）。

### Button（`editor/src/components/ui/Button.tsx`）

```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "nav";
  active?: boolean; // 仅 nav 变体使用，选中态
}
```

- `default`：ConflictPanel 的动作按钮、DiffPreview 的预检/提交、ExportPanel 的导出、ErrorPanel 的条目按钮——现状无视觉区分，样式对应当前各处裸 `<button>` 的默认外观。
- `primary`：App.tsx 里的"刷新"按钮，对应现有 `.draft-refresh` 的蓝色强调样式。
- `nav`：TableList 的表清单项、App.tsx 四态菜单（four-state-menu）的条目——整行可点、hover 高亮，`active` 对应 TableList 当前 `is-active` 的选中态。

其余原生 button props（`type`、`disabled`、`onClick`、`data-testid`、`className`）透传。

### Panel（`editor/src/components/ui/Panel.tsx`）

```ts
interface PanelProps {
  tone?: "default" | "warning"; // warning 对应冲突面板的黄色调
  variant?: "docked" | "boxed"; // docked=仅上边框，boxed=完整边框+外边距
  scroll?: boolean; // 超高滚动（max-height + overflow: auto）
  as?: "section" | "div" | "ul"; // ErrorPanel 用 <ul> 而非 <section>
  title?: React.ReactNode;
  "data-testid"?: string;
  className?: string;
  children: React.ReactNode;
}
```

覆盖 SettingsPanel、ErrorPanel（`as="ul"`）、DiffPreview（`scroll`）、ConflictPanel（`tone="warning"` + `scroll`）、ExportPanel（`variant="boxed"`）的外壳。

### DataTable（`editor/src/components/ui/DataTable.tsx`）

```ts
interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
}
interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  "data-testid"?: string;
}
```

替换 ConflictPanel 和 DiffPreview 里结构与 CSS 完全重复的 `<table>/<thead>/<tbody>` 手写标签。命名为 `DataTable` 而非 `Table`，避免与仓库里"表"（`tables/` 配表）这一业务概念混淆。

## 不做的事

- 不抽取 `Select`/`Field`：ExportPanel 的 3 个下拉只在自身内部重复，不构成跨面板重复。
- 不改动 StatusBar：它是状态条而非"面板"形态，只替换颜色为 token 引用。
- 不改变 TableList、App.tsx 的整体结构，只替换其中的 `<button>`/`<table>` 为新组件。

## 影响范围

新增：`editor/src/components/ui/{Button,Panel,DataTable,index}.tsx`、`editor/src/styles/{tokens,ui}.css`。
修改：`editor/src/panels/{ConflictPanel,DiffPreview,ErrorPanel,ExportPanel,SettingsPanel}.tsx`、`editor/src/panels/TableList.tsx`、`editor/src/app/App.tsx`（四态菜单、刷新按钮）、`editor/src/app/App.tsx` 引入的 `editor/src/main.tsx`（引入新样式文件）、`editor/src/styles/app.css`（移除被新组件接管的规则、颜色改为 token 引用）。

## 验收

- [ ] 三个新组件在 `editor/src/components/ui/` 下有对应的最小单元测试（vitest + @testing-library），覆盖各 variant/tone/scroll 分支的 className 输出。
- [ ] 现有 e2e 套件（`pnpm e2e`）在重构后全部通过，无 `data-testid` 缺失或行为变化。
- [ ] `pnpm lint`、`pnpm test`（含 `check-deps`）通过。
- [ ] 视觉对比：重构前后各面板截图/人工检查无可见差异。

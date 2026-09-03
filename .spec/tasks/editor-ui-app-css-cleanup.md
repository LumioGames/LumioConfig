---
status: pending
---

# 清理 app.css 里被新组件接管的规则

在所有面板都迁移到 `Button`/`Panel`/`DataTable` 之后，把 `editor/src/styles/app.css` 里已经被 `editor/src/styles/ui.css`（`.btn--*`/`.panel*`/`.data-table*`）接管的规则删除，并把仍保留的规则里的十六进制颜色值换成 `editor/src/styles/tokens.css` 的 token。必须等 `editor-ui-migrate-simple-panels`、`editor-ui-migrate-diff-preview`、`editor-ui-migrate-conflict-panel` 三张卡都完成后再做——这是唯一会删除 CSS 规则的一步，提前做会让还没迁移完的面板失去样式。

本卡产出的 `app.css` 是最终态，纯重构：与迁移前的渲染效果逐像素一致（颜色值只是换成同值的 token 引用，不改变任何视觉呈现）。

## 涉及范围

- 修改：`editor/src/styles/app.css`

## 实现

完整替换为：

```css
:root {
  color-scheme: light;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
}

html,
body,
#root {
  margin: 0;
  height: 100%;
}

.app-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100%;
  background: var(--color-bg-app);
}

.table-list {
  border-right: 1px solid var(--color-border);
  padding: 16px 12px;
  background: var(--color-bg-surface);
}

.table-list h1 {
  font-size: 16px;
  margin: 0 0 8px;
}

.table-list__note {
  color: var(--color-text-muted);
  margin: 0 0 12px;
  font-size: 12px;
}

.table-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-main {
  display: grid;
  grid-template-rows: 1fr auto auto 36px;
  min-width: 0;
  position: relative;
}

.univer-root {
  min-width: 0;
  min-height: 0;
  background: var(--color-bg-surface);
}

.status-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 0 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  font-size: 12px;
  color: var(--color-text);
}

.status-bar__hint {
  color: var(--color-danger-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.four-state-menu {
  position: fixed;
  z-index: 20;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.diff-preview {
  padding: 8px 12px;
  max-height: 180px;
  overflow: auto;
}

.diff-preview__actions {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.export-panel label {
  display: inline-block;
  margin-right: 12px;
}

.conflict-panel button {
  margin: 0 4px 4px 0;
}
```

删除的规则及其去向（校验用，不必照抄进文件）：`.table-list button`/`.table-list button.is-active` → `ui.css` 的 `.btn--nav`/`.btn--nav.is-active`；`.four-state-menu button`/`:hover` → `.btn--menu`/`:hover`；`.draft-refresh` → `.btn--primary`；`.settings-panel, .error-panel` → 基类 `.panel`；`.diff-preview table/th/td` → `.data-table`；`.export-panel`（除 `label` 规则外）→ `.panel--boxed`；`.conflict-panel`（除 `button` 规则外）与 `.conflict-panel table/th/td` → `.panel--warning` + `.data-table`。

提交：

```bash
git add editor/src/styles/app.css
git commit -m "refactor(editor): drop app.css rules now owned by ui.css component classes"
```

## 验收标准

- [ ] `editor/src/styles/app.css` 内容与上文完全一致（可用 diff 校验）。
- [ ] `grep -c '#[0-9a-fA-F]\{3,6\}' editor/src/styles/app.css` 结果为 0（除 `rgba(0, 0, 0, 0.12)` 外没有残留十六进制色值——`rgba` 不在此 grep 匹配范围内，无需处理）。
- [ ] `pnpm lint`、`pnpm build`、`pnpm test` 通过。
- [ ] `pnpm e2e` 全量通过。
- [ ] 用 `pnpm dev` 启动开发服务器，人工对比迁移前后的截图（TableList 选中态、四态菜单、冲突面板、diff 预览表格、导出面板、设置面板），确认无可见差异。

## 依赖

editor-ui-tokens-styles、editor-ui-migrate-simple-panels、editor-ui-migrate-diff-preview、editor-ui-migrate-conflict-panel

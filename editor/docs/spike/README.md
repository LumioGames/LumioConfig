# A4 spike · 四态徽标渲染扩展 demo

调研文档见 `editor/docs/four-state-render-spike.md`,结论 ADR 见 `.spec/decisions/0008-four-state-rendering.md`。

本目录是 spike 的最小 demo,**不被 `editor/src` 引用、不进 build、不进 `editor_static`**,无新增依赖(只用 `editor/package.json` 既有的 `@univerjs/core` 与 `@univerjs/preset-sheets-core`)。

## 启动

```bash
cd editor
corepack pnpm install --frozen-lockfile      # 首次
corepack pnpm exec vite --config docs/spike/vite.config.mjs
# 打开 http://127.0.0.1:5199
```

(独立端口 5199 与生产 dev server 5173 不冲突;build 输出 `dist-spike`,已在 `.gitignore` 排除。)

## 页面内容

- 「impact」列五行:missing / `""` / `null`(∅)/ default(幽灵值 25 + 默认徽标)/ 普通值对照。
- 徽标经 `INTERCEPTOR_POINT.CELL_CONTENT` 拦截器 + `ICellCustomRender.drawWith` 画在格子右下角;数据层四态格的 `v` 全部为 `null`(`getCellRaw` 可复核)。
- 「note」列第一格演示 `markers.br` 角标三角(备用机制)。
- 右侧面板:模型层 vs 渲染层对照(`getCellRaw` vs `getCell`),并断言 missing/empty/null 三态 `v === null`。

## 手工验证清单

1. 选中 ∅ 格 Ctrl+C → 粘贴到记事本为空(徽标不进剪贴板)。
2. 双击 ∅ 格:编辑框为空。
3. Ctrl+F 搜「∅」或「missing」:搜不到(查找走原始数据)。
4. 截图(在 `editor/` 目录):`corepack pnpm exec playwright screenshot --viewport-size=1360,860 --full-page --wait-for-timeout=5000 http://127.0.0.1:5199 docs/spike/badge-null.png`

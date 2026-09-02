# Playwright E2E（R-00330）

命令：`corepack pnpm e2e`（Chromium）。静态 fixture，无 Host HTTP。最近一次：5 passed（约 13s）。

| 用例 | 结果 |
| --- | --- |
| 10k×50 首屏 / 滚动 / 10 万格粘贴 | 通过（数字见 `poc-benchmark.md`） |
| 中文 IME composition + extractTokens | 通过 |
| TSV 粘贴且无 `/api/` 请求 | 通过 |
| 合并单元格拦截并显示提示 | 通过 |
| 拖拽填充 / 撤销重做 / 筛选 / 排序 / 查找替换 chrome | 通过 |

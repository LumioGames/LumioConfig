# Playwright E2E（R-00330）

命令：`corepack pnpm e2e`（Chromium）。静态 fixture，无 Host HTTP。最近一次：7 passed（约 14s）。

| 用例 | 结果 |
| --- | --- |
| 10k×50 首屏 / 滚动 / 10 万格粘贴 | 通过（数字见 `poc-benchmark.md`） |
| CJK 经 Univer `sheet.command.set-range-values` `{range,value}` 写入后 `extractTokens` | 通过（`你好世界`） |
| 剪贴板 TSV + 无 `/api/` + 值写入 extractTokens | 通过 |
| 合并单元格拦截并显示提示 | 通过 |
| id 列 `{range,value}` 编辑被拒，extractTokens 仍为源 id | 通过 |
| 公式写入被拒；纯值写入 extractTokens | 通过 |
| 查找/撤销快捷键后 extractTokens 不变 | 通过 |

拖拽填充仍以 Vitest interceptor 覆盖为主：Playwright 不驱动 Univer fill-handle 像素。粘贴 `=SUM` 去公式由 `tests/interceptors.test.ts` 对 `univer.command.paste` / `paste-by-short-key` / `sheet.mutation.set-range-values` 断言。

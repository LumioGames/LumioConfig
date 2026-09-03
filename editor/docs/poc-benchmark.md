# Univer POC benchmark

- 机器：win32 10.0.26200 x64 cpus=16 mem=16223MB
- Node：v24.18.0
- Univer：`@univerjs/preset-sheets-core@0.25.1`
- 日期：2026-09-03T15:37:13.058Z

| 场景 | 耗时 |
| --- | --- |
| 10k×50 fixture 首屏（createWorkbook + 挂载） | 447 ms |
| 10k×50 滚动（wheel 4000px） | 316 ms |
| 10 万格 TSV 粘贴尝试（100000 cells, 379999 chars） | 42762 ms |

说明：粘贴走剪贴板 + Ctrl+V；若浏览器拦截剪贴板，耗时仍记录尝试窗口。lockfile 不含 `@univerjs-pro`。

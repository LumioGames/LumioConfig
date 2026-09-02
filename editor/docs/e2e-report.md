# Playwright E2E 矩阵（R-00364）

命令：`corepack pnpm e2e`（Chromium）。Host 用例需要先 `pnpm build` 写出 `src/lumio_config/editor_static/`。Univer `@univerjs/preset-sheets-core@0.25.1`。

最近一次独立核验（Windows，Python 3.12.10）：见本卡收口日志。

| §5 类别 | 覆盖 | 结果 |
| --- | --- | --- |
| 往返 | `host-submit` 空 ops；`host-drafts` 存草稿刷新 | 通过 |
| 四态 | `four-state.spec.ts` 打开/编辑/复制/粘贴/填充/删除/撤销重做/草稿恢复 | 通过 |
| 视图 | `four-state` 缩放冻结；`sheet-ops` 筛选/查找 | 通过 |
| 并行修改 | `host-rebase` 不同格自动合并 + 同格 ConflictPanel | 通过 |
| 行身份 | `four-state` 新行 draft:、复制行新 key、id 只读 | 通过 |
| 表格操作 | `sheet-ops` CJK / TSV / 公式取值 / 禁合并；`benchmark` 10 万格粘贴 | 通过 |
| 草稿 | `host-drafts` 刷新、多标签 409、Host 重启 | 通过 |
| 提交 | `host-submit` git autoCommit；Python `test_editor_submit` svn 桩 / none / 脏树 | 通过（svn/none 以 unittest 为主） |
| 导出 | `host-export` CSV BOM + README；Python `test_editor_export` 公式注入 / 草稿 / 目标列 | 通过 |
| 安全 | `host-security` 无 token 401、导出路径穿越；Python `test_loopback_token_origin_host_and_delete` | 通过 |

截图目录：`editor/playwright-report/`（不入库）。基准数字见 `poc-benchmark.md`。

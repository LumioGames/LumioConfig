# 网页编辑器

本地 `python tools/lumio_config.py serve` 打开浏览器。表格不是权威源；`Ctrl+S` 与停顿 2 秒只写 `.lumio/drafts/`。

## 提交

界面「预检」调用 `POST /api/patch/validate`，「提交补丁」调用 `POST /api/patch/apply`。

- 无修改提交得到空 `ops`，文件与指纹不变。
- 提交成功后草稿删除；新行的 `draft:` 键由 Host 返回的 `assignedIds` 换成正式 id。
- `submit.autoCommit=true` 且工作树策略允许时，Host 只 `git add`/`svn commit` 白名单路径：`tables/<table>.txt`、`registry/row-ids.json`、`registry/tombstones.json`。首行 `config(<table>): <摘要>`。
- `autoCommit=false` 时 TXT 已合入，状态栏提示「未提交」。
- `autoExport=true` 时写 `export.outDir`。导表或 commit 失败不回滚已合入 TXT，分别返回 `EXPORT_FAILED` / `VCS_COMMIT_FAILED`。
- `STALE_BASELINE` 等冲突只列在错误面板，本版不做冲突解决。

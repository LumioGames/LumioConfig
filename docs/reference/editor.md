# 网页编辑器

本地 Host 只绑定 loopback。Python 3.11+ 标准库，无 Node 也能打开已经提交的 `src/lumio_config/editor_static/`。

```bash
python tools/lumio_config.py serve
```

默认打开 `http://127.0.0.1:<port>/#token=…`。Bearer token 进 `sessionStorage`，不进补丁。表格不是权威源；`Ctrl+S` 与停顿 2 秒只写 `.lumio/drafts/`。脏工作树且 `openPolicy.allowDirtyWorkingTree=false` 时拒绝打开。

## 界面（v3）

顶栏（表切换 / 修订 / 会话状态 / 导出 / 预检 / 提交补丁 / 设置 / 快捷键 / 检查器开关）+ 阻断横幅 + 主体（左表列表 200px 可折叠 44px · 中工具栏与表格 · 右只读检查器 260px 默认收起）+ 底部抽屉（补丁 / 错误 / 冲突 / 导出 / 改动，收起 30px 展开 240px）+ 状态条。会话阶段以用户口径呈现（「与仓库一致 / N 格未提交 / 预检通过，可提交…」），英文阶段名只在悬浮提示里；状态机本体见 `docs/decisions/0-8` §8。

- **检查器**：点格或点列头展开（`Ctrl+M` 收起/展开，记忆在 localStorage）：列约束、无效原因、基线 → 当前、四态四键、Delete 规则、行操作。只读——改值一律格内。
- **抽屉**：`Ctrl+J` 收起/展开。补丁页签提交后显示结果卡（新指纹 8 位、发号映射、版本库动作、导表）；冲突页签三列（打开时 / 仓库当前 / 我的草稿）逐格单选解决，全部解决后「重新预检并提交」；错误页签点击跳格；改动页签（仅 git 仓库）列修订级差异与我的未提交改动。
- **命令面板**：`Ctrl+K`，切表与全部动作用键盘完成。
- **阻断**：离线 / 会话结束时整页阻断页，按指引回终端重新 `serve`。

## 四态与 Delete

| 四态 | 源 token | 操作 |
| --- | --- | --- |
| 缺列 | `@missing` | 原生右键「单元格」分组（非 required；必填列置灰并提示） |
| 空字符串 | `""` | 同上「设为空字符串」 |
| 明确空值 | `null` | 同上「设为 null ∅」 |
| 吃默认 | `@default` | 同上「恢复默认」（无默认值列置灰并提示） |

四态徽标画在渲染层（ADR 0008），不进单元格值；检查器同样提供四键。

`Delete` / `Backspace`：列有 default → `@default`；无默认且非 required → `null`；required 且无默认 → 保持原值并提示。四态互不坍缩。

## 草稿

`.lumio/drafts/<table>.json`，乐观并发 `expectedDraftVersion`。冲突码 `DRAFT_VERSION_CONFLICT`，提示「另一个标签页已保存」，只允许刷新。Host 重启后按指纹套草稿；指纹落后则三方 rebase。

## 预检 / 预览 / 提交

- 「预检」`POST /api/patch/validate`
- 「提交补丁」`POST /api/patch/apply`
- 无修改提交得到空 `ops`，文件与指纹不变
- 成功后草稿删除；`draft:` 键换成 `assignedIds` 里的正式 id

设置（仓级 `.lumio/editor.json`，个人 `.lumio/local.json` 覆盖）：

| 键 | 含义 |
| --- | --- |
| `vcs` | `git` / `svn` / `none` |
| `submit.autoCommit` | apply 成功后是否 commit 白名单路径 |
| `submit.autoExport` | apply 成功后是否跑 `export_repository` |
| `export.outDir` | 导表与编辑器导出根目录 |
| `openPolicy.allowDirtyWorkingTree` | 脏树是否允许打开；打开则强制不 autoCommit |

白名单路径：`tables/<t>.txt`、`registry/row-ids.json`、`registry/tombstones.json`。commit 首行 `config(<table>): <摘要>`。`autoCommit=false` 时状态栏「未提交」。导表或 commit 失败不回滚 TXT，分别 `EXPORT_FAILED` / `VCS_COMMIT_FAILED`。

## 冲突处理

仓库底稿变化 → `Stale` → 自动 `POST /api/drafts/{table}/rebase`（调用 `patch.merge_cell`）。无冲突提示「已合入仓库 N 处改动」；同格冲突打开 ConflictPanel，显示打开时 / 仓库当前 / 你的草稿。动作：采仓库值、采我的值、手工输入、恢复默认、设为 null；行删除冲突：放弃我的改动 / 取消提交。没有强制覆盖。解决后重新预检并提交。`SCHEMA_CHANGED` 只允许刷新重放。

## 导出

「导出」`POST /api/export`，文件 `GET /api/exports/{id}/{file}`。只写 `export.outDir/editor/<exportId>/`。CSV / TSV、UTF-8 BOM、四态写源 token；`= + - @` 等开头加 `'`。`README.txt` 含仓名、修订、指纹、来源、`GENERATED / NOT AUTHORITATIVE — do not import back`。无导入入口，无 XLSX。

## 错误码

| 码 | 含义 |
| --- | --- |
| `UNAUTHORIZED` | 缺 token |
| `FORBIDDEN_HOST` / `FORBIDDEN_ORIGIN` | 非 loopback 或 Origin 不匹配 |
| `DRAFT_VERSION_CONFLICT` | 另一标签页已保存 |
| `STALE_BASELINE` | 同格三方冲突 |
| `DELETED_ROW_CONFLICT` | 仓库已删该行 |
| `SCHEMA_CHANGED` | Schema 指纹变了 |
| `VCS_COMMIT_FAILED` / `EXPORT_FAILED` | TXT 已合入，后续动作失败 |
| `working_tree_policy_violation` | 脏树且不允许打开 |

## 常见问题

- Python 必须 3.11+（Windows 用安装的 `python.exe`，不要用 3.9）。
- 端口 0 表示系统分配；被占用换一个。
- 脏工作树：设 `allowDirtyWorkingTree` 或先提交/清理。
- 无 Node：使用已提交的 `editor_static/`，不要改 `editor/dist`。

## 快捷键（v3）

| 动作 | 键 |
| --- | --- |
| 保存本地草稿 | `Ctrl+S` |
| 预检 / 提交补丁 | `Ctrl+Enter` / `Ctrl+Shift+Enter` |
| 命令面板（切表） | `Ctrl+K` |
| 折叠表列表 | `Ctrl+B` |
| 收起 / 展开抽屉 | `Ctrl+J` |
| 收起 / 展开检查器 | `Ctrl+M` |
| 编辑格 / 右键菜单 | `F2` / `Shift+F10` |
| 清格（四态规则） | `Delete` / `Backspace` |
| 查找 / 替换、撤销 / 重做 | `Ctrl+F` / `Ctrl+H`、`Ctrl+Z` / `Ctrl+Y`（Univer 内置） |
| 关闭弹层 → 收起抽屉 | `Esc` |

提交前确认只在会自动 commit 或导表（`submit.autoCommit || submit.autoExport`）时弹出，`Enter` 确认。

## 「改动」页签（修订级差异，R-00383）

`GET /api/tables/{table}/history?since=<revisionId>&limit=20` → 每修订 `{ revision, message, time, author, cells: [{ row, rowId, column, from, to }], created, deleted, schemaChanged }`。Host 用 `VcsAdapter` 白名单命令（`git log` / `git show`）取两修订快照，经 `load_sources` 解析后按稳定 id 逐格比对；Schema 变化的修订只标 `schemaChanged`，不伪造格级差异。`vcs=svn/none` 返回空列表且 `capabilities.history=false`，页签不出现；前端不调 git。

## 错误码速查（编辑器路径）

| 码 | 含义 | 界面行为 |
| --- | --- | --- |
| `DRAFT_VERSION_CONFLICT` | 另一标签页保存了草稿 | Failed 横幅 + 刷新 |
| `STALE_BASELINE` | 三方合并逐格冲突 | 冲突页签逐格解决 |
| `DELETED_ROW_CONFLICT` | 仓库侧删了行 | 冲突页签「放弃我的改动」 |
| `SCHEMA_CHANGED` | 表结构已变化 | Failed 横幅 + 刷新重放 |
| `VCS_COMMIT_FAILED` / `EXPORT_FAILED` | 改动已合入但 commit / 导表未完成 | Failed 横幅（终端手动处理） |
| `UNKNOWN_TABLE` | 表不存在 | 404

# 网页编辑器

本地 Host 只绑定 loopback。Python 3.11+ 标准库，无 Node 也能打开已经提交的 `src/lumio_config/editor_static/`。

```bash
python tools/lumio_config.py serve
```

默认打开 `http://127.0.0.1:<port>/#token=…`。Bearer token 进 `sessionStorage`，不进补丁。表格不是权威源；`Ctrl+S` 与停顿 2 秒只写 `.lumio/drafts/`。脏工作树且 `openPolicy.allowDirtyWorkingTree=false` 时拒绝打开。

## 界面

左侧表列表，中间 Univer 表，右侧预检/提交、导出、设置、错误与状态栏。状态机见 `docs/decisions/0-8` §8：`Opening` / `ReadyClean` / `ReadyDirty` / `SavingDraft` / `Validating` / `ReadyToSubmit` / `Submitting` / `Stale` / `Conflicted` / `Failed`。

## 四态与 Delete

| 四态 | 源 token | 操作 |
| --- | --- | --- |
| 缺列 | `@missing` | 右键「设为缺列」（非 required） |
| 空字符串 | `""` | 右键「设为空字符串」 |
| 明确空值 | `null` | 右键「设为 null」 |
| 吃默认 | `@default` | 右键「恢复默认」 |

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

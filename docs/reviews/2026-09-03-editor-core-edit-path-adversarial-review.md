# 网页编辑器核心编辑路径对抗审查（R-00360～R-00364）

- 日期：2026-09-03
- 角色：独立 reviewer（对抗审查，不改代码、不 commit）
- 审查对象：origin/main `47b396a`（R-00360 / R-00361 / R-00362 / R-00363 / R-00364 均已合入）；对照 `docs/decisions/0-7`、`0-8`、`.spec/plans/2026-09-02-web-editor-design-prompt.md` §3 / §4.3–§4.7 与 Workflow 四卡线上验收项
- 环境：macOS，`/usr/local/bin/python3.11`；Node 26 + pnpm 10（CI 为 Node 22 + pnpm 9.15）；Playwright 1.51 + 缓存的 Chromium 1223（1161 下载停滞）
- 提示词引用的 `docs/reviews/2026-09-02-editor-gui-acceptance.md` 与 `...requirement-completion-audit.md` 在所有 ref 中都不存在，T3 从零复现

## 一、结论：退回

R-00361 有两条 P1；R-00360 / R-00362 / R-00364 各自验收项无 P0 / P1。

## 二、覆盖声明

| 维度 | 状态 |
| --- | --- |
| 1 验收标准 | 审了，R-00361 A1 / A4 被证伪 |
| 2 正确性 | 审了：`canEdit` 启动时序、渲染层 vs 数据层、草稿版本 |
| 3 安全 | 审了：curl 实测 Host / Origin / token；`.lumio/drafts/` 已 gitignore |
| 4 护栏与规范 | 审了：0-7 §5、0-8 §1–2、testing.md、Univer 锁版 |
| 5 测试 | 审了：三份 spec 走的路径、CI 绿实机红的根因 |
| 6 提交卫生 | 审了：本次只审；`pnpm build` 产物已 `git checkout` 还原，仓库 clean |
| 7 沉淀 | 只建议，未改 `lessons.md` |
| 未覆盖 | Excel / LibreOffice 打开 CSV 截图、`@univerjs-pro` 临时改 lockfile 让 CI 失败的证据——均不在仓内；Workflow 评论端点全部 404，评论未读到 |

## 三、Findings

### P1-1 四态格被键盘覆写时 token 不更新，画布与补丁分叉

- 位置：`editor/src/spreadsheet/interceptors.ts:359`
- 机理：Univer 键盘提交走 `syncExecuteCommand("sheet.command.set-range-values")`，`value` 从 `getCellRaw` 起步（bundle `_submitEdit`），自带旧的 `custom.lumio`。`attachLumioFromEdit` 见 `existing.state !== "value"` 就原样保留旧 token 并 `rememberToken` 旧值。
- 失败场景：右键「设为 null」后双击键入 `fx_new` 回车。模型 `v: "fx_frostboltfx_new"`，`extractTokens` 仍 `{state:"null"}`，`buildPatch` 生成 `set:{icon:null}`，草稿文件也写 `null`。用户看到的是新文本，提交出去的是 `null`。
- 证据：Playwright 真实键盘 T2（见第四节）。

### P1-2 真实 Delete 键在 required 无默认列上清空成非法 token，违反 0-7 §5

- 位置：`editor/src/spreadsheet/interceptors.ts:550`（CLEAR 分支要求 `range`）、`:510`（mutation 分支记 value）
- 机理：键盘 `sheet.command.clear-selection-content` 不带 `range`，`rowRange` 返回 undefined 直接放行；Univer 默认清空后，mutation 分支把 `{v:null}` 记成 `{state:"value", raw:""}`，无提示。
- 失败场景：选中 `damage`（required，无 default）按 Delete，token 变 `raw ""`，脏格 +1，没有「required 列不能清空」提示。0-7 §5 要求「保持原值并提示」。
- 证据：T3，命令序列 `clear-selection-content → sheet.mutation.set-range-values`，无 cancel。

### P2-1 四态菜单 / Delete 写入不清 `v`，画布继续显示旧值

- 位置：`editor/src/spreadsheet/projection.ts:127`（只在 `v !== undefined` 时设值）
- 机理：Univer mutation 合并（bundle `KIt`）仅在新值带 `v` 时覆盖。「设为 null」后模型仍 `v:"fx_frostbolt"`，画布照常显示旧文本；`∅` 等徽标只写进 `custom.badge`，没有任何渲染代码。
- 与 P1-1 相反方向的分叉：数据层已是 null，画布仍是旧值。

### P2-2 启动即残留「另一个标签页已保存，请刷新」

- 位置：`editor/src/app/App.tsx:282`（`canEdit` 闭包读 `stateRef.current`）、`interceptors.ts:490`
- 机理：`installInterceptors` 在 `dispatch({type:"open"})` 之前安装，状态要下一次渲染才更新；此窗口内 Univer 内部命令（含 `applyEditors` 的 addDataValidation）被取消并打出误导 hint。三次独立打开均复现，无任何编辑时 hint 已红。

### P2-3 e2e 报告不满足卡面要求

`editor/docs/e2e-report.md` 无耗时、截图路径、机器信息，「最近一次核验见本卡收口日志」不可复核。

## 四、对 GUI 报告 T3 的独立复核：部分成立

自建仓副本（schemas / tables / registry / .lumio + `git init`）+ `serve --port 8765`（零 Node，只读 `editor_static/`），Playwright 真实 `mouse.dblclick` / `keyboard.type` / `keyboard.press("Enter")`：

```
T1 value-cell keyboard edit  model.v="Fireball_kb"  tok.raw="Fireball_kb"  脏格 1
   2.6s 后 .lumio/drafts/skills.json draftVersion 1
T1 commands  set-cell-edit-visible → sheet.command.set-range-values → mutation → move-selection-enter-tab
T2 typing over null cell     model.v="fx_frostboltfx_new"  tok={state:"null"}  patch set:{icon:null}
T3 Delete on required damage tok={state:"value",raw:""}  commands: clear-selection-content → mutation (no cancel)
```

- 普通值格：T3 描述不成立——回车后 `extractTokens`、脏格、草稿文件全部正确。
- 四态格（`""` / `null` / `@default` / `@missing`）：T3 描述成立，即 P1-1。
- 附注：用不带 keyCode 的合成 Enter（桌面内嵌浏览器的 key 动作即是）不会触发 Univer 快捷键，画布显示编辑器文本而模型未提交，症状与 T3 完全一致。人工实机若经输入法 / 远程桌面改写 keyCode 会得到同样假象。原报告未区分「编辑器仍打开」与「已提交但没进数据层」。

## 五、四卡 GET 验收逐条

四卡线上状态均为 in_progress，验收项 `systemSemantic` 全部 not_started。

| 卡 | 验收项 | 判定 |
| --- | --- | --- |
| R-00360 | A1 loopback / token / Origin / Host / DELETE session | 满足（curl 实测 403 FORBIDDEN_HOST、403 FORBIDDEN_ORIGIN、401；`test_loopback_token_origin_host_and_delete`） |
| | A2 §3.3 字段与四态 raw / effective | 满足（`test_session_and_table_projection_match_contract`） |
| | A3 脏树策略、git / svn / none、白名单 argv | 满足（`test_dirty_tree_rejected_or_commit_disabled`、`test_svn_and_none_adapters`、`test_whitelist_rejects_unknown_argv`） |
| | A4 2 秒内 SSE 且指纹复核后发 | 满足（`test_source_change_emits_repo_revision_changed_after_fingerprint`） |
| R-00361 | A1 四态九动作 extractTokens 无损 | 不满足（P1-1；e2e「编辑」用 `executeCommand` 写不带 custom 的 value，与真实键盘形状不同） |
| | A2 刷新 / 重启恢复、409 | 被 P1 阻断（host-drafts 经 `applyFourState` 通过，未在真实键盘下复核） |
| | A3 视图操作后 token 不变 | 被 P1 阻断 |
| | A4 新行 id、复制行、编辑器、Delete 语义 | 不满足（P1-2） |
| R-00362 | A1 空 ops 提交不变 | 满足（`test_empty_ops_ok_and_bytes_unchanged`、`test_empty_ops_auto_commit_leaves_head_unchanged`） |
| | A2 四种 op 逐字节一致、发号替换 | 满足（`test_update_matches_hand_written_apply`、`test_create_rename_delete_match_hand_patch`、`test_delete_matches_hand_patch_and_tombstones`）；补丁来源依赖前端 token，P1-1 会把四态格错传 |
| | A3 autoCommit / 白名单 / svn 桩 / 脏树不 commit | 满足（`test_auto_commit_whitelist_and_skip` 等） |
| | A4 autoExport、EXPORT_FAILED / VCS_COMMIT_FAILED 不回滚 | 满足（`test_export_failure_keeps_txt`、`test_commit_failure_keeps_txt`） |
| R-00364 | A1 Excel / LibreOffice、公式前缀、README | 部分：公式前缀与 README 有单测；Excel / LibreOffice 截图不在仓内 |
| | A2 无 Node 可 serve、CI 重建 diff 为空 | 满足（本机 `pnpm build` 后 `git status -- src/lumio_config/editor_static` 为 0 行） |
| | A3 `@univerjs-pro` 触发 CI 失败 | 部分：`check-deps` 在 lint 内且单测通过；「临时改动验证后还原」证据未见 |
| | A4 §5 矩阵全部 e2e 通过并落报告 | 不满足：报告缺耗时 / 截图 / 机器；矩阵里没有「真实键盘 × serve 静态产物」交叉 |

### 测试路径说明

- `editor/tests/e2e/four-state.spec.ts` 十条全部经 `__lumioPoc.executeCommand("sheet.command.set-range-values")`、`applyFourState`、`deleteKey`，跑在 Vite dev server + fixtures 上。
- `editor/tests/e2e/host-drafts.spec.ts` 用 `applyFourState + saveDraftNow`（Host 用 `LUMIO_EDITOR_DIST=editor_static`）。
- `editor/tests/interceptors.test.ts` 用 `FakeUniver` 手工构造 params。
- 全仓只有 `sheet-ops.spec.ts:93-96` 与 `benchmark.spec.ts:46` 按过真实键盘，且只按了快捷键。
- CI 绿而实机红的根因：没有一个用例发出带旧 `custom.lumio` 的 `value`，也没有一个用例发出不带 `range` 的 clear 命令。

### 必跑证据

| 命令 | 结果 |
| --- | --- |
| `python3.11 -m unittest discover -s tests -v` | Ran 136 tests, OK (skipped=1，Unicode golden 二进制缺) |
| `python3.11 tools/lumio_config.py validate` | validate: OK |
| `python3.11 tools/lumio_config.py format --check` | format: OK |
| `git diff --check` | 空 |
| `cd editor && pnpm lint` | eslint + tsc + check-deps OK |
| `cd editor && pnpm test` | 10 files, 37 passed；check-deps ok |
| `pnpm build` + `git status -- src/lumio_config/editor_static` | 0 行差异（已还原） |
| `pnpm e2e` | 未执行（Chromium 1161 下载停滞；改用缓存 Chromium 1223 跑真实键盘脚本） |
| 红线 2 客户端投影 | `export` 后 `client/skills.json` 键只有 id / name / display_name / icon |
| 红线 4 | lockfile 0 处 `@univerjs-pro`，全部 `@univerjs/*@0.25.1` |
| 红线 1 / 3 | 全过程 tables/ 无改动（副本 `git status` 只有 `?? .lumio/drafts/`）；Host 只监听 127.0.0.1:8765 |

## 六、known gaps 与建议

- 建议另开一张修复卡（主题：编辑器四态格键盘覆写与 Delete 键语义 · 真实键盘 e2e）。范围：拦截器的 `existing.state` 保留逻辑改为「`v` 变化即转 value」；CLEAR 无 `range` 时取当前选区；四态写入显式 `v: null`；`canEdit` 在 `open` 之后再安装或直接读 reducer 快照；e2e 至少加三条 `page.keyboard` × `LUMIO_EDITOR_DIST` 用例。
- 建议在 `.spec/knowledge/lessons.md` 增一条：Univer 键盘提交的 `value` 携带整格旧数据（含 `custom`），拦截器不能把「已有四态元数据」当作用户意图；e2e 用 `executeCommand` 造的参数形状不等于真实输入，凡拦截器改动都要有一条真实键盘用例。
- Workflow 评论无法经 API 读取（`/comments` 等 404），四卡评论未审。
- 未审：导出 / CSV / 10k 表（按提示词收窄）。

# 网页编辑器 v3 · 功能完成度审计（2026-09-04）

- 审计对象：`main` @ `f2b0ecf`（"merge: M6-K (R-00383 diff/history tab) + Task 20 closeout"）
- 审计员角色：只读审计。**未改任何源码、未改 main、未提交、未 push。**
- 对账三层：设计任务书（`.spec/plans/2026-09-03-web-editor-redesign-dispatch-prompt.md`）+ Workflow 卡 R-00378～R-00383 + 交回物。
- 取证口径：**每一条「完成」都由本次亲自复跑的测试或浏览器实走支撑**；交回物自述一律不作证据。

## 0. 一页结论

v3 重设计的**主干功能是真做出来了**，不是文档繁荣：20 张子卡的产物文件全部在位，54 条 E2E（含 axe 三态扫描）本次实跑全绿，150 条 Python 单测全绿，生成物 `editor_static/` 与源码重建零差异，`validate` / `format --check` / `spec-lint` / `git diff --check` 全过。浏览器实走确认了四态写入、草稿自增、预检失败回流、错误跳格、命令面板、改动页签、导出下载链路都真实可用。

但有三类真问题：

1. **掉线是纸面能力**（P1）。`online: false` 在整个前端**一次都没有派发过**，SSE 断流被静默吞掉。杀掉 Host 后界面永远显示「在线」，设计稿规定的整页阻断页 `Blocked` 在"连上后又断"的场景里**不可达**；再切表会掉进 phase=`Failed`、胶囊显示「提交失败」（用户根本没提交过）。这是 R-00382 S03 的实质缺口，而交回物只把它记成"截图没补"。
2. **错误页签状态不清**（P2）。还原改动回到 `ReadyClean`、补丁 0 之后，错误页签仍挂着上一次预检的 1 条错误，`ErrorTab` 的 `no-changes` 空态被 `errors.length > 0` 优先级挡死。
3. **Owner 的 D1～D6 六条关切，五条属实、一条是误判**：列头可读性、源文件不可见、无建表/导入入口、右键看源文件——全部确认缺失；导出格式枚举**不需要架构仓立卡**（现状定义完全在本仓，见 §D4）；Excel 公式则是**架构仓 ADR 0-7 已明令禁止持久化**，不存在"导出 TXT 丢公式"的问题（见 §D6）。

分域打分见 §F，建议的下一波需求卡 9 张见 §F.2。

## 0.1 本次实跑的门槛证据

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `cd editor && pnpm lint` | **PASS**（首跑 FAIL） | 首跑 tsc 6 错，因本机 `node_modules` 缺 `@axe-core/playwright`；按 lockfile `pnpm install --frozen-lockfile` 装回后全绿。仓库本身无缺陷，见 §G-1 |
| `pnpm vitest run` | **FAIL 24 / 313** | `tests/TableList.test.tsx` 11 条 + `tests/GridToolbar.test.tsx` 13 条。根因是 Node v26.4.0 环境，非产品代码，见 §G-2 |
| `pnpm build` | PASS，`git diff -- src/lumio_config/editor_static` **空** | 生成物与源码严格同步（Task 20 收口成立） |
| `PYTHON=/usr/local/bin/python3.11 pnpm e2e` | **54 passed (45.0s)** | 含 `a11y.spec.ts` 三态 axe 扫描，`a11y violations: []` |
| `python3.11 -m unittest discover -s tests` | **Ran 150 tests — OK (skipped=1)** | |
| `python3.11 tools/lumio_config.py validate` | `validate: OK` | |
| `python3.11 tools/lumio_config.py format --check` | `format: OK` | |
| `git diff --check` | 无输出 | |
| `node <插件>/tools/spec-lint.mjs .` | `spec-lint: OK` | |

浏览器实走：`python3.11 tools/lumio_config.py serve --port 8850/8851 --no-open`，1440×900，Chromium。
收尾已清理：删除本次产生的 `.lumio/drafts/skills.json` 与 `build/export/editor/<id>/`，还原 `editor/docs/poc-benchmark.md`（benchmark E2E 改写），**`git status` 干净**。

## 0.2 真值来源的一处缺失

任务书指定的交回物 `.sdd/m6-{f,g,h,i,j,k}-return.md` **在仓库中不存在**。`.sdd/.gitignore` 内容是 `*`（整目录自忽略），目录里只剩 `progress.md`，而该文件记的是更早的 `editor-ui-primitives` feature（wave 0–2、closeout review 1/2），**没有一行 M6-F～M6-K 的台账**——与任务书 §4.5「这是你唯一可靠的进度记忆」的要求不符。

后果：交回物层客观上无法对账；本报告的 A/B/E 三维**全部改以代码 + 测试 + 实走为唯一证据**。这本身是一条治理漂移，见 §G-4。

---

## A. Task 1–20 逐卡验收对账

判定：完成 / 部分 / 缺失。证据一律给 `文件:行号` 或本次实跑的用例名。

| # | 子卡 | 判定 | 证据（本次亲自复跑 / 查证） |
| --- | --- | --- | --- |
| 1 | A1 拦截器 + 真实键盘 | 完成 | `tests/interceptors.test.ts` 17 条全绿；`e2e/keyboard.spec.ts` T0/T1/T2/T3/T4/T5 六条全绿（真 `page.keyboard`，跑在 `LUMIO_EDITOR_DIST` + serve 上）。mutation `{v:null}` 守卫见 `interceptors.ts:125,181,197` |
| 2 | A2 投影清 v + invalid 守卫 | 完成 | `tests/projection.roundtrip.test.ts` 19 条全绿（含 10k×50 fixture 回环）；`tests/editors.test.ts` 5 条全绿。**实走复核**：检查器点「设为 null」后画布该格立即清空、不再显示旧值 120（§C 步骤 3） |
| 3 | A3 canEdit 安装时序 | 完成 | `e2e/keyboard.spec.ts:247` "T0 startup leaves the status hint empty" 绿；**实走复核**：干净仓库打开 `skills`，`status-hint` 为空串、胶囊 `ReadyClean`（§C 步骤 1） |
| 4 | A4 四态渲染 spike + ADR 0008 | 完成 | `.spec/decisions/0008-four-state-rendering.md`（结论=渲染扩展，硬约束"徽标不进 v/token"保留）；`editor/docs/four-state-render-spike.md`；demo `editor/docs/spike/{index.html,main.ts,badge-null.png,panel-dump.png}`；`spec-lint: OK` |
| 5 | B1 令牌 + 组件 CSS | 完成 | `tests/no-hardcoded-colors.test.ts` 2 条绿；独立复核 `grep -rE '#[0-9a-fA-F]{3,8}\b|rgba?\(' editor/src/panels editor/src/components` = **0 命中**；`styles/tokens.css` 75 行、`ui.css` 256 行 |
| 6 | B2 phaseView / copy / failKind | 完成 | `tests/state.test.ts` 23 + `tests/phaseView.test.ts` 18 + `tests/copy.test.ts` 4 全绿；`failKind` 三分支与 `online` 派生态见 `phaseView.ts:57-60`。独立复核：`copy.ts` 里 11 处英文串**全在注释/形参名/键名**，无一在用户可见值 |
| 7 | B3 UI 原语 + useHotkeys | 完成 | `Tabs`(8) `Dialog`(7) `Toast`(4) `Menu`(11) `useHotkeys`(8) `Button`(6) 单测全绿；`components/ui/index.ts:1-16` 全导出 |
| 8 | C1 vcs log/show 白名单 | 完成 | `tests/test_editor_vcs.py` 并入 150 条 Python 全绿 |
| 9 | C2 history 端点 + capabilities | 完成 | `tests/test_editor_history.py` 绿；`session.py:182` `"history": self.settings.vcs == "git"`；**实走复核**：改动页签真列出修订 `691c2a98… feat(m1): pin column ordinal…` 与「表结构已变化」 |
| 10 | B4 Univer 表面裁剪 + 原生右键 | 完成 | `e2e/sheet-ops.spec.ts` 6 条全绿，含 `:112` "toolbar and formula bar do not render"、`:118` 右键无合并/插删列/字体、`:142` B/I/U 快捷键无残留；`e2e/four-state.spec.ts:156` "native context menu drives four-state via four-state-* items" 绿；`univer.ts:172-181`；`editor/docs/univer-surface.md` 在位 |
| 11 | D1 顶栏 / 横幅 / 状态条 | 完成 | `TopBar`(13) `Banner`(7) `StatusBar`(8) 单测绿；`e2e/host-drafts.spec.ts` 4 条绿。**实走复核**：`top-revision`="main · f2b0ecf" + `title` 全 40 位 sha（`TopBar.tsx:35-39,290`）；`status-fingerprint`="a10eb3b6" + `title` 全 64 位 |
| 12 | D2 表列表 + 工具栏 | **部分** | 功能实走全部可用（搜索框、行数、脏格徽标 [1]、折叠、10 个工具栏按钮齐全）；但 `tests/TableList.test.tsx`(11) 与 `tests/GridToolbar.test.tsx`(13) **本机 24 条全红**——环境根因见 §G-2，非产品代码缺陷，但"绿测试"这一验收证据在当前工具链上取不到 |
| 13 | D3 投影视觉 + 检查器 | 完成 | `tests/Inspector.test.tsx` 17 绿；`e2e/layout.spec.ts` 5 条绿（1440×900 与 1280×720 两档 `univer-root`/主区 ≥ 0.75；检查器默认收起→选格展开→`Ctrl+M` 收起→刷新记忆；14 态胶囊 + 阻断横幅）。**实走复核**：点 damage 格检查器自动展开，含「当前值/基线/四态四键/Delete 规则/列约束/已删行」全部七段 |
| 14 | E1 抽屉壳 + 补丁页签 | 完成 | `Drawer`(7) `PatchTab`(8) 单测绿；`e2e/host-submit.spec.ts` 绿。实走：抽屉五页签、`Ctrl+J`、`panel` testid 均在 |
| 15 | E2 错误 + 冲突页签 | 完成（带 §C-8 缺陷） | `ErrorTab`(10) `ConflictTab`(12) 单测绿；`e2e/host-rebase.spec.ts` 3 条绿（含"resolve all then resubmit keeps both sides"）；独立复核 `grep -rn "window.prompt" editor/src` = **0 命中** |
| 16 | E3 导出 + 设置 + seen 横幅 | 完成 | `ExportTab`(6) `SettingsDialog`(6) `viewState`(5) 单测绿；`e2e/host-export.spec.ts` 绿。**实走复核**：导出真生成 4 个 `export-link`（drops/effects/skills.csv + README.txt），落盘 `build/export/editor/<id>/` |
| 17 | F1 命令面板 + 快捷键 + 提交确认 | 完成 | `CommandPalette`(12) `SubmitConfirm`(6) 单测绿；`e2e/keyboard-journeys.spec.ts` 4 条绿（J2/J4/J5 + 无副作用不弹确认）。**实走复核**：`Ctrl+K` 弹面板，三组 13 条命令、快捷键标签 `^Enter`/`^⇧Enter`/`^S`/`^B`/`^J` 正确 |
| 18 | F2 阻断页 + a11y | **部分** | `Blocked.test.tsx` 9 条绿、`e2e/a11y.spec.ts` 三态 axe `violations: []` 绿、`a11y-checklist.md` 在位且诚实标注 3 条未勾；**但 `Blocked` 在真实掉线场景不可达**（P1，见 §C-7 / §E-1）。devDependency `@axe-core/playwright@4.13.0` 锁死符合约束 |
| 19 | C3 改动页签前端 | 完成 | `DiffTab.test.tsx` 8 绿；`e2e/host-history.spec.ts` 4 条绿（含 svn/none 下页签不出现）。**实走复核**：改动页签有基准下拉「上次打开」、"在表格中标记"开关、我的(1)`damage · 120 → null` 琥珀 chip、AI(3) 修订组 |
| 20 | F3 文档 + 生成物 + 截图 | 完成 | `docs/reference/editor.md` 127 行含 §「改动」页签(101)、快捷键 v3(84)、错误码速查(117)；`editor/docs/screens/` 4 张 PNG（default-1440x900 / default-1280x720 / drawer-expanded / conflict）；`pnpm build` 后 `editor_static` **零差异** |

**A 维小计：18 完成 / 2 部分 / 0 缺失。** 两张"部分"分别卡在工具链环境（Task 12）与一条真实功能缺口（Task 18）。

---

## B. Workflow 卡 R-00378～R-00383 · S01–S04 复核

> **真值局限（必须先声明）**：本次**未联网读取 Workflow 卡正文**——本机未找到 Workflow 凭据（`.workflow` 只有 `profile = "lumiogamesengine"`，无 token；`~/.claude` 下无 workflow 配置）。任务书 §0.6 规定"Workflow 卡只读，与仓内不一致以仓内为准"，故下表以任务书 §3.1「Task → 卡 / 验收项」映射为准做仓内侧复核。**若 Workflow 卡正文的 S 项措辞与此映射不符，以卡正文为准并需重核。**

| 卡 | 验收项 | 覆盖子卡 | 判定 | 关键证据 |
| --- | --- | --- | --- | --- |
| R-00378 M6-F | S01 键盘提交不保留旧 token | Task 1 | 完成 | `e2e/keyboard.spec.ts` T1/T2 绿 |
| | S02 CLEAR 按 0-7 §5 分派 | Task 1 | 完成 | `keyboard.spec.ts` T3（required 无默认→不变+hint）/T4（有默认→`@default`）/T5（可选无默认→`null`）绿 |
| | S03 启动无残留 + 四态清 v + invalid 守卫 | Task 1,2,3 | 完成 | `keyboard.spec.ts:247` T0 绿 + 实走 `status-hint` 空；`projection.roundtrip` 19 绿；`editors.test.ts` 5 绿 |
| | S04 四态呈现结论 | Task 4 | 完成 | ADR 0008 生效，结论"渲染扩展可行"，证据到 `node_modules` d.ts |
| R-00379 M6-G | S01 令牌 + 组件 CSS | Task 5 | 完成 | 硬编码色 0 命中 |
| | S02 phaseView/copy/failKind | Task 6 | 完成 | 45 条单测绿 |
| | S03 四原语 + useHotkeys | Task 7 | 完成 | 44 条单测绿 |
| | S04 Univer 表面裁剪 | Task 10 | 完成 | `sheet-ops.spec.ts` "v3 surface trim" 三测绿 |
| R-00380 M6-H | S01 侧栏 / 高度 / 检查器 | Task 12,13 | **部分** | 高度与检查器由 `layout.spec.ts` 5 条绿证实；侧栏单测 `TableList.test.tsx` 本机全红（§G-2） |
| | S02 顶栏 / 横幅 / 状态条 / 工具栏 | Task 11,12 | **部分** | 顶栏三件套单测 + `host-drafts` 绿；`GridToolbar.test.tsx` 本机全红（§G-2），功能已实走确认 |
| | S03 投影视觉 | Task 13 | 完成 | `projection.roundtrip` + 实走（脏格/新行占位/两行列头/只读锁）确认 |
| | S04 14 态胶囊与横幅 | Task 13 | 完成 | `layout.spec.ts:98` 全相位断言绿 |
| R-00381 M6-I | S01 补丁页签 | Task 14 | 完成 | `PatchTab` 8 + `host-submit` 绿 |
| | S02 错误页签跳格 | Task 15 | 完成（带缺陷） | `ErrorTab` 10 绿；实走跳格可用；**但空态被挡死，见 §C-8** |
| | S03 冲突页签无 prompt | Task 15 | 完成 | `ConflictTab` 12 + `host-rebase` 3 绿；`window.prompt` 0 命中 |
| | S04 导出 + 设置 + seen | Task 16 | 完成 | 17 单测 + `host-export` 绿 + 实走下载链路 |
| R-00382 M6-J | S01 命令面板 + 快捷键 | Task 17 | 完成 | 18 单测 + `keyboard-journeys` 4 绿 + `Ctrl+K` 实走 |
| | S02 提交确认 | Task 17 | 完成 | `keyboard-journeys.spec.ts:306` 反向用例绿 |
| | S03 阻断页 + a11y | Task 18 | **部分** | axe 三态零违例 + `Blocked` 9 单测绿；**阻断页真实场景不可达（P1）** |
| | S04 文档 / 截图 / 清单 | Task 20 | 完成 | 文档 + 4 张截图 + 清单勾选（3 条诚实留白） |
| R-00383 M6-K | S01 白名单 + history 端点 | Task 8,9 | 完成 | Python 150 全绿 |
| | S02 格级差异 / schemaChanged | Task 9 | 完成 | `host-history.spec.ts:133` 绿 |
| | S03 改动页签 | Task 19 | 完成 | `DiffTab` 8 + `host-history.spec.ts:178` 绿 + 实走 |
| | S04 svn/none 降级 | Task 19 | 完成 | `host-history.spec.ts:225,238` 绿 |

**B 维小计：24 个 S 项中 20 完成 / 4 部分 / 0 缺失。**

---

## C. 端到端旅程实走（浏览器，`serve --port 8850`，1440×900）

| # | 步骤 | 结果 | 观测证据 |
| --- | --- | --- | --- |
| 1 | 开表（干净仓库 → skills） | ✅ | `status-phase`="与仓库一致" / `title`="ReadyClean"；`status-hint`=""；`status-draft`="草稿 v0"；`top-revision`="main · f2b0ecf" |
| 2 | 点格 → 检查器 | ✅ | 检查器自动展开，七段内容齐全（当前值 120 普通值 / 四态四键 / Delete 规则 / 列约束 / 已删行） |
| 3 | 四态写入（设为 null） | ✅ | 画布该格**清空**（不残留 120，Task 2 关键点）；胶囊→「1 格未提交」；侧栏 skills 徽标 [1]；抽屉「补丁 1」；`status-draft`→「草稿 v1」（草稿自动落盘 `.lumio/drafts/skills.json`） |
| 4 | 预检（顶栏「预检」） | ✅ | 正确失败：damage 是必填列。「错误 1」，`status-hint`="预检失败"，胶囊回 `ReadyDirty` |
| 5 | 错误页签 + 跳格 | ✅（文案见 §D1b） | 红头卡「skills · fireball」+「damage · damage is required · provide a value · MISSING_REQUIRED」；点击跳格生效 |
| 6 | 改动页签 | ✅ | 基准下拉「上次打开」+「在表格中标记」；我的(1) `1 · damage · 120 → null`；AI(3) 列出真实修订 sha + commit message + ISO 时间 + 「表结构已变化」 |
| 7 | 导出 | ✅ | 4 个 `export-link`（`/api/exports/ddbf3303…/{drops,effects,skills}.csv` + `README.txt`）；文案「单向生成物，不会导回仓库；输出到 build/export」 |
| 8 | 还原改动 | ⚠️ **缺陷** | 值回 120、胶囊回 `ReadyClean`、补丁 0、"无未提交改动"——**但「错误 1」仍挂着上一次预检的错误，等 6s 不消**（详见 §E-2） |
| 9 | `Ctrl+K` 命令面板 | ✅ | 三组 13 条命令（打开表 ×3 / 动作 ×8 / 帮助 ×2），快捷键标签正确；**注意：无「新建表」「导入」命令**（§D3） |
| 10 | 掉线（kill Host） | ❌ **缺陷 P1** | 25s 后仍显示「在线」/`ReadyClean`，**无 `Blocked` 阻断页**；再切表 → phase=`Failed`、胶囊红字「**提交失败**」（用户从未提交）、表格清空、状态条仍「在线」、无横幅。一次复现中还观测到未捕获异常 `Error: extractTokens requires a workbook snapshot or Univer instance` 导致整页白屏（console 证据留存） |
| 11 | 提交 / 冲突 | 未实走（有意） | 提交会写 `tables/` 并可能 commit 到真仓库，超出只读审计边界。改由 `e2e/host-submit.spec.ts`(1) + `e2e/host-rebase.spec.ts`(3) 在临时 git 仓上的**本次实跑全绿**背书 |
| 12 | 键盘 J1–J5 | 间接 | J2/J4/J5 由 `keyboard-journeys.spec.ts` 本次实跑绿背书。**浏览器手工实走时 Univer 单元格内的 Enter 提交无法经自动化键盘投递**（输入进了单元格编辑器但不 commit）——这是审计工具的限制，不是产品缺陷：`keyboard.spec.ts` 用真 `page.keyboard` 跑通了同一路径 |

---

## D. Owner 2026-09-04 新增关切

### D1 · 列头可读性 — **属实，缺失**

**现状（代码级）**：列头文本由 `editor/src/spreadsheet/projection.ts:177-183` 生成：

```
第一行：`${column.name}${required ? " *" : ""}${readOnly ? " 🔒" : ""}`
第二行：`${columnTypeLabel(column)} · ${column.visibility}`
```

- `column.visibility` 是**原样透传的 schema 字面量**。真实取值：`schemas/skills.json` 的 `id`/`name` 是 `SCV`，`damage`/`cooldown_frames` 是 `S`，`display_name`/`icon` 是 `C`。界面**没有任何图例**解释 S/C/V 是 server/client/voxel。
- 唯一的中文解释藏在 `title` 悬浮提示（`projection.ts:186-207`，走 `COPY.inspector.constraintLabels`）——**鼠标悬停才可见，键盘用户与截图都拿不到**。
- 折行属实：列宽固定 `projection.ts:383` `w: id?110 : name?140 : 120`，列头 `WrapStrategy.WRAP` + 行高 36（`:42,394`）。`cooldown_frames *` 在 120px 内必然折成 `cooldown_fram` / `es *`——实走截图已确认。
- 另有一条同源缺口：检查器「描述」永远显示"无"，因为 `api/types.ts:15` 的 `TableColumn` **根本没有 description 字段**（`projection.ts:185` 注释自认"TableColumn 暂无描述字段，待 Host 补"）。

**建议**（按性价比排序）：
1. **图例常驻**：工具栏右侧现有"7 列 · 排序 / 筛选只影响视图"提示位，扩成可点的「S=服务端 C=客户端 V=体素」小图例（或抽屉加一个只读「列说明」页签）。零 Host 改动。
2. **第二行中文化**：`headerText` 第二行由 `u32 · SCV` 改 `整数 · 服务端+客户端+体素`，或折中 `u32 · S C V` 加色点。文案进 `copy.ts`，改一处函数。
3. **列宽自适应**：按 `headerText` 首行字符数给最小列宽（`max(120, name.length * 8 + 28)`），消除 `cooldown_frames` 折行。
4. **补 description**：Host 侧 `session.py` 的 schema 透传里带上 schema 的列描述，`TableColumn` 加 `description?: string`，检查器与列头 `title` 同时受益。这条要动 Host + 类型，单独立卡。

### D2 · 源文件可见性 — **属实，缺失**

**现状**：`grep -rn "tables/" editor/src` 只有三处，全在 API 路径拼接（`draftSession.ts:16`、`client.ts:67`、`types.ts:186` 注释），**界面上没有任何地方显示 `tables/<t>.txt`**。实走用 `document.body.innerText.includes('tables/')` 验证 = **false**。

值得注意的是：**Host 已经把一半数据送到前端了但前端没用**——`session.py:165` 每张表都返回 `"schemaPath": f"schemas/{name}.json"`，`grep -rn "schemaPath" editor/src` = **0 命中**（前端完全忽略）。缺的只是 `sourcePath`。

修订则**已经显示**：`TopBar.tsx:290` 渲染 `top-revision`，实走确认 "main · f2b0ecf" + `title` 全 sha（git）/ `r<id>`（svn）/ 不显示（none）。所以 D2 准确说是「**源文件路径缺失，修订已有**」。

**建议**（工作量很小）：
1. `session.py:165` 的表摘要里加 `"sourcePath": f"tables/{name}.txt"`（一行）。
2. `types.ts` 的 `SessionTableSummary` 加两个可选字段；`TopBar` 在表名 `⌄` 菜单里加两行只读条目「源文件 tables/skills.txt」「Schema schemas/skills.json」，点击复制路径 + toast（复用 `StatusBar` 的指纹复制模式，`StatusBar.tsx`）。
3. 或更省：直接放进状态条 `status-table` 的 `title`。
> 预估半天。与 D5 天然同卡。

### D3 · 建表 / 导入入口 — **属实，缺失，但需要先定政策**

**现状**：`grep -rn "新建表|创建新表|导入" editor/src` = **0 命中**；命令面板实走 13 条命令里只有「打开表 ×3」，无建表/导入；`server.py` 全部路由（`do_GET/POST/PUT/DELETE`）里**没有任何建表或导入端点**；CLI `lumio_config.py` 的 8 个子命令（`validate format export patch query preview registry serve`）也**没有建表命令**。所以这不是"编辑器少个按钮"，是**整条链路都没有**。

**关键约束（必须先过 Owner）**：架构仓 ADR `docs/decisions/0-1` §2 明写「唯一写路径是结构化补丁……人不直接改文件；编辑器保存必须生成逐格补丁，**禁止整文件覆盖**」，§「明确不做」里还有「不把 Excel 当源，不做 Excel 双向同步」。

因此：
- **建新表**不违背 0-1（新增表不是覆盖已有权威源），但它要同时产出 `schemas/<t>.json` + `tables/<t>.txt` + `registry/` 的行号命名空间授权——而 ID Namespace 授权归架构仓（`.spec/AGENTS.md` 红线 5、ADR 0-2）。**本仓可以做工具面，但新表的 id 命名空间分配规则要先问架构仓**。
- **导入**（CSV/Excel → 表）**直接撞 0-1 §2 的"禁止整文件覆盖"**。可行的合规形态只有一种：**导入 = 把外部文件解析成一份结构化补丁草案，进入既有的"预检 → 冲突 → 提交"通道**，绝不落盘覆盖。这需要 Owner 明确拍板。

**建议**：拆两张卡。
- 卡 A「编辑器内建新表」：先在架构仓确认新表 id 命名空间规则，再做 `POST /api/tables`（幂等、写 schema 骨架 + 空表 + registry 条目）+ 命令面板「新建表…」对话框。
- 卡 B「导入为补丁草案」：`POST /api/import/preview` 只解析不落盘，返回 `Patch`，前端直接灌进补丁页签走既有通道。**先要 Owner 就"导入必须降级成补丁"签字。**

### D4 · 导出格式契约 — **Owner 的前提需要修正：不需要架构仓立卡**

**现状（定义归属，逐处查证）**：编辑器导出的格式枚举 `{csv, tsv}` 只定义在**本仓三处**：

| 位置 | 内容 |
| --- | --- |
| `src/lumio_config/editor/export_csv.py:96` | `if fmt not in {"csv", "tsv"}: raise ValueError(...)` |
| `src/lumio_config/editor/session.py:180` | `"export": ["csv", "tsv"]`（capabilities 下发前端） |
| `editor/src/panels/drawer/ExportTab.tsx:16,102,165-166` | 类型 + `<option>` |

**在 `docs/decisions/`（架构仓镜像）里 grep `csv`/`tsv` = 0 命中。** 架构仓真正拥有的是**另一条导出**：ADR `0-4` §1 的四层产物骨架 `build/export/` 下 `manifest.json` + `server|client|voxel/<table>.json`，由 CLI `lumio_config.py export` 产出。两者物理隔离——编辑器导出落 `build/export/editor/<exportId>/`（`server.py:297-303`），不与架构仓产物目录冲突。

**结论：给编辑器导出加 `txt` 格式，属于本仓工具面，不需要架构仓立卡。** 需要架构仓介入的只有一种情况：如果导出的 TXT 被期望**能回导**成权威源——那就撞 ADR `0-1` §2「唯一写路径是结构化补丁，禁止整文件覆盖」，必须先在架构仓改这条。

而"导出 TXT"其实**几乎零成本**：本仓已有权威格式化器 `src/lumio_config/text_table.py:105 format_table_text(table)`，就是写 `tables/*.txt` 的同一个函数。

**需求卡草稿要点（本仓，无需架构仓）**：
- 标题：编辑器导出支持权威文本格式（TXT）
- 范围：`export_csv.py` 格式枚举加 `"txt"`；`txt` 分支不走 `csv.writer`，改调 `text_table.format_table_text`；`session.py:180` capabilities 加 `"txt"`；`ExportTab` 加一个 `<option>`；`docs/reference/editor.md` §导出 补一段。
- **必须写死的口径**：导出的 TXT 是**只读快照，不是回导通道**（沿用现有文案「单向生成物，不会导回仓库」）；`source=draft` 导出的 TXT 明确标注"含未提交草稿，与仓库不一致"，避免被误当权威源提交。
- 目标列（S/C/V）过滤对 TXT 的语义：建议 **TXT 只允许 `targets=全部`**（权威文本源本就是全列），否则会产出"看起来像源表但缺列"的危险文件。这条是本卡最需要 Owner 拍板的点。
- 验收：`tests/test_editor_export.py` 增 txt 分支用例（含四态 token 原样保留）；`e2e/host-export.spec.ts` 增一条 txt 下载并断言内容与 `tables/<t>.txt` 逐字节一致（`source=repo` 时）。

### D5 · 表列表右键打开源文件 — **缺失，技术路径清晰，工作量小**

**现状**：`TableList.tsx` 无 `onContextMenu`；`server.py` 无任何读源文件的端点（`_static` 只服务前端产物 `editor_static/`）。

**技术路径**（沿用仓内既有安全模式，不发明新东西）：

1. **白名单只读端点**：`GET /api/tables/{table}/source?kind=table|schema` → `{ path, text }`。
   - 表名校验直接复用 `server.py:33 _valid_table()`（正则 `^[A-Za-z0-9_.-]+$` + 显式拒 `..`）。
   - `kind` 是**闭合枚举**，只映射到 `root/tables/<t>.txt` 与 `root/schemas/<t>.json` 两个固定前缀，**路径不由请求方拼**——从根上免疫目录穿越。
   - 再加一道 `resolve()` + `relative_to(root)` 兜底，模式照抄 `server.py:441-447`（`_static`）与 `:297-303`（`_export_dir`）。
   - 二次校验：只有 `session.schemas` 里已加载的表名才放行（未知表 → 404 `UNKNOWN_TABLE`，与 `:177-182` 一致）。
2. **鉴权**：走既有 `_authorize_api()`（`server.py:150-164`）——Host 头必须 loopback、Origin 必须匹配、`Authorization: Bearer <token>`。**新端点只要落在 `/api/` 前缀下就自动继承这三道，无需新代码。**
3. **前端**：`TableList` 加 `onContextMenu` → 复用既有 `components/ui/Menu`（`role=menu` / `menuitem` / ↑↓ Enter Esc / 视口夹紧，已有 11 条单测），三项：
   - 「查看源文件 tables/{t}.txt」→ 抽屉新开只读页签或 `Dialog` 显示 `text`（等宽、只读、可全选复制）。
   - 「查看 Schema schemas/{t}.json」→ 同上。
   - 「在资源管理器中显示」→ **仅本地**，见下。
4. **「在资源管理器中显示」的边界**：这需要 Host 执行 `open -R`(macOS) / `explorer /select,`(Win) / `xdg-open`(Linux)，是**唯一一处从只读服务升级成执行本机命令**的动作。守则：
   - 端点 `POST /api/reveal`，body 只接 `{ table, kind }`，**绝不接受路径参数**——路径由 Host 自己按 (1) 的固定前缀拼。
   - 命令用 argv 列表 + `shell=False` + `cwd=root`，与 `vcs.py` 的 `ALLOWED_COMMANDS` 白名单同款纪律。
   - 默认**关闭**，由 `serve --allow-reveal` 或本地设置显式开启；`capabilities.reveal` 下发，前端据此隐藏菜单项。
   - 与 `capabilities.commit` 同级对待（`session.py:179`），即"能改本机状态的能力必须显式授权"。

**工作量预估**：只读端点 + 两条菜单项 ≈ **1 天**（Host 半天含测试，前端半天含单测）；`reveal` 再加 **0.5 天**（含跨平台分支与 e2e 跳过策略）。建议**拆成两卡**——只读那卡零风险可以先做，`reveal` 那卡单独过 Owner 授权。

### D6 · Excel 公式 / 导出 TXT 会不会丢公式 — **前提不成立：公式从来进不了模型**

（回应 Owner 2026-09-04 追加的问题）

**结论：不存在"导出 TXT 丢公式"的场景，因为公式在输入端就被拒了，根本不会进入数据模型。这是架构仓 ADR 明令的红线，不是实现疏漏。**

证据链，逐层：

| 层 | 证据 | 行为 |
| --- | --- | --- |
| 架构决策 | `docs/decisions/0-7-web-editor-boundary-and-stack.md:50` | 禁止项表首条即「**公式持久化**、合并单元格、宏/脚本、图表、透视表、外部链接…」，处置方式写明"命令拦截器拒绝" |
| 表面 | `editor/src/spreadsheet/univer.ts:173` `formulaBar: false`；`:119` CSS `[data-u-comp="formula-bar"]{display:none}` | 公式栏根本不渲染 |
| 表面 | `univer.ts:181` `menu: HIDDEN_MENUS`（含函数 / 图表 / 透视） | 菜单里没有函数入口 |
| 拦截器 | `interceptors.ts:181` 检测 `typeof cell.f === "string" && cell.f.length > 0` → `:534,568` `hint(HINTS.formula)` | 直接**取消命令**并提示「公式不可用，配表不持久化公式」（`interceptors.ts:13`） |
| 拦截器 | `interceptors.ts:197-198` `if ("f" in cell) delete cell.f` | 粘贴路径**剥掉公式只留值**，提示「粘贴含公式，已仅保留值」（`:17`） |
| 提取 | `editor/src/spreadsheet/extract.ts` 全文 grep `formula` / `\.f\b` = **0 命中** | 提取器只认 `v` + `custom.lumio`，公式字段在数据通道里不存在 |
| E2E | `tests/e2e/sheet-ops.spec.ts:73` "formula edits are rejected; value-only writes extract"（**本次实跑通过**） | 写 `{f:"=SUM(1,2)", v:42}` → hint 含"公式"、token 保持原值；再写 `{v:42}` → token 变 42 |

**所以三个具体问题的答案：**

1. **"我的 Excel 表能不能支持公式？"** — 不能，且是**有意的**。这不是 Univer 的能力问题（Univer OSS 支持公式），是本项目在 ADR 0-7 里主动关掉的。理由在 ADR 0-1：`tables/*.txt` 是 Git 管理的**规范化文本权威源**，四态（`@missing` / `""` / `null` / `@default`）+ 终身编号是它的全部语义；公式意味着"单元格的值依赖别的单元格"，这既无法在文本行里表达，也会让内容指纹（`docs/decisions/0-3`）失去确定性，还会让行级 Git 三路合并失效。
2. **"导出 TXT 公式会不会丢？"** — 不会丢，因为**从来就没有过**。用户在编辑器里敲 `=SUM(...)` 会当场被拒并看到中文提示；从 Excel 粘贴带公式的区域，公式被剥掉、**值被保留**，也有提示。所以导出（无论 CSV/TSV 还是将来的 TXT）拿到的永远是已经确定的值。
3. **"怎么保证公式还存在？"** — 在当前架构下，**公式不该存在于配表里，该存在于"编译期"**。ADR `0-3` 已经给了这个模式：「作者可写『5%』『2.5秒』，**编译期换算**；权威数值列用定点整数」。也就是说，派生值的正确落点是三选一：
   - **（推荐）计算列 / 派生列**：在 `schemas/<t>.json` 里声明某列是派生列 + 一条受限表达式（引用同行其它列），由 `lumio_config.py export` 在编译期算出、写进 `build/export/` 产物，源表里**不存这一列的值**。表里存的仍是纯数据，公式存在 schema 里、被版本管理、可被双语言（Rust/C#）一致复算。
   - **离线算好再贴值**：作者在自己的 Excel 里用公式推演，粘贴进编辑器时公式自动剥离只留值（现状已支持）。零开发成本，代价是推演过程不进版本库。
   - **绝不做**：把公式串当字符串存进 `tables/*.txt`。那会同时破坏内容指纹、四态语义和 Git 行级合并，且 ADR 0-7 明令禁止。

**归属与变更路径**：「公式持久化」的禁令写在 `docs/decisions/0-7`（架构仓镜像 ADR，本仓 `.spec/AGENTS.md` 红线 1 与红线 5 都指向它，**本仓不得改写**）。若 Owner 想要"计算列"，路径是：**先在架构仓走 ADR**（新增"派生列 / 编译期表达式"决议，钉死表达式语法子集、求值确定性、Rust/C# 一致性测试向量、以及派生列是否进内容指纹），**架构仓拍板后**本仓才实现 schema 字段 + 导出器求值 + 编辑器把派生列渲染成只读列（复用现有 `readOnly` 通道与 🔒 标记）。**不要在本仓先发明表达式语法。**

---

## E. known gaps 复核

交回物 `.sdd/m6-*-return.md` 不存在（§0.2），故改以 `editor/docs/a11y-checklist.md` 中被 Task 20 显式标为「残留」的条目 + 本次实走新发现为准。

| # | 缺口 | 记录处 | 现状（本次核实） |
| --- | --- | --- | --- |
| E-1 | 阻断页真浏览器视觉走查未做 | `a11y-checklist.md` §4 末条（未勾） | **仍在，且比记录的严重**。不只是"截图没补"——`Blocked` 在"连上后断线"场景**根本不可达**：`grep -n "online" App.tsx` 显示 `dispatch({type:"online", online:true})` 只在 `App.tsx:536` 与 `:794` 出现，**全前端没有一处派发 `online:false`**。SSE 断流在 `client.ts:88-90` 只是 `break` 出 `pump()` 循环，无回调；`draftSession.ts:51-56` 的 `void subscribeEvents(handler).then(...)` **无 `.catch`**，连接失败也被吞。故 `App.tsx:1745` 的 `hostMode && !state.online` 只对"首次就没连上"成立。**升级为 P1** |
| E-2 | （新发现，无人记录） | — | **还原改动后错误页签不清空**。`App.tsx:1416-1425` 的 state 选择器把 `errors.length > 0` 排在最前，`no-changes` / `not-validated` / `clean` 三个空态在有历史错误时永远够不到；而 `setErrors([])` 只在草稿保存成功（`:258`）和提交成功（`:679`）时调用，**回滚到干净态不触发**。实走：`ReadyClean` + 补丁 0 + "无未提交改动" 与「错误 1」并存 6s 不消。**P2** |
| E-3 | J1 / J3 无独立键盘旅程用例 | `a11y-checklist.md` §3 第 4 条（已勾但注明并入 J2） | 仍在。`keyboard-journeys.spec.ts` 只有 J2/J4/J5 三条旅程 + 1 条反向用例（本次实跑 4 条全绿），J1（看表）与 J3（核对改动）确实并在 J2 里。属可接受的口径合并，但清单勾了 `[x]` 与正文"记为残留"自相矛盾，建议改成 `[~]` 或拆条 |
| E-4 | 错误跳格无独立 e2e | `a11y-checklist.md` §3 第 6 条（已勾，注明"无独立 e2e，记为残留"） | 仍在。**但本次浏览器实走已补上人工证据**（§C-5 跳格生效）。建议补一条 e2e 收口 |
| E-5 | 七种标记灰度可辨未人工走查 | `a11y-checklist.md` §2 末条 + §3 第 7 条（均未勾） | 仍在。第二通道（脏格三角 / 四态徽标 / 新行「新」/ 删除线 / `!` / ⚑ / 🔒）代码与单测在 `spreadsheet/badges.ts`，但灰度视觉走查确实没做 |
| E-6 | `.grid-toolbar__hint` 对比度豁免 | `a11y-checklist.md` §1.1 第 1 条 | **已修**。清单标 `[x] 项关`；本次 `a11y.spec.ts` 三态实跑 `violations: []` 证实 |
| E-7 | `landmark-one-main` / `page-has-heading-one` / `region` moderate 违例 | `a11y-checklist.md` §1.2 三条 | **已修**。三条均 `[x]`，本次三态 axe 零违例证实 |
| E-8 | `#univer-doc-main-canvas` tabindex 豁免 | `a11y-checklist.md` §1.1 第 2 条 | 仍在，**合理**。Univer 0.25.1 第三方 DOM，本仓源码改不了，已记为升版重评项 |

**小计：已修 2 类（E-6、E-7，共 5 条 axe 违例），仍在 5 条，新发现 2 条（E-1 升级 + E-2）。**

---

## F. 完成度总评

### F.1 分域打分

评分口径：10 = 验收项全覆盖且有本次实跑证据；扣分只扣**已证实的缺口**，不扣"没写文档"这类观感。

| 域 | 分 | 依据 |
| --- | --- | --- |
| 表格编辑（拦截器 / 四态 / Delete / 粘贴 / 公式拒绝） | **9.5** | `interceptors`(17) + `keyboard.spec`(6) + `four-state.spec`(11) + `sheet-ops`(6) 全绿；实走确认四态清 v。扣 0.5：列头可读性（D1）属编辑体验的一部分 |
| 四态呈现与视觉 | **9.5** | ADR 0008 有据可查（证据到 d.ts）、`badges.ts` 落地、`projection.roundtrip`(19) 守住"徽标不进 v/token"。扣 0.5：灰度可辨走查未做（E-5） |
| 草稿与提交 | **9** | 实走确认草稿自增 v0→v1、落盘、还原；`host-drafts`(4) + `host-submit`(1) 绿。扣 1：提交路径本次未在真仓实走（有意规避），仅靠临时仓 e2e |
| 冲突处理 | **9** | `host-rebase`(3) 绿含"全部解决→重提交→双方改动都在"；`ConflictTab`(12) 绿；`window.prompt` 零命中。扣 1：未在真仓实走 |
| 导出 | **8** | 实走下载链路通、README.txt 在、目录隔离干净。扣 2：格式只有 CSV/TSV，缺 Owner 要的权威 TXT（D4） |
| 改动页签（M6-K） | **9.5** | Host 端点 + 前端 + svn/none 降级四条 e2e 全绿；实走列出真实修订与格级差异并可跳格 |
| 键盘 | **8.5** | `HOTKEYS` 10 条键表完整（`useHotkeys.ts:115-124`）、J2/J4/J5 e2e 绿、`Ctrl+K` 实走。扣 1.5：J1/J3 无独立旅程（E-3） |
| a11y | **8.5** | axe 三态零违例（serious+ 与 moderate 都清零）、Dialog/Menu/Drawer/Blocked 的 ARIA 与焦点管理均有单测。扣 1.5：灰度走查未做（E-5）、阻断页视觉走查未做且状态不可达（E-1） |
| 健壮性（掉线 / 错误态收敛） | **4** | **本域是唯一的重伤**。掉线不可感知（E-1，P1）、错误态不清空（E-2，P2）、掉线后切表落进文案错配的 `Failed`（胶囊显示"提交失败"），一次复现中整页白屏 |
| 文档 | **9** | `editor.md` 127 行覆盖 v3 界面 / 四态 / 快捷键 / 改动页签 / 错误码速查；4 张截图；`a11y-checklist.md` 诚实标注残留；`univer-surface.md` / spike / ADR 0008 齐备。扣 1：清单里 E-3/E-4 勾选与正文"残留"自相矛盾 |
| 工程治理 | **7** | 全量门槛（除 §G-2 的环境红）全绿、生成物零漂移、硬约束（无硬编码色 / 无 prompt / 无英文阶段名 / testid 保留）全部独立复核通过。扣 3：交回物层整体缺失（§0.2），任务书 §4.5 与 §8 要求的台账没留下 |

**加权总评：约 8.4 / 10。** 功能主干可交付；健壮性一域拖尾，且恰好是用户最容易撞上的场景（终端关了、机器睡了、Host 崩了）。

### F.2 建议的下一波需求卡清单

按"先止血、后补功能"排序。

| 序 | 卡 | 归属 | 优先级 | 一句话范围 |
| --- | --- | --- | --- | --- |
| 1 | **掉线态真正可感知** | 本仓 | **P1** | `client.ts` 的 SSE `pump()` 结束与 `subscribeEvents` 失败都要回调；`draftSession.subscribe` 补 `.catch`；派发 `online:false`；`Blocked` 在断线场景可达；API 失败不再一律落 `Failed`（"提交失败"文案错配要一并修）；补 e2e：serve 起→杀→断言阻断页 |
| 2 | **错误页签状态收敛** | 本仓 | P2 | `App.tsx:1416` 的 state 选择器改为 `dirtyCount === 0 → no-changes` 优先；脏格归零时 `setErrors([])`；补单测 |
| 3 | **D1 列头可读性** | 本仓 | P2 | S/C/V 图例常驻 + 第二行中文化 + 列宽按列名自适应（消 `cooldown_frames` 折行）；文案进 `copy.ts` |
| 4 | **D2 源文件与 Schema 路径可见** | 本仓 | P2 | `session.py` 表摘要加 `sourcePath`；表名菜单显示两条路径，点击复制 + toast |
| 5 | **D5-a 源文件只读端点 + 右键查看** | 本仓 | P2 | `GET /api/tables/{t}/source?kind=table\|schema`，闭合枚举 + `_valid_table` + `relative_to(root)` 兜底 + 既有 `_authorize_api`；`TableList` 右键复用 `ui/Menu` |
| 6 | **D4 导出支持权威 TXT** | 本仓 | P2 | 格式枚举加 `txt`，复用 `text_table.format_table_text`；**明确"只读快照不可回导"**；`targets` 对 TXT 只允许"全部"（待 Owner 确认） |
| 7 | **D5-b 在资源管理器中显示** | 本仓 | P3 | `POST /api/reveal` 只接 `{table,kind}`，argv + `shell=False`；默认关，`--allow-reveal` 显式开；`capabilities.reveal` 驱动菜单可见性。**需 Owner 授权** |
| 8 | **D3-a 编辑器内建新表** | 本仓（前置架构仓） | P3 | **先问架构仓：新表的行号命名空间授权规则（ADR 0-2）**；再做 `POST /api/tables` + 命令面板「新建表…」 |
| 9 | **D3-b 导入降级为补丁草案** | 本仓（需 Owner 拍板） | P3 | `POST /api/import/preview` 只解析不落盘 → 返回 `Patch` → 灌进补丁页签走既有通道。**Owner 须先就"导入绝不整文件覆盖"签字**（ADR 0-1 §2） |
| — | *（可选）派生列 / 编译期表达式* | **架构仓** | 待定 | 仅当 Owner 确实要"表里带公式"时才启动；必须**先在架构仓走 ADR**（表达式语法子集、求值确定性、Rust/C# 向量、是否进内容指纹），本仓不得先发明语法。见 §D6 |

外加两条工程卡（非功能）：
- **`.sdd/` 交回物制度补课**：M6-F～M6-K 六份 §8 交回物补记（或明确改为"交回物落 `docs/reviews/`，`.sdd/` 只作临时区"），否则下一轮仍无台账可对。
- **Node 版本上界**：`editor/package.json` 的 `engines.node` 从 `>=22` 收成 `>=22 <26`，或改用 `window.localStorage` 注入（见 §G-2）。

---

## G. 漂移节（文档与代码不符 / 环境与门槛不符）

### G-1 · `pnpm lint` 在干净检出上会红 — 环境，非代码
首跑 `pnpm lint` 失败 6 个 tsc 错，全部指向 `tests/e2e/a11y.spec.ts` 找不到 `@axe-core/playwright`。查证：`editor/package.json:33` 与 `pnpm-lock.yaml:84,2347` 都正确锁了 `4.13.0`，但本机 `node_modules/@axe-core` 不存在，且 `pnpm install --offline` 报 `ERR_PNPM_NO_OFFLINE_TARBALL`（**该包从未进过本机 pnpm store**）。执行 `pnpm install --frozen-lockfile`（联网，仅装 lockfile 已锁的这一个包）后 `pnpm lint` 全绿、`a11y.spec.ts` 三条全跑并零违例。
**判定**：仓库无缺陷，是本机 Task 18 收口时 devDependency 未真正落到当前 `node_modules`。**副作用**：任何在本机不重装依赖就跑 `pnpm lint` 的人都会看到红，且 `a11y.spec.ts` 会整文件报错——`e2e-report.md` / 交回物里若声称"lint 绿 + a11y 跑过"，需要说明当时的 `node_modules` 状态。

### G-2 · `pnpm test` 24 条红 — Node 26 与 vitest jsdom 冲突
`tests/TableList.test.tsx`(11) + `tests/GridToolbar.test.tsx`(13) 全红，错误统一是 `TypeError: Cannot read properties of undefined (reading 'clear'/'setItem'/'removeItem')`，位置在 `TableList.test.tsx:64,171,185` 与 `GridToolbar.test.tsx:81` 的 `localStorage.*`。

逐步定位（探针测试，跑完即删，未留痕）：
- `node --version` = **v26.4.0**；`node -e "globalThis.localStorage"` → `undefined` + `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`。Node 26 自带一个全局 `localStorage` 访问器，不给 flag 就返回 `undefined`。
- `vitest.config.ts:7` 确有 `environment: "jsdom"`，`jsdom@26.0.0` 也确实装好了：探针里 `new JSDOM("", {url:"http://localhost:3000"}).window.localStorage` → `object`（**jsdom 本身正常**）。
- 但在 vitest 的 jsdom 环境里，`Object.getOwnPropertyDescriptor(globalThis,"localStorage")` 仍是 **Node 自己的 getter**（`get=function`），`window === globalThis` 为 `true`，`window.localStorage` = `undefined`。即 vitest 的 `populateGlobal` 没有覆盖这个已存在的全局名，jsdom 的 Storage 到不了测试。

**判定**：环境冲突，不是产品缺陷——`TableList` / `GridToolbar` 的功能本次已在浏览器实走确认可用。但它有真实后果：**这两张卡（Task 12 / R-00380 S01 S02）的"单测绿"验收证据在当前工具链上取不到**，且任何人升到 Node 26 后 `pnpm test` 都会红。
**顺带一条代码侧观察**：`viewState.ts:57,81,95,107,128` 把 storage 做成可注入形参（`storage: Pick<Storage,...> = globalThis.localStorage`），所以 `viewState.test.ts` 5 条全绿；而 `TableList.tsx:32-33` 直接裸用 `localStorage`。**同一仓库两种写法**，健壮的那种恰好没被推广。修复建议见 §F.2 末条。

### G-3 · a11y 清单勾选口径与正文自相矛盾
`a11y-checklist.md` §3 第 4 条（J1–J5）与第 6 条（错误跳格）都打了 `[x]`，但正文分别写着"J1 / J3 无独立旅程用例，记为残留"和"无独立 e2e 用例，记为残留"。清单开头自定的口径是"给出自动用例 ID 或截图 / 走查证据才打勾"。**勾选状态与自述残留不一致**，建议引入 `[~]`（部分）或拆条。

### G-4 · 交回物层整体缺失
任务书 §4.5 要求每张子卡合入后在 `.sdd/progress.md` 追加一行、§8 要求每张 Workflow 卡收口出一份交回物。实际：`.sdd/.gitignore` = `*`（整目录忽略），目录内只有 `progress.md` 且**内容属于更早的 `editor-ui-primitives` feature**，M6-F～M6-K 零记录；`m6-{f,g,h,i,j,k}-return.md` 不存在。
**后果**：本次审计的 A/B/E 三维无法与交回物对账，只能全靠代码 + 测试重建。这也意味着**下一轮审计会重复同样的成本**。

### G-5 · 掉线后的胶囊文案错配（P2，随 F.2-1 一并修）
Host 已死时切表，`App.tsx` 的 catch 统一 `dispatch({type:"failed", ...})`，胶囊渲染成红字「**提交失败**」——用户从头到尾没点过提交。正确表达应是"与本机服务失去连接"。实走截图为证。

---

## H. 附：本次执行的命令清单

```bash
# 前端
cd editor
pnpm lint                                    # 首跑 FAIL(tsc×6) → pnpm install --frozen-lockfile → PASS
pnpm vitest run                              # 24 failed | 289 passed (313)，2 文件红（§G-2）
pnpm vitest run tests/TableList.test.tsx     # 隔离复现：11 failed
pnpm vitest run tests/GridToolbar.test.tsx   # 隔离复现：13 failed
pnpm build                                   # PASS；随后 git diff -- src/lumio_config/editor_static 为空
pnpm exec vite &                             # e2e 用（本机无 corepack，webServer 走 reuseExistingServer）
PYTHON=/usr/local/bin/python3.11 pnpm e2e    # 54 passed (45.0s)

# Host / 仓库
cd ..
/usr/local/bin/python3.11 -m unittest discover -s tests     # Ran 150 tests — OK (skipped=1)
/usr/local/bin/python3.11 tools/lumio_config.py validate     # validate: OK
/usr/local/bin/python3.11 tools/lumio_config.py format --check  # format: OK
git diff --check                                             # 无输出
node <插件目录>/tools/spec-lint.mjs .                        # spec-lint: OK

# 浏览器实走
/usr/local/bin/python3.11 -u tools/lumio_config.py serve --port 8850 --no-open
/usr/local/bin/python3.11 -u tools/lumio_config.py serve --port 8851 --no-open   # 掉线场景干净复现

# 独立复核（不信交回物）
grep -rn "window.prompt" editor/src                                    # 0
grep -rEn "#[0-9a-fA-F]{3,8}\b|rgba?\(" editor/src/panels editor/src/components  # 0
grep -rn "schemaPath\|sourcePath" editor/src                           # schemaPath 0 命中（Host 送了没人用）
```

收尾：删除 `.lumio/drafts/skills.json`、`build/export/editor/<exportId>/`，`git checkout -- editor/docs/poc-benchmark.md`，探针测试文件已删。**`git status` 干净，`main` 未动。**

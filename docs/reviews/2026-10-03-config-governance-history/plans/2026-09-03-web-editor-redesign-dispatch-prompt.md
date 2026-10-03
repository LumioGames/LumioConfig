---
status: pending
---

# 网页编辑器重设计 v3 · 开发 Agent 派活提示词（2026-09-03）

> 用途：把本文整段交给负责实现的**主 loop Agent**（Claude Code，本仓，`~/LumioGames/LumioConfig`）。它是调度者，不亲自写大段代码；按 §3 的阵列把工作并行扇出给 worker，负责合入、接线、收口、交回。本文同时是 `subagent-driven-development` 技能可直接消费的计划：每张子卡是一个 `## Task N` 节，`scripts/task-brief <本文路径> N` 能把它切成 worker 简报。

---

## 0. 你的角色与真值

你是 LumioConfig 仓库网页编辑器重设计 v3 的**主 loop / 仓内总调度**。目标：把 Workflow 上六张需求卡 R-00378～R-00383 做完、审过、合入 main。

真值优先级（冲突时序号小的赢）：

1. 本仓 `.spec/AGENTS.md` 红线与收口门槛；插件注入的调度 / 编码规程。
2. `docs/decisions/0-7-web-editor-boundary-and-stack.md`、`0-8-draft-submit-merge-lifecycle.md`（不得突破；发现设计与之冲突 → 停下上报 Owner）。
3. `.spec/decisions/0003`～`0007`（Owner 已拍板，不再讨论）；`0008` 由 Task 4 产出后同级生效。
4. `.spec/knowledge/features/web-editor-ux.md`（设计稿正文，尺寸 / 文案 / 状态表 / 令牌以它为准）。
5. `.spec/plans/2026-09-03-web-editor-redesign-plan.md`（六卡文件集与接口签名）与本文（子卡拆解、并行时序、协议）。
6. Workflow 六卡正文与验收项（只读；与仓内不一致以仓内为准并上报）：R-00378 M6-F、R-00379 M6-G、R-00380 M6-H、R-00381 M6-I、R-00382 M6-J、R-00383 M6-K，uuid 见 plan 文件头部与 Owner 记忆。
7. `editor/docs/prototype/`（原型与设计师 README）只作外观参考，不搬 HTML。

**Workflow 只读。** 流转、评论、附件由 Owner 或架构仓总调度会话做；你在交回物里附卡号 + 提交号 + 证据，Owner 据此流转。

---

## 1. 开工先读（按序，只读一次，之后靠文件路径引用）

1. `.spec/AGENTS.md`、`.spec/knowledge/README.md` 导航到的 `standards/{workflow,code-style,testing,dispatch}.md`。
2. `docs/decisions/0-7`、`0-8` 全文；`.spec/decisions/0003`～`0007`。
3. `.spec/knowledge/features/web-editor-ux.md` 全文；`.spec/knowledge/features/editor-ui-primitives.md`（已交付的 Button / Panel / DataTable 与令牌）。
4. `.spec/plans/2026-09-03-web-editor-redesign-plan.md`。
5. `docs/reviews/2026-09-03-editor-core-edit-path-adversarial-review.md`（阵列 A 的修复依据，P1-1 / P1-2 / P2-1 / P2-2 有 `文件:行号`）。
6. 代码：`editor/src/app/App.tsx`、`app/state.ts`、`api/types.ts`、`spreadsheet/{univer,interceptors,projection,cellMeta,editors,fourState,viewState}.ts`、`components/ui/*`、`styles/*`、`editor/tests/e2e/*.spec.ts`（记下全部 `data-testid` 与 `toContainText` 断言）、`editor/tests/Button.test.tsx`（React 单测写法）、`src/lumio_config/editor/{vcs,session,server}.py`。
7. `.sdd/progress.md`（上一轮 editor-ui-primitives 的台账，含 E2E 环境经验）；本轮在其后新开一节。
8. 插件技能 `subagent-driven-development` 的 SKILL.md（File Handoffs / Durable Progress / Model Selection / Handling Implementer Status）与 `implementer-prompt.md`、`code-reviewer.md`。

读完先做 **Pre-Flight**：核对 §3 各阵列子卡文件集两两不重叠、依赖边只指向更早的 wave；有冲突一次性打包问 Owner，没有就直接开工，不要逐条打断。

---

## 2. 硬约束（每份 worker 简报都带上，一字不省）

- 不改 `docs/decisions/0-7`、`0-8`；不改 `tables/ registry/ schemas/`；不改 ADR 0003～0007（要改 → 停，报 Owner）。
- 不加运行时依赖；不引 `@univerjs-pro/*`；CSP `default-src 'self'` 下不引外链字体 / 脚本 / 图标（图标内联 SVG）。devDependency 只允许本文点名的一项（Task 18 的 `@axe-core/playwright`）。
- 技术栈固定：React + TypeScript strict + Vite；Univer OSS `0.25.1` 锁版；Host 只用 Python 标准库。
- 所有用户可见文案只能来自 `editor/src/app/copy.ts`（Task 6 产出）；不得出现英文阶段名、`autoCommit` / `autoExport`、`local.json`、`sha256:` 全文。
- 组件样式只用 `editor/src/styles/tokens.css` 变量；`src/panels/**`、`src/components/**` 不写十六进制色 / `rgb(`（Task 5 的守卫单测会拦）。`projection.ts` 的 `STYLES` 是工作簿数据，允许字面色值但须与设计稿 §4 表一致并注释指向该表。
- `window.__lumioPoc` 桥保留；E2E 实际引用的 8 个 testid（`univer-root table-<name> status-hint draft-refresh btn-export export-link conflict-panel conflict-mine`）必须保留；6 个中文断言片段（「标签页」「合并」「id」「公式」「已合入仓库」「打开时」）改文案时同卡改断言。
- 四态徽标不得写进单元格 `v` 或 token（`projection.roundtrip.test.ts` 两条守卫保留）；空行占位文案只在渲染层。
- 生成物 `src/lumio_config/editor_static/` 只在 Task 20 重建并提交；worker 在 worktree 里跑过 `pnpm build` 后**不得提交** `editor_static/` 与 `editor/docs/poc-benchmark.md` 的抖动。
- `App.tsx` 不进重设计实现卡（Task 5～19）的 worker 文件集，由主 loop 在每个阵列合入时接线；唯一例外 Task 3（只改 `installInterceptors` / `canEdit` 时序）。
- 不夹带：只做本卡文件集内、本卡验收要求的改动；不顺手重构。
- TDD：所有子卡均为大任务，先写失败测试；每卡只跑覆盖本卡的测试；全量收口门槛由主 loop 在阵列合入后跑。
- 一次提交只做一类事；提交信息 `feat(editor): …` / `fix(editor): …` / `test(editor): …` / `docs(editor): …`，末尾 `Co-Authored-By` 按宿主要求。

---

## 3. 阵列与并行时序（核心）

六张 Workflow 卡拆成 20 张子卡，编成 A～F 六个阵列。**能并行的一律并行**：同一时刻所有文件集互不重叠的子卡一起扇出，每个 worker 独立 worktree；串行只保留无法解除的依赖。

```text
T0（开工即扇出 8 个 worker）
  阵列 A · M6-F 修复      Task 1 A1 拦截器+真实键盘 ─┐
                          Task 2 A2 投影清值+invalid 守卫 ├─▶ A 合入 → M6-F 收口审查(深审) → main
                          Task 3 A3 canEdit 时序           │
                          Task 4 A4 四态呈现 spike → ADR 0008 ┘
  阵列 B · M6-G 契约层    Task 5 B1 令牌+组件 CSS ─┐
                          Task 6 B2 phaseView/copy/failKind ├─▶ (等 Task 10) B 合入 + App 接线 → M6-G 收口 → main
                          Task 7 B3 UI 原语+useHotkeys     ┘
  阵列 C · M6-K Host      Task 8 C1 vcs log/show ─▶ T1 Task 9 C2 history 端点
T1（Task 1 合入后）       Task 10 B4 Univer 表面裁剪（碰 interceptors.ts，须在 A1 之后）；Task 9 C2
T2（B 合入 + App 接线后） 阵列 D · M6-H  Task 11 D1 顶栏/横幅/状态条 │ Task 12 D2 表列表+工具栏 │ Task 13 D3 投影视觉+检查器（四态部分等 ADR 0008）
                          → 主 loop：App.tsx + app.css 壳网格接线 → layout.spec 全绿 → M6-H 收口 → main
T3（D 合入后）            阵列 E · M6-I  Task 14 E1 抽屉壳+补丁 │ Task 15 E2 错误+冲突 │ Task 16 E3 导出+设置+seen 横幅
                          → 主 loop：App.tsx 接线、删旧面板 → host-* E2E 全绿 → M6-I 收口 → main
T4（E 合入后）            阵列 F · M6-J  Task 17 F1 命令面板+快捷键+提交确认 │ Task 18 F2 阻断页+a11y │ 阵列 C Task 19 C3 改动页签（M6-K 前端）
T5（F1/F2/C3 合入后）     Task 20 F3 文档 + editor_static 重建（主 loop 自做，串行最后）→ M6-J、M6-K 收口 → main
```

并行上限：T0 八个 worker；T2～T4 各三个。宿主并发吃紧时按 Task 编号顺序排队，**不要**把两张子卡塞给同一个 worker。

### 3.1 子卡总表（文件集两两不重叠；同名文件跨阵列出现的按 T 序串行）

| Task | 阵列 · 子卡 | Workflow 卡 / 验收项 | 启动条件 | 独占文件集 | 模型档位 |
| --- | --- | --- | --- | --- | --- |
| 1 | A1 fix-interceptors-keyboard | R-00378 S01 S02 S03(启动无残留 T0 用例) | T0 | `editor/src/spreadsheet/interceptors.ts`、`editor/tests/interceptors.test.ts`、`editor/tests/e2e/keyboard.spec.ts`（新） | standard |
| 2 | A2 fix-projection-clear-v-invalid-guard | R-00378 S03 | T0 | `editor/src/spreadsheet/{projection,cellMeta,editors}.ts`、`editor/tests/projection.roundtrip.test.ts`、`editor/tests/editors.test.ts`（新） | standard |
| 3 | A3 fix-canedit-install-order | R-00378 S03 | T0 | `editor/src/app/App.tsx`（仅 `installInterceptors` / `canEdit` 时序） | mid |
| 4 | A4 spike-four-state-render | R-00378 S04 | T0 | `editor/docs/four-state-render-spike.md`（新）、`editor/docs/spike/**`（demo，不入 build）、`.spec/decisions/0008-four-state-rendering.md`（新）、`.spec/decisions/README.md`（索引一行）、`.spec/knowledge/lessons.md` | 最强 |
| 5 | B1 contract-tokens-and-ui-css | R-00379 S01 | T0 | `editor/src/styles/{tokens,ui}.css`、`editor/index.html`、`editor/tests/no-hardcoded-colors.test.ts`（新） | mid |
| 6 | B2 contract-phaseview-copy-failkind | R-00379 S02 | T0 | `editor/src/app/{phaseView,copy}.ts`（新）、`editor/src/app/state.ts`、`editor/src/api/types.ts`、`editor/tests/state.test.ts`、`editor/tests/{phaseView,copy}.test.ts`（新） | mid |
| 7 | B3 contract-ui-primitives | R-00379 S03 | T0 | `editor/src/components/ui/{Tabs,Dialog,Toast,Menu}.tsx`（新）、`components/ui/useHotkeys.ts`（新）、`components/ui/Button.tsx`、`components/ui/index.ts`、`editor/tests/{Tabs,Dialog,Toast,Menu,useHotkeys}.test.tsx`（新） | mid |
| 8 | C1 host-vcs-log-show | R-00383 S01（白名单部分） | T0 | `src/lumio_config/editor/vcs.py`、`tests/test_editor_vcs.py`（新） | mid |
| 9 | C2 host-history-endpoint | R-00383 S01 S02 | Task 8 合入 | `src/lumio_config/editor/history.py`（新）、`src/lumio_config/editor/server.py`、`src/lumio_config/editor/session.py`、`tests/test_editor_history.py`（新） | standard |
| 10 | B4 contract-univer-surface | R-00379 S04 | Task 1 合入 | `editor/src/spreadsheet/{univer,menus,commands}.ts`（后两个新）、`editor/src/spreadsheet/interceptors.ts`（仅抽 `COMMAND`）、`editor/docs/univer-surface.md`（新）、`editor/tests/e2e/{sheet-ops,four-state}.spec.ts` | standard |
| 11 | D1 shell-topbar-banner-statusbar | R-00380 S02、host-drafts 迁移 | B 合入 + App 接线 | `editor/src/panels/{TopBar,Banner}.tsx`（新）、`panels/StatusBar.tsx`（重写）、`editor/tests/e2e/host-drafts.spec.ts`、`editor/tests/{TopBar,Banner,StatusBar}.test.tsx`（新） | standard |
| 12 | D2 shell-tablelist-toolbar | R-00380 S01(侧栏) S02(工具栏) | 同上 | `editor/src/panels/TableList.tsx`（重写）、`panels/GridToolbar.tsx`（新）、`editor/tests/{TableList,GridToolbar}.test.tsx`（新） | mid |
| 13 | D3 grid-visuals-inspector | R-00380 S01(高度/检查器) S03 S04 | 同上 + ADR 0008 已合入 | `editor/src/spreadsheet/{projection,cellMeta,viewState}.ts`、`panels/Inspector.tsx`（新）、`editor/tests/projection.roundtrip.test.ts`、`editor/tests/Inspector.test.tsx`（新）、`editor/tests/e2e/layout.spec.ts`（新） | standard |
| 14 | E1 drawer-shell-patchtab | R-00381 S01 | D 合入 + App 接线 | `editor/src/panels/drawer/{Drawer,PatchTab}.tsx`（新）、`editor/tests/{Drawer,PatchTab}.test.tsx`（新）、`editor/tests/e2e/host-submit.spec.ts` | standard |
| 15 | E2 drawer-error-conflict | R-00381 S02 S03 | 同上 | `editor/src/panels/drawer/{ErrorTab,ConflictTab}.tsx`（新）、`editor/tests/{ErrorTab,ConflictTab}.test.tsx`（新）、`editor/tests/e2e/host-rebase.spec.ts` | standard |
| 16 | E3 drawer-export-settings-seen | R-00381 S04 | 同上 | `editor/src/panels/drawer/ExportTab.tsx`（新）、`panels/SettingsDialog.tsx`（新）、`editor/src/spreadsheet/viewState.ts`、`editor/tests/viewState.test.ts`、`editor/tests/{ExportTab,SettingsDialog}.test.tsx`（新）、`editor/tests/e2e/host-export.spec.ts` | mid |
| 17 | F1 palette-hotkeys-confirm | R-00382 S01 S02 | E 合入 + App 接线 | `editor/src/panels/{CommandPalette,SubmitConfirm,ShortcutsDialog}.tsx`（新）、`components/ui/useHotkeys.ts`（全量键表）、`editor/tests/{CommandPalette,SubmitConfirm}.test.tsx`（新）、`editor/tests/e2e/keyboard-journeys.spec.ts`（新） | standard |
| 18 | F2 blocked-empty-a11y | R-00382 S03 | 同上 | `editor/src/panels/Blocked.tsx`（新）、`editor/docs/a11y-checklist.md`（新）、`editor/package.json` + `pnpm-lock.yaml`（仅 devDependency `@axe-core/playwright`）、`editor/tests/e2e/a11y.spec.ts`（新）、`editor/tests/Blocked.test.tsx`（新） | mid |
| 19 | C3 history-frontend | R-00383 S03 S04 | E 合入 + Task 9 合入 | `editor/src/api/{types,client}.ts`、`editor/src/panels/drawer/DiffTab.tsx`（新）、`editor/tests/DiffTab.test.tsx`（新）、`editor/tests/e2e/host-history.spec.ts`（新） | standard |
| 20 | F3 docs-and-static（主 loop 自做） | R-00382 S04、R-00383 文档段 | 17/18/19 合入 | `docs/reference/editor.md`、`src/lumio_config/editor_static/`、`editor/docs/screens/*.png` | — |

旧面板文件（`panels/{DiffPreview,ErrorPanel,ConflictPanel,ExportPanel,SettingsPanel}.tsx`）由**主 loop 在 E 合入接线的同一提交里删除**，worker 不删（否则 worktree 里 `App.tsx` 编不过）。

---

## 4. 派工协议（每张子卡）

1. 主 loop 站在该阵列的集成分支上（§5），运行 `<插件目录>/skills/subagent-driven-development/scripts/task-brief .spec/plans/2026-09-03-web-editor-redesign-dispatch-prompt.md N`，得到简报路径 `.sdd/task-N-brief.md`。
2. 用 `Agent` 工具派 worker：`subagent_type: general-purpose`，`isolation: "worktree"`，`run_in_background: true`，`model` 按 §3.1 档位（cheapest = haiku，mid = sonnet，standard / 最强 = opus）。同一 T 序的子卡**在同一条消息里一起派出**。
3. 派遣 prompt 用插件 `implementer-prompt.md` 骨架填空，只含：① 一句话定位（阵列 / Workflow 卡 / T 序）；② 简报路径（"先读它，它是你的需求，数值与签名逐字照用"）；③ 它 Consumes 的契约文件路径（不贴内容）；④ `【文件集边界】只改：<独占文件集>。并行方正在改：<同 T 序其他子卡文件集>（一律不动；lint / tsc 报错涉及它们时只记录，主 loop 统一收口）`；⑤ §2 硬约束全文；⑥ §6 环境事实；⑦ 报告文件路径 `.sdd/task-N-report.md` 与状态口径（`DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`）。**不贴前几轮历史。**
4. worker 交回后：先看 diff 是否越出文件集；再核对报告里覆盖测试的命令与输出（RED → GREEN 证据）；成功报告不作数，以 diff 与测试为准。`BLOCKED / NEEDS_CONTEXT` → 补上下文重派或拆卡；`DONE_WITH_CONCERNS` 触碰契约 → 先修契约卡再重派消费方。
5. 合入 worker 分支到集成分支后，在 `.sdd/progress.md` 追加一行 `Task N (阵列X): complete (commits <base7>..<head7>, merged)`，concern 用 `note:` 行。**这是你唯一可靠的进度记忆**；上下文被压缩后以它和 `git log` 为准，不重派已完成子卡。

---

## 5. 合入、接线与卡级收口协议（主 loop）

**分支**：每张 Workflow 卡一条集成分支，从最新 `origin/main` 切：`feat/editor-v3-m6-f`、`…-m6-g`、`…-m6-h`、`…-m6-i`、`…-m6-j`、`…-m6-k`。worker 的 worktree 分支从集成分支切。阵列 B 的 Task 5～7 在 `…-m6-g` 上与阵列 A 并行开发，但 **M6-G 合入 main 必须在 M6-F 之后**（Task 10 依赖 A1 的 `interceptors.ts`）。阵列 C 的 Host 子卡在 `…-m6-k` 上，与前端完全不重叠。

**接线（主 loop 亲自做，一次一类事，各一个提交）**：

- B 合入后：`App.tsx` 改为消费 `phaseView(state)` 与 `COPY`；`hint` 的 20 余处产生点归类为 `failKind` 或 toast；删除 `four-state-menu` / `onContextMenu`，改为把四态 handlers 传给 `createUniver` 让 `registerFourStateMenu` 注入原生右键；去掉 Task 10 里 `test.skip` 的右键用例。既有 E2E 全绿是接线完成的判据。
- D 合入后：`App.tsx` 换成 TopBar / Banner / 新 StatusBar / 新 TableList / GridToolbar / Inspector；`styles/app.css` 改壳网格 `grid-template-rows: 42px auto 1fr 30px 24px`、`grid-template-columns: <side> 1fr [inspector]`（检查器收起时第三列为 0）；`layout.spec.ts` 全绿。
- E 合入后：接抽屉与 SettingsDialog，删五个旧面板，删常驻面板；host-* E2E 全绿。
- F 合入后：接命令面板 / 提交确认 / 快捷键对话框 / Blocked / Opening 骨架；Task 20 自做。

**卡级收口（每张 Workflow 卡一次）**：

1. `node <插件目录>/tools/closeout-gate.mjs` 定级；跑全量收口门槛（§6 命令）并留输出。
2. `scripts/review-package <集成分支起点> HEAD` 生成审查包；派 `lumio:reviewer`（模板 `code-reviewer.md`），材料 = Workflow 卡四条验收项 + 本文对应 Task 节 + 审查包 + `.sdd/progress.md` + §2 约束。**M6-F 显式深审**（核心编辑路径 + 拦截器）；其余按 gate 定级，默认快审。
3. 退回 → 先对照代码核实再改（不盲改），修复顺序阻塞 → 简单 → 复杂，逐条测，同一问题三次不过升级 Owner；通过 → 合入 main。
4. push：见 §7 Owner 授权勾选。
5. 向 Owner 交回（§8 格式），Owner 流转 Workflow 卡。

---

## 6. 环境事实与收口命令（照抄，别再踩）

- Python 用 `/usr/local/bin/python3.11`（系统 `python3` 是 3.9）。Host 类 E2E（`host-*.spec.ts`）默认 PYTHON 路径是 Windows 的，跑前 `export PYTHON=/usr/local/bin/python3.11`。
- 本机没有 `corepack`：`playwright.config.ts` 的 webServer 命令 `corepack pnpm dev` 会失败。先在另一个终端 `cd editor && pnpm exec vite`，再 `PYTHON=/usr/local/bin/python3.11 pnpm e2e`（`reuseExistingServer` 会接上）。Chromium 若下载停滞，用已缓存版本（上一轮 r1161 手装、审查用 1223 均可）。
- `benchmark.spec.ts` 每跑一次会改写 `editor/docs/poc-benchmark.md`，提交前 `git checkout -- editor/docs/poc-benchmark.md`。
- worktree 里跑过 `pnpm build` 会改 `src/lumio_config/editor_static/`，提交前还原；只有 Task 20 提交它。
- React 单测写法照 `editor/tests/Button.test.tsx`：`react-dom/client` + `act`，不引 testing-library；`act(...)` 警告是已知噪音。
- `.sdd/` 已自忽略；`.claude/worktrees/` 已在 `.gitignore`。

全量收口门槛（每张卡合入 main 前跑一次，附输出）：

```bash
cd editor && pnpm lint && pnpm test && pnpm build && PYTHON=/usr/local/bin/python3.11 pnpm e2e
git diff --exit-code -- src/lumio_config/editor_static   # 只有 M6-J 收口时允许非空，且随后提交
/usr/local/bin/python3.11 -m unittest discover -s tests -v
/usr/local/bin/python3.11 tools/lumio_config.py validate
/usr/local/bin/python3.11 tools/lumio_config.py format --check
git diff --check
node <插件目录>/tools/spec-lint.mjs .
```

---

## 7. Owner 授权与升级（开工前 Owner 勾选，主 loop 照办）

- push 口径（二选一）：
  - [ ] 持续授权：每张 Workflow 卡收口审查通过并合入 main 后，直接 `git push origin main`。
  - [ ] 逐次确认：合入 main 后停下，报 Owner 确认再 push。
- Workflow 流转：Owner 自己做（开工前把对应卡流转到实现中；收口后按交回物流转验收）。主 loop 不碰 Workflow 写接口。
- 必须升级 Owner 的情况：设计稿与 0-7 / 0-8 冲突；需要改 ADR 0003～0008；需要新增本文未点名的依赖；需要改 Host 端点形状（M6-K 之外）；同一问题三次修不过；ADR 0008 的 spike 结论是「两条路都不可行」。
- 升级方式：停下受影响的阵列，其他阵列继续；一条消息说清证据、影响范围、已做的只读检查、需要 Owner 决定什么。

---

## 8. 交回格式（每张 Workflow 卡收口时一份）

按仓库「交回物格式」：① 改动清单（文件 + 一句话）；② 验证证据（§6 每条命令与关键输出、reviewer 报告路径与裁决、E2E 通过数）；③ known gaps；④ 知识沉淀落点（新模式 / 新规范经 `spec-steward` 落 `.spec/knowledge/`，决策记 `.spec/decisions/`；纯修复可豁免但要声明）。另附：Workflow 卡号、四条验收项各自的证据指针、集成分支与合入提交号、`.sdd/progress.md` 相关行。没有证据的「已完成」一律视为未完成。

---

## Task 1 · A1 fix-interceptors-keyboard（阵列 A · M6-F · T0）

**目标**：修 R-00361 退回的两条 P1（`docs/reviews/2026-09-03-editor-core-edit-path-adversarial-review.md` P1-1 `interceptors.ts:359`、P1-2 `:550` / `:510`），并用真实键盘 E2E 守住。

**独占文件**：`editor/src/spreadsheet/interceptors.ts`、`editor/tests/interceptors.test.ts`、`editor/tests/e2e/keyboard.spec.ts`（新）。

**Consumes**：`editor/tests/helpers/fake-univer.ts`（既有 FakeUniver）；`docs/decisions/0-7` §5 Delete 规则；`editor/tests/e2e/host-drafts.spec.ts` 里启动 Host（`serve`、`LUMIO_EDITOR_DIST`、token）的写法。

**做什么**：

1. `attachLumioFromEdit`：Univer 键盘提交的 `value` 携带整格旧 `custom.lumio`。规则改为：只要新 `v` 与当前有效显示值不同，就写 `state: "value", raw: 新文本`，不再因 `existing.state !== "value"` 保留旧 token、不再 `rememberToken` 旧值。
2. CLEAR（`sheet.command.clear-selection-content`）不带 `range` 时，取 `univerAPI` 当前活动选区作为 range，再按 0-7 §5 逐格分派：列有 `default` → `@default`；无默认非 required → `null`；required 无默认 → 取消该格清空并通过既有 hint 通道提示（文案暂用现有 `HINTS`，Task 6 合入后由主 loop 换成 `COPY`）。
3. mutation 分支：`{ v: null }` 不得被记成 `{ state: "value", raw: "" }`。

**测试（TDD，先 RED）**：

- `interceptors.test.ts` 新增：(a) 旧 token `null` + 新 `v: "fx_new"` → `extractTokens` 得 `{ state: "value", raw: "fx_new" }`；(b) 无 `range` 的 clear 在 required 无默认列 → 命令被取消且 hint 非空；(c) 有默认列 clear → `@default`；(d) 可选无默认列 clear → `null`；(e) mutation `{v:null}` 不产生 `raw ""`。
- `keyboard.spec.ts`（真实键盘 `page.keyboard.type / press`，跑在 `LUMIO_EDITOR_DIST=editor_static` + `serve` 上，不经 `__lumioPoc.executeCommand`）：T0 启动后 `status-hint` 为空；T1 值格键入回车 → token 更新、脏格 1；T2 `null` 格键入覆写 → token `value`、`buildPatch` 的 `set` 为新文本；T3 required 无默认 `damage` 按 Delete → token 与画布不变、hint 非空；T4 有默认列 Delete → `@default`（用 `editor/fixtures` 里带 `default` 的列）；T5 可选无默认列 Delete → `null`。T4 若真仓 schema 无默认列，则在 Vite dev + fixtures 上跑并注明。
- 只跑：`pnpm vitest run tests/interceptors.test.ts` 与 `PYTHON=/usr/local/bin/python3.11 pnpm exec playwright test tests/e2e/keyboard.spec.ts`。

**验收对应**：R-00378 S01、S02，S03 的「启动无残留」由 T0 覆盖（Task 3 的改动合入后才会绿，交付时注明）。

## Task 2 · A2 fix-projection-clear-v-invalid-guard（阵列 A · M6-F · T0）

**目标**：修 P2-1（四态写入不清 `v`，`projection.ts:127`）与 `invalid` 误判（`editors.ts:39-54` `numberOutOfRange` 无列类型守卫）。

**独占文件**：`editor/src/spreadsheet/{projection,cellMeta,editors}.ts`、`editor/tests/projection.roundtrip.test.ts`、`editor/tests/editors.test.ts`（新）。若发现四态写入路径需要改 `spreadsheet/fourState.ts`，停下报 `NEEDS_CONTEXT`（该文件无人并行占用，主 loop 会扩文件集）。

**做什么**：

1. 四态写入（右键四态 / Delete 落到四态）生成的单元格数据显式带 `v: null`，画布不再显示旧文本；`badgeFor` 仍只进 `custom.lumio.badge`，`displayValue` 对 missing / empty / null 仍返回空值。
2. `numberOutOfRange(column, raw)`：`column.type` 不在 `NUMBER_TYPES` 时恒 `false`；数值列非数字或越 `minimum` / `maximum` 仍 `true`。`projection.ts:139-141` 与 `interceptors.ts:389-392` 的调用方无需改（后者属 Task 1 文件，不动）。

**测试**：`projection.roundtrip.test.ts` 新增「四态写入后 `v` 为 null」；既有两条「徽标不进 v / token」守卫保留并仍通过。`editors.test.ts`：string 列 `"fireball"` → false；i32 `"abc"` → true；i32 低于 `minimum` → true；`""` / `null` / `@default` / `@missing` → false。只跑这两个文件。

**验收对应**：R-00378 S03（干净仓库打开 `skills` 无红字的 E2E 由主 loop 在 A 合入后用 `keyboard.spec.ts` T0 场景补一条断言）。

## Task 3 · A3 fix-canedit-install-order（阵列 A · M6-F · T0）

**目标**：修 P2-2（`App.tsx:282` `canEdit` 闭包读 `stateRef.current`，`installInterceptors` 在 `dispatch({type:"open"})` 之前安装，启动时误打「另一个标签页已保存」）。

**独占文件**：`editor/src/app/App.tsx`，且只改 `installInterceptors` 的安装时机或 `canEdit` 的读法；不动 JSX、不动其他逻辑。

**做什么**：二选一并说明理由：把 `installInterceptors` 移到 `open` 派发并完成首次渲染之后；或让 `canEdit` 直接读 reducer 的最新快照（例如 `useReducer` 返回值经 ref 同步后再安装）。启动后无编辑时 `status-hint` 必须为空。

**测试**：本子卡无独立测试文件；自检：`pnpm exec vite` 起 dev，用 fixtures 打开三次，`status-hint` 均为空；把复现步骤与结果写进报告。合入后由 Task 1 的 T0 用例守住。

**验收对应**：R-00378 S03「启动无残留」。

## Task 4 · A4 spike-four-state-render（阵列 A · M6-F · T0）

**目标**：回答「Univer 0.25.1 能否在不改单元格 `v` 的前提下画四态徽标」，产出 ADR 0008，供 Task 13 消费（ADR 0006 已把决定权交给本 spike）。

**独占文件**：`editor/docs/four-state-render-spike.md`（新）、`editor/docs/spike/**`（最小 demo，不被 `editor/src` 引用、不进 build）、`.spec/decisions/0008-four-state-rendering.md`（新，格式照 `.spec/decisions/README.md`）、`.spec/decisions/README.md`（索引加一行）、`.spec/knowledge/lessons.md`。

**做什么**：

1. 在 `editor/node_modules/@univerjs/*` 的类型定义里找自定义单元格渲染入口（渲染扩展 / 基于 `custom` 的绘制钩子 / 其他），**只写找得到出处的 API**，每个 API 注明 `node_modules/...d.ts` 路径与行号；找不到就写「未找到」，不猜。
2. 写最小 demo：在一个格子右下角画文本徽标 `∅`，数据层 `v` 保持 `null`；截图入 `editor/docs/spike/`；记录代码量、对复制 / 查找 / 排序 / 导出的影响、升版风险。
3. `four-state-render-spike.md`：结论 + 证据 + 成本 + 风险；`ADR 0008`：在「渲染扩展」与「仅样式（底色 / 边框 / 斜体）+ 检查器与悬停文字」之间二选一，写明依据；硬约束不变（徽标不进 `v` / token）。
4. `lessons.md` 增一条：Univer 键盘提交的 `value` 携带整格旧 `custom`，拦截器不能把既有四态元数据当用户意图；`executeCommand` 造的参数形状不等于真实输入，拦截器改动必须有真实键盘用例。

**测试**：无代码测试；`spec-lint.mjs .` 通过；demo 能在浏览器打开（写明启动命令）。

**验收对应**：R-00378 S04。两条路都不可行 → `BLOCKED` 升级 Owner。

## Task 5 · B1 contract-tokens-and-ui-css（阵列 B · M6-G · T0）

**目标**：把设计稿 §4 令牌表落成 CSS 变量，为 Task 7 的四个原语提供组件类，并加「组件不写字面色」守卫。

**独占文件**：`editor/src/styles/tokens.css`、`editor/src/styles/ui.css`、`editor/index.html`、`editor/tests/no-hardcoded-colors.test.ts`（新）。**不改 `app.css`**（壳网格由主 loop 在 D 合入时改）。

**做什么**：

1. `tokens.css`：既有 13 个 `--color-*` 名称全部保留；按设计稿 §4 表改值 `--color-bg-surface --color-border --color-border-subtle --color-text --color-text-muted --color-accent-bg --color-accent-border --color-danger-text`；`--color-bg-app --color-border-faint --color-warning-*` 不动；新增 `--color-text-faint --color-accent --color-dirty --color-dirty-bg --color-new --color-new-bg --color-danger-bg --color-conflict --color-conflict-bg --color-ai --color-ai-bg --color-readonly-bg`；不设 `--color-danger`。另加字号（10/11/12/13/14）、行高（26）、列头高（36）、圆角（4/12）、两档阴影、字体栈变量，命名 `--font-*` / `--size-*` / `--radius-*` / `--shadow-*`。`:root` 上挂 `data-theme="light"` 切换点（只预留）。
2. `ui.css`：为 Task 7 组件提供类，**类名即契约**：`.tabs .tabs__item .tabs__item.is-active .tabs__count`、`.dialog .dialog__backdrop .dialog__title .dialog__body .dialog__actions`、`.toast-region .toast`、`.menu .menu__group .menu__item .menu__item.is-disabled .menu__shortcut`；尺寸按 `editor/docs/prototype/README.md`「弹层」段（对话框宽 460、菜单 min-width 200、toast 底部 36px）。
3. `index.html` 标题 `LumioConfig`。
4. `no-hardcoded-colors.test.ts`：遍历 `editor/src/panels/**` 与 `editor/src/components/**` 源文件，断言不匹配 `/#[0-9a-fA-F]{3,8}\b|rgba?\(/`；`editor/src/spreadsheet/projection.ts` 不在扫描范围。

**测试**：`pnpm vitest run tests/no-hardcoded-colors.test.ts tests/Button.test.tsx tests/Panel.test.tsx tests/DataTable.test.tsx`（既有原语随令牌改值后仍通过）。

**验收对应**：R-00379 S01。

## Task 6 · B2 contract-phaseview-copy-failkind（阵列 B · M6-G · T0）

**目标**：状态机到界面的派生层与文案表，取代 `hint` 子串判断。

**独占文件**：`editor/src/app/phaseView.ts`（新）、`editor/src/app/copy.ts`（新）、`editor/src/app/state.ts`、`editor/src/api/types.ts`、`editor/tests/state.test.ts`、`editor/tests/phaseView.test.ts`（新）、`editor/tests/copy.test.ts`（新）。

**Produces（签名逐字）**：

- `api/types.ts`：`EditorState` 增 `failKind: 'VCS' | 'SCHEMA_CHANGED' | 'DRAFT_VERSION_CONFLICT' | ''`；`EditorPhase` 11 值不变。
- `state.ts`：`failed` 类动作携带 `failKind`（`VCS_COMMIT_FAILED` / `EXPORT_FAILED` → `'VCS'`；`schemaChanged` → `'SCHEMA_CHANGED'`；409 → `'DRAFT_VERSION_CONFLICT'`）；`canRefreshOnly(state)` 改为 `state.phase === 'Failed' && (failKind === 'SCHEMA_CHANGED' || failKind === 'DRAFT_VERSION_CONFLICT')`；`canValidate` 增 `state.dirtyCount > 0`（ADR 0005）。`hint` 字段保留（App.tsx 的产生点由主 loop 接线时归类）。
- `phaseView(state: EditorState): { label: string; tone: 'gray'|'green'|'amber'|'blue'|'purple'|'red'; spin: boolean; banner?: { text: string; actions: Array<{ label: string; action: 'refresh'|'resolve'|'cancel'|'retry'|'details'|'ack' }> }; gridLocked: boolean; can: { edit: boolean; validate: boolean; submit: boolean; export: boolean } }`，逐行等于设计稿 §5 表（含 `failKind` 三分支与 `online === false` 派生态覆盖任何阶段）。
- `copy.ts`：`export const COPY = { ... } as const`，键名英文、值中文，覆盖设计稿 §12 全部文案 + §5 横幅文案 + 抽屉空态文案；带参数的用函数（如 `dirty(n)`、`submitConfirm(n, branch, sha, table, summary, autoCommit, autoExport)`）。

**测试**：`state.test.ts` 覆盖 11 阶段 × `canEdit / canValidate / canSubmit / canRefreshOnly`；`phaseView.test.ts` 逐阶段断言 label / tone / gridLocked / can / banner；`copy.test.ts` 遍历 `COPY` 全部字符串（含函数取样输出）断言不匹配 `/Ready(Clean|Dirty|ToSubmit)|Submitting|Validating|Stale|Conflicted|autoCommit|autoExport|local\.json|sha256:/`。

**验收对应**：R-00379 S02。

## Task 7 · B3 contract-ui-primitives（阵列 B · M6-G · T0）

**目标**：在既有 `components/ui/{Button,Panel,DataTable}` 旁扩展四个原语与热键钩子。

**独占文件**：`editor/src/components/ui/{Tabs,Dialog,Toast,Menu}.tsx`（新）、`components/ui/useHotkeys.ts`（新）、`components/ui/Button.tsx`、`components/ui/index.ts`、`editor/tests/{Tabs,Dialog,Toast,Menu,useHotkeys}.test.tsx`（新）。

**Consumes**：Task 5 的类名契约（并行开发时先按契约写类名，合入后样式自然接上）。

**Produces（签名逐字）**：`Tabs({ items: Array<{ id: string; label: string; count?: number; tone?: 'danger'|'conflict' }>; active: string; onChange(id: string): void })`（`role=tablist/tab`，←→ 切换）；`Dialog({ open: boolean; title: string; onClose(): void; children; actions?: ReactNode })`（`role=dialog aria-modal`，焦点陷阱 Tab 环，Esc 关闭，打开时焦点进对话框，关闭后焦点还原）；`ToastProvider` + `useToast(): (text: string) => void`（`role=status`，2600ms 自动消失，同时最多 3 条）；`Menu({ items: Array<{ id: string; label: string; shortcut?: string; disabled?: boolean; disabledReason?: string; group?: string; onSelect(): void }>; anchor: { x: number; y: number }; open: boolean; onClose(): void })`（`role=menu`，↑↓ Enter Esc，视口边缘夹紧）；`useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, opts?: { enabled?: boolean })`，键名形如 `'Ctrl+Enter'`、`'Ctrl+Shift+Enter'`、`'Escape'`；事件目标在 `input / textarea / [contenteditable]` 或 Univer 编辑器内时不处理（不吞 Univer 键盘事件）；`Button` 增 `disabledReason?: string`（渲染为 `title`，并 `aria-disabled`）。全部从 `index.ts` 导出。

**测试**：照 `tests/Button.test.tsx` 写法（`react-dom/client` + `act`，不引 testing-library）：Dialog 焦点管理 / Esc / Tab 环；Toast 出现与定时消失（`vi.useFakeTimers`）；Menu 键盘导航与 disabled 项 `title`；Tabs 箭头切换；useHotkeys 组合键匹配与输入框内忽略。只跑这五个文件 + `Button.test.tsx`。

**验收对应**：R-00379 S03。

## Task 8 · C1 host-vcs-log-show（阵列 C · M6-K · T0）

**目标**：`VcsAdapter` 增历史读取能力，白名单收紧。

**独占文件**：`src/lumio_config/editor/vcs.py`、`tests/test_editor_vcs.py`（新）。

**Produces（签名逐字）**：`ALLOWED_COMMANDS` 增 `("git", "log")`、`("git", "show")`；`@dataclass HistoryRevision(id: str, message: str, time: str, author: str)`（`time` 为 ISO 8601）；`VcsAdapter` 协议增 `log(paths: list[str], since: str | None, limit: int) -> list[HistoryRevision]` 与 `show(revision: str, path: str) -> str`；`GitAdapter.log` 用 `git log --format=<固定分隔格式> -n <limit> [<since>..HEAD] -- <paths>`（`since` 不存在于仓库 → `[]`，不抛）；`GitAdapter.show` 用 `git show <revision>:<path>`（不存在 → `""`）；`SvnAdapter` / `NoneAdapter` 分别返回 `[]` / `""`。仍只接受 argv 列表、`shell=False`、`cwd=root`。

**测试**：临时 git 仓两次提交 `tables/skills.txt` → `log` 顺序、字段、`since` 截断、`limit`；`show` 取旧修订内容；`since` 为不存在 sha → `[]`；`run_vcs(["git","rebase"])` 抛 `ValueError`；svn / none 桩返回空。只跑 `python3.11 -m unittest tests.test_editor_vcs -v`。

**验收对应**：R-00383 S01 白名单部分。

## Task 9 · C2 host-history-endpoint（阵列 C · M6-K · T1，Task 8 合入后）

**目标**：`GET /api/tables/{table}/history` 与 `capabilities.history`。

**独占文件**：`src/lumio_config/editor/history.py`（新）、`src/lumio_config/editor/server.py`、`src/lumio_config/editor/session.py`、`tests/test_editor_history.py`（新）。

**Consumes**：Task 8 的 `HistoryRevision` / `log` / `show`；`validate.load_sources`；`server.register` / `_authorize_api`；`Session.table_projection`。

**Produces（逐字）**：`history.table_history(session, table: str, since: str | None, limit: int) -> list[dict]`，每项 `{ revision, message, time, author, cells: [{ row, rowId, column, from, to }], created: [rowId], deleted: [rowId], schemaChanged: bool }`；实现：对每个修订 `r` 与其父修订，用 `show` 取 `tables/<t>.txt` 与 `schemas/<t>.json` 到临时目录，`load_sources` 解析（不复制解析逻辑），按稳定 `id` 逐格比对源 token 文本；改名行按 id 定位；Schema 指纹在该修订变化 → `schemaChanged: True` 且 `cells` 为空。端点 `GET /api/tables/{table}/history?since=<revisionId>&limit=20`（`limit` 上限 100，非法 → 422 风格的既有错误包）→ `{ "items": [...] }`；未知表 → 404 `UNKNOWN_TABLE`；`vcs=svn/none` → `{ "items": [] }`；`/api/session` 的 `capabilities` 增 `history: bool`（仅 git 为 true）。

**测试**：临时 git 仓 + `serve` 测试夹具（照 `tests/test_editor_server.py`）：两次 `patch apply`（改格 / 新增行 / 删行 / 改名）→ 端点逐格断言；`since` 不存在 → 空；svn / none → 空且 `capabilities.history=false`；改 schema 的提交 → `schemaChanged`。只跑 `python3.11 -m unittest tests.test_editor_history -v`。

**验收对应**：R-00383 S01、S02。

## Task 10 · B4 contract-univer-surface（阵列 B · M6-G · T1，Task 1 合入后）

**目标**：Univer 表面裁剪与四态注入原生右键（ADR 0004、设计稿 §3）。

**独占文件**：`editor/src/spreadsheet/univer.ts`、`spreadsheet/menus.ts`（新）、`spreadsheet/commands.ts`（新）、`spreadsheet/interceptors.ts`（**仅**把 `COMMAND` 常量移到 `commands.ts` 并从那里 re-export，其余逻辑不动）、`editor/docs/univer-surface.md`（新）、`editor/tests/e2e/sheet-ops.spec.ts`、`editor/tests/e2e/four-state.spec.ts`。

**做什么**：

1. 先在 `editor/node_modules/@univerjs/preset-sheets-core` 类型定义核实 `UniverSheetsCorePreset` 的 `toolbar / formulaBar / footer / contextMenu / menu` 真实签名（现状 `footer` 是对象 `{ sheetBar, statisticBar, menus, zoomSlider }`），写进 `univer-surface.md`（含 d.ts 路径）。
2. `toolbar: false`；`footer` 全关或只留 `statisticBar`；`menu` 隐藏表覆盖设计稿 §3 全部禁止项（字体 / 字号 / 加粗 / 斜体 / 下划线 / 删除线 / 字色 / 填充 / 边框 / 对齐 / 换行 / 数字格式 / 合并 / 插列 / 删列 / 函数 / 图表 / 透视 / 超链接 / 批注 / 图片 / 条件格式）；无法经 `menu` 隐藏的写 CSS 兜底 `[data-u-comp="…"]{display:none}` 并在文档记风险。
3. `commands.ts`：`export const COMMAND` 白名单 id（undo / redo / find / filter / sort / freeze / insertRow / deleteRow / copyRow / zoom / cut / copy / paste + 拦截器现有 id），每项注释来源 d.ts。
4. `menus.ts`：`registerFourStateMenu(univerAPI, handlers: { empty(): void; null(): void; default(): void; missing(): void })`，用 `IMenuManagerService`（或 preset 暴露的钩子，以核实为准）在主区右键追加「单元格」分组四项，菜单项 `data-testid=four-state-{empty|null|default|missing}`，不可用项禁用并给 title（「必填列不能设为缺列」「这一列没有默认值」）。`createUniver(container, options?: { fourState?: FourStateHandlers })` 增可选参数；App.tsx 传参由主 loop 接线。
5. E2E：`sheet-ops.spec.ts` 增「工具栏 / 右键 / 快捷键三处找不到字体 / 加粗 / 颜色 / 合并 / 公式栏 / 插列」；`four-state.spec.ts` 改为经原生右键 `four-state-*` 触发（在主 loop 接线前该用例 `test.skip` 并注明，接线后去掉）。

**测试**：`pnpm vitest run tests/interceptors.test.ts`（COMMAND 抽出后仍绿）+ 上述两 spec（可跑的部分）。

**验收对应**：R-00379 S04。

## Task 11 · D1 shell-topbar-banner-statusbar（阵列 D · M6-H · T2）

**目标**：顶栏、横幅、状态条（设计稿 §2、§5，原型 README「顶栏 / 横幅 / 状态条」尺寸）。

**独占文件**：`editor/src/panels/TopBar.tsx`（新）、`panels/Banner.tsx`（新）、`panels/StatusBar.tsx`（重写）、`editor/tests/e2e/host-drafts.spec.ts`、`editor/tests/{TopBar,Banner,StatusBar}.test.tsx`（新）。

**Consumes**：Task 6 `phaseView` / `COPY`；Task 7 `Button.disabledReason` / `useToast`；Task 5 令牌。

**Produces（props 逐字）**：`TopBar({ tableName: string; revision: { vcs: string; id: string; branch: string | null } | null; view: PhaseView; dirtyCount: number; inspectorOpen: boolean; onToggleSidebar(): void; onOpenPalette(): void; onExport(): void; onValidate(): void; onSubmit(): void; onOpenSettings(): void; onOpenShortcuts(): void; onToggleInspector(): void })`：修订显示 git → `分支 · 短 sha(7)`，svn → `r<id>`，none → 不显示，`title` 全 sha；状态胶囊 `data-testid=status-phase`、`title` 与 `data-phase` 为英文阶段名；按钮 testid `btn-export-top btn-validate btn-submit`，禁用走 `disabledReason`。`Banner({ banner: PhaseView['banner'] | undefined; onAction(action: string): void })`，`data-testid=banner`，Failed·DRAFT_VERSION_CONFLICT / SCHEMA_CHANGED 的按钮带 `data-testid=draft-refresh`。`StatusBar({ tableName; rowCount; draftVersion; dirtyCount; uncommittedMerges: number; fingerprint: string; online: boolean; liveText: string; onOpenPatchTab(): void })`：指纹 8 位、title 全文、点击复制 + toast；`status-*` testid 保留；`status-hint` 改为视觉隐藏的 `aria-live="polite"` 区渲染 `liveText`。

**测试**：三个组件单测（阶段 → 文案 / 按钮态；svn / none 修订退化；指纹复制调用 `navigator.clipboard`）。`host-drafts.spec.ts`：「标签页」断言改为 `banner` 或 `status-hint` live region 均可，`draft-refresh` 仍可点。worker 的 E2E 在 worktree 里因 `App.tsx` 未接线可能跑不通，注明即可，主 loop 接线后跑。

**验收对应**：R-00380 S02。

## Task 12 · D2 shell-tablelist-toolbar（阵列 D · M6-H · T2）

**目标**：表列表重写与自建表格工具栏（设计稿 §10、原型 README「表列表 / 表格区工具栏」）。

**独占文件**：`editor/src/panels/TableList.tsx`（重写）、`panels/GridToolbar.tsx`（新）、`editor/tests/{TableList,GridToolbar}.test.tsx`（新）。

**Consumes**：Task 10 `commands.COMMAND`；Task 7 `useToast` / `Button`；Task 6 `COPY`。

**Produces（逐字）**：`TableList({ tables: Array<{ name: string; rowCount: number; dirtyCount: number; conflictCount: number }>; active: string; collapsed: boolean; onSelect(name: string): void; onToggleCollapse(): void })`：搜索框、行数、脏格徽标（琥珀）、冲突徽标（紫）、折叠 44px 首字母栏（脏点保留）、`table-<name>` testid 保留；首次打开 toast「草稿会自动保存在本机，提交前不会写进仓库」，键 `localStorage['lumio-config-editor:onboarded']`。`GridToolbar({ univerAPI: FUniver | null; columnCount: number; canEdit: boolean })`：撤销 · 重做 │ 查找 │ 筛选 · 排序 · 冻结 │ 新增行 · 复制行 · 删除行 │ 缩放，全部 `univerAPI.executeCommand(COMMAND.x)`；右侧「N 列 · 排序 / 筛选只影响视图」；`canEdit=false` 时编辑类按钮禁用并给原因。

**测试**：TableList 过滤 / 徽标 / 折叠 / onboarding 只 toast 一次；GridToolbar 每个按钮调用对应 COMMAND id（用假 `univerAPI` 记录调用）。

**验收对应**：R-00380 S01（侧栏）、S02（工具栏）。

## Task 13 · D3 grid-visuals-inspector（阵列 D · M6-H · T2，且 ADR 0008 已合入）

**目标**：投影视觉（脏格 / 新行 / 删除行 / 只读 / 无效 / 四态按 ADR 0008 / 两行列头 / 空行策略）与只读检查器（设计稿 §6、§7）。

**独占文件**：`editor/src/spreadsheet/{projection,cellMeta,viewState}.ts`、`panels/Inspector.tsx`（新）、`editor/tests/projection.roundtrip.test.ts`、`editor/tests/Inspector.test.tsx`（新）、`editor/tests/e2e/layout.spec.ts`（新）。

**Consumes**：ADR 0008；Task 2 后的 `projection.ts` / `cellMeta.ts`；Task 6 `COPY`；Task 7 `Button` / `useHotkeys`；Task 5 令牌值（`STYLES` 色值与 §4 表一致并注释）。

**Produces（逐字）**：`projection.ts`：`STYLES` 改为语义色；脏格 `custom.lumio.dirty = true` + 底色 + 右上三角（三角实现按 ADR 0008 路线）；新行整行底 + 行号「新」+ `id` 格「合入时发号」；删除行删除线 + 淡红底；只读列底；无效格红波浪 + `!`；`rowCount = rows + 3`，空行不写 `dataValidation`，首空行占位「在此输入名称新增一行…」只在渲染层；列头两行（`name *` + 只读锁 / `类型 · 可见性`，`title` 给默认值、范围、描述）。`cellMeta.invalidReason(column, token, remoteErrors: ValidationError[]): { code: string; message: string; suggestion?: string } | null`（本地：必填缺列 / 类型 / 范围 / 枚举；远端预检错误覆盖）。`viewState` 增 `inspectorOpen: boolean`、`sidebarCollapsed: boolean`。`Inspector({ open: boolean; selection: { row: number; column: string } | null; meta: CellMeta | null; onFourState(kind: 'empty'|'null'|'default'|'missing'): void; onRevert(): void; onDeleteRow(): void; onUndeleteRow(): void; onGoToConflicts(): void; onClose(): void })`：内容顺序按设计稿 §7；四态四键 testid `four-state-*` + `data-source="inspector"`；`inspector cell-baseline invalid-reason` testid；不改值。

**测试**：roundtrip 单测：脏格标记、占位文案、删除行、四态写入均不污染 token；`Inspector.test.tsx`：无效原因块、基线 → 当前、四态键禁用原因、Delete 规则文案。`layout.spec.ts`：1440×900 与 1280×720 量 `univer-root` 高度 / 主区高度 ≥ 0.75；检查器默认收起、选格展开、`Ctrl+M`（或 ADR / `univer-surface.md` 核定的键）收起、刷新后记忆；14 个状态（经 `__lumioPoc` 注入 phase）各有胶囊文案且阻断态有 `banner`。E2E 在主 loop 接线后跑。

**验收对应**：R-00380 S01（高度 / 检查器）、S03、S04。

## Task 14 · E1 drawer-shell-patchtab（阵列 E · M6-I · T3）

**目标**：抽屉壳与补丁页签（设计稿 §8「补丁」，原型 README「抽屉」）。

**独占文件**：`editor/src/panels/drawer/Drawer.tsx`（新）、`panels/drawer/PatchTab.tsx`（新）、`editor/tests/{Drawer,PatchTab}.test.tsx`（新）、`editor/tests/e2e/host-submit.spec.ts`。**不删 `DiffPreview.tsx`**（主 loop 接线时删）。

**Consumes**：Task 7 `Tabs` / `useHotkeys`；Task 6 `COPY`；`api/types.ts` 的 apply 响应 `result.{sourceFingerprint,assignedIds,vcs,export}`；`extract.buildPatch` 的 `Patch` 形状。

**Produces（逐字）**：`Drawer({ tabs: Array<{ id: 'patch'|'errors'|'conflicts'|'export'|'diff'; label: string; count?: number; tone?: 'danger'|'conflict' }>; active: string; open: boolean; onSelect(id): void; onToggle(): void; children })`：收起 30px / 展开 240px，`Ctrl+J` 切换，Esc 先关弹层再收抽屉，高度不做过渡，`data-testid=panel`、`tab-<id>`；开合与页签记 `viewState`。`PatchTab({ patch: Patch; summary: string; target: { branch: string | null; sha: string; autoCommit: boolean; autoExport: boolean }; result: SubmitResult | null; onJump(row: number, column: string): void })`：目标行 `diff-target`、摘要 `diff-summary`；按行分组，`更新 / 新增 / 改名 / 删除` 色标；`update` 逐列 `expect → set`；点击跳格；空态「还没有改动。改格子后这里会列出将要提交的内容。」；结果卡 `submit-result`（新指纹 8 位、`assignedIds`、`result.vcs.{action,id,branch}`、`result.export.{outDir,files}`）。

**测试**：单测分组 / 空态 / 结果卡 / 跳格回调；`host-submit.spec.ts` 增 `submit-result` 断言。

**验收对应**：R-00381 S01。

## Task 15 · E2 drawer-error-conflict（阵列 E · M6-I · T3）

**目标**：错误页签（`onJump` 真正接线）与冲突页签（无 `window.prompt`）。设计稿 §8「错误」「冲突」，0-8 §4。

**独占文件**：`editor/src/panels/drawer/ErrorTab.tsx`（新）、`panels/drawer/ConflictTab.tsx`（新）、`editor/tests/{ErrorTab,ConflictTab}.test.tsx`（新）、`editor/tests/e2e/host-rebase.spec.ts`。**不删 `ErrorPanel.tsx` / `ConflictPanel.tsx`**。

**Consumes**：Task 7 `Button` / `Dialog`；Task 6 `COPY`；`api/types.ts` 的冲突对象（`rowId / name / column / base / current / draft`、`DELETED_ROW_CONFLICT`）；现有 `ConflictPanel.tsx` 的解决回调形状（沿用，去掉 `window.prompt`）。

**Produces（逐字）**：`ErrorTab({ errors: ValidationError[]; state: 'no-changes'|'not-validated'|'clean'|'errors'; onJump(row, column): void })`：按表 / 行分组红头卡，每项 `列 · message · 建议 · code`，点击 `onJump`；三种空态文案来自 `COPY`。`ConflictTab({ conflicts: Conflict[]; resolved: Record<string, Resolution>; onResolve(key: string, r: Resolution): void; onResubmit(): void; onCancel(): void })`，`Resolution = { kind: 'repo'|'mine'|'input'|'default'|'null'|'drop'; value?: string }`：进度「已解决 N / M」+ 进度条；每卡三列「打开时 / 仓库当前 / 我的草稿」+ radio 组（采仓库值 / 采我的值 / 手工输入（内联输入框，Enter 确认）/ 恢复默认 / 设为 ∅）；`DELETED_ROW_CONFLICT` 只有「放弃我的改动」；底部「取消本次提交」「重新预检并提交」（全部解决后可用）；testid 保留 `conflict-panel conflict-mine conflict-warehouse conflict-input conflict-default conflict-null conflict-drop conflict-cancel`，新增 `conflict-resubmit`；点卡跳格。

**测试**：单测：分组、空态、进度、radio 单选即回调、内联输入 Enter、DELETED_ROW 只两项、全部解决前 resubmit 禁用；`git grep -n "window.prompt" editor/src` 在本卡文件内为空。`host-rebase.spec.ts`：冲突用例经新页签通过，「打开时 / 120 / 140 / 133」断言不改，增「全部解决 → resubmit → 仓库含双方改动」。

**验收对应**：R-00381 S02、S03。

## Task 16 · E3 drawer-export-settings-seen（阵列 E · M6-I · T3）

**目标**：导出页签、设置对话框、「自上次打开以来这张表已变化」横幅（设计稿 §8「导出」、§8 末段、§12）。

**独占文件**：`editor/src/panels/drawer/ExportTab.tsx`（新）、`panels/SettingsDialog.tsx`（新）、`editor/src/spreadsheet/viewState.ts`、`editor/tests/viewState.test.ts`、`editor/tests/{ExportTab,SettingsDialog}.test.tsx`（新）、`editor/tests/e2e/host-export.spec.ts`。**不删 `ExportPanel.tsx` / `SettingsPanel.tsx`**。

**Consumes**：Task 7 `Dialog` / `useToast`；Task 6 `COPY`；`api/client.ts` 的 export / settings 调用；Task 13 后的 `viewState.ts`（本卡在其后串行，增 `seen`）。

**Produces（逐字）**：`ExportTab({ tables: string[]; onExport(req: { tables: string[]; format: 'csv'|'tsv'; source: 'repo'|'draft'; targets?: Array<'S'|'C'|'V'> }): Promise<ExportResult>; })`：testid 保留 `btn-export export-format export-source export-target export-link`，文件列表含 README.txt。`SettingsDialog({ open; settings: { autoCommit: boolean; autoExport: boolean }; onChange(next): Promise<void>; onClose(): void })`：两项「提交后自动 commit 到当前分支」「提交后自动导表」，toast「已保存到本机设置」，`setting-autocommit` 保留；界面 grep 不到 `autoCommit` / `local.json`。`viewState`：`readSeen(repo, table): { revisionId: string; fingerprint: string } | null`、`writeSeen(repo, table, v)`，键 `lumio-config-editor:seen:<repo>:<table>`；打开表时不同 → `Banner`「自你上次打开以来这张表已变化」[知道了]（`ack` 写 seen），横幅文案进 `COPY`（若 Task 6 未含则在本卡报 `DONE_WITH_CONCERNS` 让主 loop 补）。

**测试**：单测：导出请求形状、设置切换与 toast、`seen` 读写与首次打开不出横幅；`host-export.spec.ts` 经抽屉页签导出并下载 `export-link`。

**验收对应**：R-00381 S04。

## Task 17 · F1 palette-hotkeys-confirm（阵列 F · M6-J · T4）

**目标**：命令面板、快捷键全量接线、提交确认、快捷键对话框（设计稿 §11、§12，ADR 0005）。

**独占文件**：`editor/src/panels/CommandPalette.tsx`（新）、`panels/SubmitConfirm.tsx`（新）、`panels/ShortcutsDialog.tsx`（新）、`components/ui/useHotkeys.ts`（全量键表常量 `HOTKEYS` 与 mac 修饰键映射）、`editor/tests/{CommandPalette,SubmitConfirm}.test.tsx`（新）、`editor/tests/e2e/keyboard-journeys.spec.ts`（新）。

**Consumes**：Task 7 `Dialog` / `useHotkeys`；Task 6 `COPY.submitConfirm`；Task 10 `univer-surface.md` 核定的检查器键与 Univer 内置键表；Task 14 `Drawer`；Task 16 `SettingsDialog`。

**Produces（逐字）**：`HOTKEYS`：`Ctrl+S` 保存草稿、`Ctrl+Enter` 预检、`Ctrl+Shift+Enter` 提交、`Ctrl+K` 命令面板、`Ctrl+B` 折叠表列表、`Ctrl+J` 抽屉、检查器键（按核定值，避开 `Ctrl+Shift+I` / `Ctrl+Shift+J`；macOS 下 `Ctrl` 就是 Control，不映射到 Cmd）、`F2` 编辑格、`Shift+F10` 右键、`Escape`；`CommandPalette({ open; commands: Array<{ group: string; label: string; shortcut?: string; run(): void }>; onClose(): void })`：宽 480、顶部 80px、模糊匹配、↑↓ Enter Esc、`data-testid=command-palette`、`role=dialog` + `aria-activedescendant`；条目：打开 <表>×N、预检、提交补丁、保存本地草稿、导出、新增行、查找 / 替换、折叠表列表、打开补丁预览、快捷键、设置。`SubmitConfirm({ open; text: string; onConfirm(): void; onCancel(): void })`：仅 `autoCommit || autoExport` 时由主 loop 打开，Enter 确认。`ShortcutsDialog({ open; onClose })` 列 `HOTKEYS`。

**测试**：单测：面板过滤 / 键盘导航 / 执行；确认框 Enter；`keyboard-journeys.spec.ts`：J2 只用键盘 `Ctrl+K` 切表 → 输入 → `Ctrl+Enter` → `Ctrl+Shift+Enter` → `Enter` → `submit-result` 可见；J4 冲突卡 Tab 可达；J5 导出键盘可达；`autoCommit=false && autoExport=false` 时不弹确认。

**验收对应**：R-00382 S01、S02。

## Task 18 · F2 blocked-empty-a11y（阵列 F · M6-J · T4）

**目标**：整页阻断页、可访问性检查与设计验收清单。

**独占文件**：`editor/src/panels/Blocked.tsx`（新）、`editor/docs/a11y-checklist.md`（新）、`editor/package.json` 与 `pnpm-lock.yaml`（仅增 devDependency `@axe-core/playwright`，版本锁死）、`editor/tests/e2e/a11y.spec.ts`（新）、`editor/tests/Blocked.test.tsx`（新）。

**Consumes**：Task 6 `phaseView`（`Closed` / `online=false`）与 `COPY`；Task 7 `Dialog`。

**Produces**：`Blocked({ kind: 'offline'|'closed'; onRetry?(): void })`：`rgba(246,247,249,.92)` 覆盖 + 420px 卡片两步重连指引（回终端重新 `serve`、打开终端打印的新链接）。`a11y-checklist.md`：焦点环、菜单 / 抽屉 / 对话框 ARIA 与焦点管理、对比度 ≥ 4.5:1、灰度下七种标记可辨；把 `editor/docs/prototype/README.md` 未涵盖的设计验收清单（原 handoff §4.3 十一条：表格 ≥ 75%、三处不可见禁止项、14 态胶囊与横幅、J1–J5 键盘、冲突无 prompt、错误跳格、七种标记灰度可辨、界面无英文阶段名、确认只在副作用时、导出在顶栏、指纹 8 位）逐条列出待 Task 20 勾选。`a11y.spec.ts`：默认态、抽屉展开态、冲突态各扫一次，无 serious 以上问题；若 `@axe-core/playwright` 装不上或 Chromium 受阻，写明原因，清单改为人工逐条并在报告注明。

**测试**：`Blocked.test.tsx`；`a11y.spec.ts`。

**验收对应**：R-00382 S03。

## Task 19 · C3 history-frontend（阵列 C · M6-K · T4，Task 9 与 E 合入后）

**目标**：「改动」页签（设计稿 §8「改动」）。

**独占文件**：`editor/src/api/types.ts`、`editor/src/api/client.ts`、`editor/src/panels/drawer/DiffTab.tsx`（新）、`editor/tests/DiffTab.test.tsx`（新）、`editor/tests/e2e/host-history.spec.ts`（新）。

**Consumes**：Task 9 端点与 `capabilities.history`；Task 14 `Drawer.tabs`（加 `diff`）；Task 16 `viewState.readSeen`；`PatchTab` 的分组与 `onJump` 模式；`ProjectionMap.baseCells`（「仅我的未提交改动」来源）。

**Produces（逐字）**：`types.ts` 增 `HistoryEntry { revision: string; message: string; time: string; author: string; cells: Array<{ row: number; rowId: string; column: string; from: string; to: string }>; created: string[]; deleted: string[]; schemaChanged: boolean }` 与 `SessionInfo.capabilities.history: boolean`；`client.history(table: string, since?: string, limit = 20): Promise<{ items: HistoryEntry[] }>`。`DiffTab({ enabled: boolean; mine: MyChange[]; history: HistoryEntry[]; basis: 'last-seen'|'revision'|'mine-only'; onBasisChange; mark: boolean; onMarkChange; onJump(row, column): void })`：对比基准下拉（上次打开 / 某修订之前 / 仅我的未提交改动）、我的（琥珀）/ AI（靛蓝，`rev · message · 时间`）分组、每行 `行 · 列 · from → to` 点击跳格、「在表格中标记」开关；`enabled=false`（无 history 能力）时不渲染页签。

**测试**：单测分组 / 基准切换 / 跳格；`host-history.spec.ts`：编辑器开着 → CLI `patch apply` 两次 → 重新打开 → 改动页签列出两次修订与格级差异并可跳格；svn / none 桩下页签不出现。

**验收对应**：R-00383 S03、S04。

## Task 20 · F3 docs-and-static（主 loop 自做 · M6-J / M6-K · T5，串行最后）

**目标**：用户文档、生成物重建、截图、设计验收清单勾选。

**文件**：`docs/reference/editor.md`（含 M6-K「改动」页签段与快捷键表、错误码）、`src/lumio_config/editor_static/`（`cd editor && pnpm build` 重建并提交）、`editor/docs/screens/*.png`（1440×900 与 1280×720 默认态、抽屉展开、冲突态各一张，Playwright 截）、`editor/docs/a11y-checklist.md`（逐条勾选）。

**做什么**：全量收口门槛（§6）全绿 → `git diff --exit-code -- src/lumio_config/editor_static` 非空即为本次重建 → 提交；对照 `a11y-checklist.md` 在真实 Host（`serve` 干净仓库）上逐条勾；M6-J 与 M6-K 各出一份 §8 交回物。

**验收对应**：R-00382 S04；R-00383 文档段。

## Task 0 · 文件结束标记（无内容）

（本节只为让 `task-brief` 在 Task 20 处正确截断，不含任务。）

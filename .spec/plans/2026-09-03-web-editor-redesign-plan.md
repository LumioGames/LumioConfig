---
status: pending
---

# 网页编辑器重设计 v3 · 实现计划

设计：`.spec/knowledge/features/web-editor-ux.md`（`status: 设计中`）。取舍：`.spec/decisions/0003`–`0007`。原型：`editor/docs/prototype/`。Workflow 需求卡：RM-00009 的 M6-F～M6-K（蓝图标记 `workflow-plan:lumioconfig-m6-editor-ux-20260903/r1/<卡>`）。

约束：不改 0-7 / 0-8；不加运行时依赖；不引 `@univerjs-pro/*`；CSP 下不引外链；Host 只在 M6-K 改；每张 Workflow 卡在仓内按 `writing-plans` 再拆成文件集互斥的任务卡并行扇出；`App.tsx` 不进 worker 卡，每 wave 合入时由主 loop 接线；每卡只跑覆盖本卡的测试，统一合入后跑全量：

```bash
cd editor && pnpm lint && pnpm test && pnpm build && pnpm e2e
git diff --exit-code -- src/lumio_config/editor_static
/usr/local/bin/python3.11 -m unittest discover -s tests -v
/usr/local/bin/python3.11 tools/lumio_config.py validate
/usr/local/bin/python3.11 tools/lumio_config.py format --check
git diff --check
```

外加 `/lumio:lint`。交回物按仓库「交回物格式」。

## 卡序与依赖

```text
M6-F 修复 ──▶ M6-G 契约层 ──▶ M6-H 壳与表格区 ──▶ M6-I 抽屉 ──▶ M6-J 键盘与收口
                                  └──（并行，文件集不重叠）── M6-K Host 历史接口 ──▶（前端页签部分依赖 M6-I）
```

## M6-F · 修复编辑路径退回项、invalid 守卫与四态呈现 spike

依据：`docs/reviews/2026-09-03-editor-core-edit-path-adversarial-review.md`（R-00361 退回，P1-1 / P1-2 / P2-1 / P2-2）。

- 独占文件：`editor/src/spreadsheet/{interceptors,editors,projection,cellMeta}.ts`、`editor/src/app/App.tsx`（仅 `canEdit` 安装时序）、`editor/tests/{interceptors,projection.roundtrip}.test.ts`、`editor/tests/e2e/keyboard.spec.ts`（新）、`editor/docs/four-state-render-spike.md`（新）、`.spec/decisions/0008-*.md`（spike 结论）、`.spec/knowledge/lessons.md`。
- 做什么：
  - `interceptors.ts`：`attachLumioFromEdit` 见 `v` 变化即转 `value`（不再因 `existing.state !== "value"` 保留旧 token）；CLEAR 命令无 `range` 时取当前选区；required 无默认列 Delete 保持原值并提示（0-7 §5）。
  - `projection.ts` / `fourState`：四态写入显式 `v: null`，画布不再显示旧值。
  - `editors.ts`：`numberOutOfRange` 只对 `NUMBER_TYPES` 列生效。
  - `App.tsx`：`installInterceptors` 在 `dispatch({type:"open"})` 之后或 `canEdit` 直接读 reducer 快照，消除启动残留 hint。
  - spike：在 `node_modules/@univerjs/*` 类型定义里核实 0.25.1 自定义单元格渲染入口；写最小 demo（不入生产代码）证明能否不改 `v` 画徽标；结论 + 截图 + API 路径写 `four-state-render-spike.md`，采用方案写 ADR 0008。
  - E2E：`keyboard.spec.ts` 用 `page.keyboard` 真实键盘，跑在 `LUMIO_EDITOR_DIST` 静态产物 + `serve` 上，至少：四态格键入覆写、required 无默认 Delete、有默认 Delete、可选无默认 Delete。
- 接口：Produces `extractTokens` 语义不变；`numberOutOfRange(column, raw)` 签名不变但 string 列恒 `false`。
- 验收：见 Workflow 卡 M6-F 四条。
- 测试分级：大任务，TDD。

## M6-G · 重设计契约层

- 独占文件（可拆 4 张互斥任务卡并行）：
  1. 令牌与壳样式：`editor/src/styles/{tokens,ui,app}.css`、`editor/index.html`。
  2. 状态映射与文案：`editor/src/app/{phaseView,copy}.ts`、`app/state.ts`、`api/types.ts`（`EditorState.failKind`）、`tests/{state,phaseView,copy}.test.ts`。
  3. UI 原语扩展：`editor/src/components/ui/{Tabs,Dialog,Toast,Menu}.tsx`、`components/ui/useHotkeys.ts`、`components/ui/index.ts`、`tests/ui.test.tsx`。
  4. Univer 表面：`editor/src/spreadsheet/{univer,menus,commands}.ts`、`spreadsheet/interceptors.ts`（仅把 `COMMAND` 抽到 `commands.ts` 并 re-export）、`editor/docs/univer-surface.md`、`tests/e2e/{sheet-ops,four-state}.spec.ts`。
- 接口（Produces，下游卡只消费）：
  - `phaseView(state: EditorState): { label: string; tone: 'gray'|'green'|'amber'|'blue'|'purple'|'red'; spin: boolean; banner?: { text: string; actions: Array<{ label: string; action: 'refresh'|'resolve'|'cancel'|'retry'|'details'|'ack' }> }; gridLocked: boolean; can: { edit: boolean; validate: boolean; submit: boolean; export: boolean } }`。
  - `copy`：`export const COPY = { … } as const`，键名英文、值中文；`copy.test.ts` 正则守卫 `/Ready(Clean|Dirty|ToSubmit)|Submitting|Validating|Stale|Conflicted|autoCommit|autoExport|local\.json|sha256:/`。
  - `EditorState.failKind: 'VCS'|'SCHEMA_CHANGED'|'DRAFT_VERSION_CONFLICT'|''`；`canValidate` 增 `dirtyCount > 0`；`canRefreshOnly` 改读 `failKind`。
  - `Tabs({ items, active, onChange })`、`Dialog({ open, title, onClose, children })`（焦点陷阱 + Esc）、`Toast` provider + `useToast()`（`role=status`）、`Menu({ items, anchor, onClose })`、`useHotkeys(map)`；`Button` 增 `disabledReason?: string`（渲染为 `title`）。
  - `commands.ts`：`export const COMMAND` 白名单 id（undo / redo / find / filter / sort / freeze / insertRow / deleteRow / copyRow / zoom / cut / copy / paste），每项注释来源文件。
  - `menus.ts`：`registerFourStateMenu(univerAPI, handlers: { empty, null, default, missing })`。
  - `tokens.css`：`--color-text-faint --color-accent --color-accent-bg --color-accent-border --color-dirty --color-dirty-bg --color-new --color-new-bg --color-danger --color-danger-bg --color-conflict --color-conflict-bg --color-ai --color-ai-bg --color-readonly-bg`（既有 13 个保留）。
- 验收：见 Workflow 卡 M6-G 四条。
- 主 loop 接线：本 wave 合入后 `App.tsx` 改为消费 `phaseView` 与 `COPY`，删除 `four-state-menu` / `onContextMenu`，既有 E2E 全绿。

## M6-H · 重设计壳与表格区

- 独占文件（可拆 3 张并行）：
  1. 顶栏 / 横幅 / 状态条：`panels/{TopBar,Banner,StatusBar}.tsx`、`tests/e2e/host-drafts.spec.ts`（断言迁到横幅 / live region）。
  2. 表列表 + 工具栏：`panels/{TableList,GridToolbar}.tsx`。
  3. 投影视觉 + 检查器：`spreadsheet/{projection,cellMeta,viewState}.ts`、`panels/Inspector.tsx`、`tests/projection.roundtrip.test.ts`、`tests/e2e/layout.spec.ts`（新：量高度、检查器开合、阻断态横幅）。
  - 主 loop：`App.tsx`、`styles/app.css` 壳网格（`42px auto 1fr 30px 24px` × `side 1fr [inspector]`）。
- 依赖：M6-G 全部 Produces；四态呈现按 ADR 0008。
- 接口：`Inspector({ selection, cellMeta, onFourState, onRevert, onDeleteRow })` 只读；`cellMeta.invalidReason(column, token, remoteErrors)`；`viewState` 增 `inspectorOpen`、`sidebarCollapsed`。
- 验收：见 Workflow 卡 M6-H 四条。

## M6-I · 重设计抽屉

- 独占文件（可拆 3 张并行）：
  1. 抽屉壳 + 补丁页签：`panels/drawer/{Drawer,PatchTab}.tsx`、删 `panels/DiffPreview.tsx`、`tests/e2e/host-submit.spec.ts`。
  2. 错误 + 冲突页签：`panels/drawer/{ErrorTab,ConflictTab}.tsx`、删 `panels/{ErrorPanel,ConflictPanel}.tsx`、`tests/e2e/host-rebase.spec.ts`。
  3. 导出页签 + 设置对话框 + seen 横幅：`panels/drawer/ExportTab.tsx`、`panels/SettingsDialog.tsx`、删 `panels/{ExportPanel,SettingsPanel}.tsx`、`spreadsheet/viewState.ts`（`seen:<repo>:<table>` 记 `revision.id` + 指纹）、`tests/viewState.test.ts`、`tests/e2e/host-export.spec.ts`。
  - 主 loop：`App.tsx` 接线，删除常驻面板。
- 依赖：M6-G、M6-H。
- 接口：`Drawer({ tabs, active, open, onToggle })`；`PatchTab({ patch, summary, target, result, onJump })`；`ErrorTab({ errors, onJump })`；`ConflictTab({ conflicts, resolved, onResolve, onResubmit, onCancel })`；全部 `onJump(row, column)` 经 `univerAPI` `setActiveRange` + `scrollToCell`。
- 验收：见 Workflow 卡 M6-I 四条。

## M6-J · 重设计键盘、命令面板、空态与阻断页、可访问性与收口

- 独占文件：`panels/{CommandPalette,SubmitConfirm,Blocked,ShortcutsDialog}.tsx`、`components/ui/useHotkeys.ts`（全量接线）、`editor/docs/a11y-checklist.md`、`docs/reference/editor.md`、`src/lumio_config/editor_static/`（重建产物）、`tests/e2e/keyboard-journeys.spec.ts`、`editor/package.json`（仅 devDependency `@axe-core/playwright`；装不上或 Chromium 下载受阻则退回人工清单并在交回物说明）。
  - 主 loop：`App.tsx` 最终接线。
- 依赖：M6-I。
- 验收：见 Workflow 卡 M6-J 四条；设计验收清单（原 handoff `CLAUDE_CODE_PROMPT.md` §4.3，已迁入 `a11y-checklist.md`）逐条勾。

## M6-K · Host 修订级差异接口与「改动」页签（需要 Host）

- 独占文件：`src/lumio_config/editor/history.py`（新）、`editor/vcs.py`（白名单增 `("git","log")`、`("git","show")`）、`editor/server.py`（`GET /api/tables/{table}/history`）、`editor/session.py`（`capabilities.history`）、`tests/test_editor_history.py`、`editor/src/api/{types,client}.ts`（history 类型与调用）、`editor/src/panels/drawer/DiffTab.tsx`、`docs/reference/editor.md` 改动段。
- 依赖：Host 部分无前置，可与 M6-H 并行；前端页签依赖 M6-I 的 `Drawer`。
- 接口：`GET /api/tables/{t}/history?since=<revisionId>&limit=20` → `{ items: [{ revision, message, time, author, cells: [{ row, rowId, column, from, to }], created: [rowId], deleted: [rowId] }] }`；`since` 缺省取最近 `limit` 条；`vcs=svn/none` → `{ items: [] }` 且 `/api/session` `capabilities.history=false`。Host 用 `VcsAdapter` 白名单取两修订的 `tables/<t>.txt` 快照，经 `load_sources` 解析后按稳定 id 逐格比对；不复制 `patch.py` 语义。
- 验收：见 Workflow 卡 M6-K 四条。

## 卡间文件集（互不重叠）

| 卡 | 独占文件 |
| --- | --- |
| M6-F | `spreadsheet/{interceptors,editors,projection,cellMeta}.ts`、`App.tsx`（`canEdit` 时序）、`tests/{interceptors,projection.roundtrip}.test.ts`、`tests/e2e/keyboard.spec.ts`、`editor/docs/four-state-render-spike.md`、`.spec/decisions/0008`、`.spec/knowledge/lessons.md` |
| M6-G | `styles/*`、`index.html`、`app/{phaseView,copy,state}.ts`、`api/types.ts`、`components/ui/*`、`spreadsheet/{univer,menus,commands}.ts`、`interceptors.ts`（仅 `COMMAND` 抽出）、`editor/docs/univer-surface.md`、`tests/{state,phaseView,copy,ui}.test.*`、`tests/e2e/{sheet-ops,four-state}.spec.ts` |
| M6-H | `panels/{TopBar,Banner,StatusBar,TableList,GridToolbar,Inspector}.tsx`、`spreadsheet/{projection,cellMeta,viewState}.ts`、`tests/projection.roundtrip.test.ts`、`tests/e2e/{host-drafts,layout}.spec.ts`；主 loop：`App.tsx`、`styles/app.css` |
| M6-I | `panels/drawer/{Drawer,PatchTab,ErrorTab,ConflictTab,ExportTab}.tsx`、`panels/SettingsDialog.tsx`、删 `panels/{DiffPreview,ErrorPanel,ConflictPanel,ExportPanel,SettingsPanel}.tsx`、`spreadsheet/viewState.ts`、`tests/viewState.test.ts`、`tests/e2e/{host-rebase,host-export,host-submit}.spec.ts`；主 loop：`App.tsx` |
| M6-J | `panels/{CommandPalette,SubmitConfirm,Blocked,ShortcutsDialog}.tsx`、`components/ui/useHotkeys.ts`、`editor/docs/a11y-checklist.md`、`docs/reference/editor.md`、`src/lumio_config/editor_static/`、`tests/e2e/keyboard-journeys.spec.ts`、`editor/package.json`；主 loop：`App.tsx` |
| M6-K | `src/lumio_config/editor/{history,vcs,server,session}.py`、`tests/test_editor_history.py`、`editor/src/api/{types,client}.ts`、`panels/drawer/DiffTab.tsx`、`docs/reference/editor.md` |

同一文件出现在相邻两卡（`projection.ts`、`viewState.ts`、`api/types.ts`、`interceptors.ts`、`host-*.spec.ts`）时按卡序串行，不并行。

---
status: pending
---

# 网页编辑器 v3 加固 · 开发 Agent 派活提示词（2026-09-04）

> 用途：把本文整段交给负责实现的**主 loop Agent**（Claude Code，本仓 `~/LumioGames/LumioConfig`）。它是调度者，不亲自写大段代码；按 §3 的阵列把工作并行扇出给 worker，负责合入、接线、收口、交回。本文同时是 `subagent-driven-development` 技能可直接消费的计划：每张子卡是一个 `## Task N` 节，`scripts/task-brief <本文路径> N` 能把它切成 worker 简报。

---

## 0. 你的角色与真值

你是本轮「v3 加固与补齐」的**主 loop / 仓内总调度**。目标：把 Workflow 上 **12 张需求单**做完、审过、合入 main。

12 张单已于 2026-09-04 落在**项目 LumioGamesEngine / 需求室 RM-00009 LumioConfig**，每张带 4 条结构化验收项（S01–S04），蓝图标记 `workflow-plan:lumioconfig-m7-editor-hardening-20260904/r1/<卡号>`：

| 卡 | Workflow 单 | 标题 | 优先级 |
| --- | --- | --- | --- |
| M7-X | [R-00395](https://lumiogamesengine.workflow.games/requirements/01a06ae1-442a-75a1-b7f2-7411ffac033e) | 冻结加固批次契约层 | P1 |
| M7-A | [R-00396](https://lumiogamesengine.workflow.games/requirements/01a06ae1-4445-7595-b0c6-c37e712856d9) | 掉线态真正可感知 | **P0** |
| M7-B | [R-00397](https://lumiogamesengine.workflow.games/requirements/01a06ae1-44e0-71e4-b095-610de4a791af) | 错误页签状态收敛 | P1 |
| M7-C | [R-00394](https://lumiogamesengine.workflow.games/requirements/01a06ae1-42fc-7449-9193-6234a0f4757b) | 列头可读性 | P1 |
| M7-D | [R-00398](https://lumiogamesengine.workflow.games/requirements/01a06ae1-5696-7d3e-852c-5b0f2c974dc9) | 源文件路径可见 | P1 |
| M7-E | [R-00399](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7032-7584-965b-0e79cc8082b4) | 源文件只读端点 + 右键 | P1 |
| M7-F | [R-00400](https://lumiogamesengine.workflow.games/requirements/01a06ae1-76dc-7d2a-b0b9-638d3267b088) | 导出 TXT | P1 |
| M7-G | [R-00401](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7f07-76d3-a024-4fabe3f4e8e7) | reveal（**Owner 闸门**，见 §7） | P2 |
| M7-J | [R-00402](https://lumiogamesengine.workflow.games/requirements/01a06ae1-837f-7897-96af-4f9c7f90f8ce) | 交回物制度补课 | P1 |
| M7-K | [R-00403](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8aa0-763e-b67d-b53c11f00e93) | Node 26 红测试与 storage 注入 | P1 |
| M7-H | [R-00404](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8f2e-787a-a1b7-9cf7eaacc007) | `[预研]` 建新表命名空间决策门 | P2 |
| M7-I | [R-00405](https://lumiogamesengine.workflow.games/requirements/01a06ae1-963a-7e51-b59e-60717d9a45fc) | `[预研]` 导入合规形态决策门 | P2 |

**M7-H / M7-I 是决策卡不是实现卡**——它们本身可开工，交付物是被记录下来的结论（带时间盒与停止阈值）；对应的实现卡等结论出来后按新蓝图修订再落，本轮不做。**M7-G 有 Owner 授权闸门**，未授权则 Task 16 不扇出，其余照常。

真值优先级（冲突时序号小的赢）：

1. 本仓 `.spec/AGENTS.md` 红线与收口门槛；插件注入的调度 / 编码规程。
2. `docs/decisions/0-1`～`0-8`（架构仓镜像 ADR，**不得改写**；发现设计与之冲突 → 停下上报 Owner）。
3. `.spec/decisions/0003`～`0008`（Owner 已拍板，不再讨论）。
4. **`.spec/plans/2026-09-04-editor-v3-hardening-requirements.md`（本轮需求正文，逐条验收口径以它为准）。**
5. 本文（子卡拆解、并行时序、文件集、协议）。
6. `docs/reviews/2026-09-04-editor-v3-completion-audit.md`（缺陷的证据来源，`文件:行号` 都在里面，**修之前先自己复核一遍，别盲改**）。
7. `.spec/knowledge/features/web-editor-ux.md`（v3 设计稿，尺寸 / 文案 / 状态表 / 令牌以它为准）。
8. Workflow 卡正文（Owner 立卡后才有；只读，与仓内不一致以仓内为准并上报）。

**Workflow 只读。** 流转、评论、附件由 Owner 做；你在交回物里附卡号 + 提交号 + 证据。

---

## 1. 开工先读（按序，只读一次，之后靠文件路径引用）

1. `.spec/AGENTS.md`、`.spec/knowledge/README.md` 导航到的 `standards/{workflow,code-style,testing,dispatch}.md`。
2. **`.spec/plans/2026-09-04-editor-v3-hardening-requirements.md` 全文**（这是需求，不是参考）。
3. `docs/reviews/2026-09-04-editor-v3-completion-audit.md` 的 §C（实走）、§E（残留）、§G（漂移）三节。
4. `docs/decisions/0-1` §2、`0-7` §4/§5 全文（本轮多张卡的边界都压在这两处）。
5. `.spec/knowledge/features/web-editor-ux.md` §5（状态表）、§8（抽屉）、§12（文案表）。

---

## 2. 硬约束（每份 worker 简报都带上，一字不省）

- 不改 `docs/decisions/0-1`～`0-8`；不改 `.spec/decisions/0003`～`0008`；不改 `tables/ registry/ schemas/`（要改 → 停，报 Owner）。
- **不加运行时依赖，不加 devDependency。** 本轮零新依赖。CSP `default-src 'self'` 下不引外链字体 / 脚本 / 图标（图标内联 SVG）。
- 技术栈固定：React + TypeScript strict + Vite；Univer OSS `0.25.1` 锁版；**Host 只用 Python 标准库**。
- 所有用户可见文案只能来自 `editor/src/app/copy.ts`；不得出现英文阶段名、`autoCommit` / `autoExport`、`local.json`、`sha256:` 全文（`copy.test.ts` 的正则守卫会拦）。
- 组件样式只用 `editor/src/styles/tokens.css` 变量；`src/panels/**`、`src/components/**` **不写十六进制色 / `rgb(`**（`no-hardcoded-colors.test.ts` 会拦）。`projection.ts` 的 `STYLES` 是工作簿数据，允许字面色值但须与设计稿 §4 表一致并注释指向该表。
- `window.__lumioPoc` 桥保留；E2E 实际引用的 8 个 testid（`univer-root table-<name> status-hint draft-refresh btn-export export-link conflict-panel conflict-mine`）必须保留；改文案时同卡改断言。
- 四态徽标不得写进单元格 `v` 或 token（`projection.roundtrip.test.ts` 两条守卫保留）。
- **本轮新增：`editor/src/**` 不得裸用 `localStorage.` / `sessionStorage.`**，一律走 Task 2 产出的 `app/storage.ts` 访问器（`viewState.ts` 既有的注入形参写法保留，它是对的）。Task 5 会加守卫测试。
- **本轮新增：任何读文件的 Host 端点，路径的任何一段都不得由请求方拼装**——只接 `table` + 闭合枚举 `kind`，前缀在 Host 侧写死；`_valid_table` + `resolve()` + `relative_to(root)` 三道兜底一个不能少。
- **本轮新增：不实现"公式"。** `docs/decisions/0-7:50` 禁止公式持久化，`interceptors.ts:181,197` 的拦截与剥离逻辑**不得放宽**。
- 生成物 `src/lumio_config/editor_static/` **只在最后一张 Task 17 重建并提交**；worker 在 worktree 里跑过 `pnpm build` 后**不得提交** `editor_static/` 与 `editor/docs/poc-benchmark.md` 的抖动。
- **`App.tsx` 不进任何 worker 的文件集**，由主 loop 在两处接线点亲自改（§5）。
- 不夹带：只做本卡文件集内、本卡验收要求的改动；不顺手重构。
- TDD：所有子卡先写失败测试；每卡只跑覆盖本卡的测试；全量收口门槛由主 loop 在阵列合入后跑。
- 一次提交只做一类事；提交信息 `feat(editor):` / `fix(editor):` / `test(editor):` / `docs(editor):` / `chore(editor):`，末尾 `Co-Authored-By` 按宿主要求。

---

## 3. 阵列与并行时序（核心）

11 张需求卡里 8 张可开工，拆成 17 张子卡。**能并行的一律并行**：同一时刻所有文件集互不重叠的子卡一起扇出，每个 worker 独立 git worktree；串行只保留无法解除的依赖。

```text
T0（开工即扇出 9 个 worker，文件集两两不重叠）
  契约层   Task 1  X1 copy 文案批次            （M7-A/C/D/E/F 的全部新文案一次到位）
           Task 2  X2 types + storage 访问器    （M7-D/E/F 的类型 + M7-K 的访问器）
  前端     Task 3  A1 SSE 存活检测 + 订阅生命周期（M7-A 前端核心）
           Task 4  C1 列头投影中文化 + 列宽自适应（M7-C 投影半）
           Task 5  K1 storage 注入 + Node 上界   （M7-K 全卡）
  Host     Task 6  H1 session/settings 契约扩展  （M7-D/F/G 的 Host 契约）
           Task 7  H2 源文件只读端点            （M7-E Host 半）
           Task 8  H3 导出 TXT                  （M7-F Host 半）
  工程     Task 9  J1 .sdd 交回物制度            （M7-J 全卡，纯文档）
      ↓ 主 loop 合入 T0 → 【接线点 1】App.tsx（M7-A §6 + M7-B §1-3）→ 全量门槛 → 审查

T1（接线点 1 完成后，扇出 5 个 worker）
           Task 10 A2 掉线 E2E                  （M7-A 验收）
           Task 11 B1 错误收敛 E2E + 跳格 E2E    （M7-B 验收 + 审计 E-4）
           Task 12 C2 工具栏 S/C/V 图例          （M7-C 前端半，GridToolbar.test 由 Task 5 释放）
           Task 13 D2 顶栏路径菜单              （M7-D 前端半）
           Task 14 F2 导出页签 TXT 选项          （M7-F 前端半）
      ↓ 主 loop 合入 T1 → 全量门槛 → 审查

T2（T1 合入后，扇出 2 个 worker）
           Task 15 E2 表列表右键 + 源文件查看器  （M7-E 前端半，TableList.tsx 由 Task 5 释放）
           Task 16 G1 reveal 端点               （M7-G 全卡，⚠ 需 Owner 授权才扇出）
      ↓ 主 loop 合入 T2 → 【接线点 2】App.tsx 挂查看器 → 全量门槛 → 审查

T3（串行最后，主 loop 自做）
           Task 17 F3 文档 + 生成物重建 + 截图

不扇出（闸门未解除）：M7-H 建新表（等架构仓）、M7-I 导入（等 Owner 签字）
```

**并行上限**：T0 九个 worker；T1 五个；T2 两个。宿主并发吃紧时按 Task 编号顺序排队，**不要**把两张子卡塞给同一个 worker。

### 3.1 子卡总表（文件集两两不重叠；同名文件跨阵列出现的按 T 序串行）

| Task | 子卡 | 需求卡 / 验收项 | 启动条件 | 独占文件集 | 模型档位 |
| --- | --- | --- | --- | --- | --- |
| 1 | X1 contract-copy-batch | M7-A/C/D/E/F 文案 | T0 | `editor/src/app/copy.ts`、`editor/tests/copy.test.ts` | mid |
| 2 | X2 contract-types-storage | M7-D S01、M7-E、M7-F、M7-K S03 | T0 | `editor/src/api/types.ts`、`editor/src/app/storage.ts`（新）、`editor/tests/storage.test.ts`（新） | mid |
| 3 | A1 sse-liveness | **M7-A S01 S02 S04** | T0 | `editor/src/api/client.ts`、`editor/src/api/draftSession.ts`、`editor/tests/client-sse.test.ts`（新） | 最强 |
| 4 | C1 header-projection | M7-C S01 S02 S04 | T0 | `editor/src/spreadsheet/projection.ts`、`editor/tests/projection.roundtrip.test.ts` | standard |
| 5 | K1 storage-injection | **M7-K S01～S04** | T0 | `editor/package.json`、`editor/src/panels/TableList.tsx`、`editor/tests/TableList.test.tsx`、`editor/tests/GridToolbar.test.tsx`、`editor/tests/no-bare-localstorage.test.ts`（新） | standard |
| 6 | H1 host-contract | M7-D S01、M7-F S03、M7-G S01 | T0 | `src/lumio_config/editor/session.py`、`src/lumio_config/editor/settings.py`、`tests/test_editor_server.py` | mid |
| 7 | H2 source-endpoint | **M7-E S01 S02** | T0 | `src/lumio_config/editor/source_view.py`（新）、`tests/test_editor_source_view.py`（新） | standard |
| 8 | H3 export-txt | **M7-F S01 S02 S04** | T0 | `src/lumio_config/editor/export_csv.py`、`tests/test_editor_export.py` | standard |
| 9 | J1 sdd-return-discipline | **M7-J S01～S04** | T0 | `.sdd/README.md`（新）、`.sdd/.gitignore`、`.sdd/m6-{f,g,h,i,j,k}-return.md`（新 ×6）、`.spec/knowledge/standards/dispatch.md`、`.spec/knowledge/lessons.md`、`editor/docs/a11y-checklist.md` | mid |
| 10 | A2 offline-e2e | **M7-A S01 S03 S04** | 接线点 1 | `editor/tests/e2e/host-offline.spec.ts`（新） | standard |
| 11 | B1 errors-e2e | **M7-B S01 S04** | 接线点 1 | `editor/tests/e2e/host-errors.spec.ts`（新） | standard |
| 12 | C2 toolbar-legend | M7-C S03 | 接线点 1 + Task 5 合入 | `editor/src/panels/GridToolbar.tsx`、`editor/tests/GridToolbar.test.tsx` | mid |
| 13 | D2 topbar-paths | M7-D S02 S03 S04 | 接线点 1 + Task 1/2/6 合入 | `editor/src/panels/TopBar.tsx`、`editor/tests/TopBar.test.tsx` | mid |
| 14 | F2 export-tab-txt | M7-F S03 | 接线点 1 + Task 1/2/6/8 合入 | `editor/src/panels/drawer/ExportTab.tsx`、`editor/tests/ExportTab.test.tsx`、`editor/tests/e2e/host-export.spec.ts` | mid |
| 15 | E2 tablelist-source-view | **M7-E S03 S04** | T1 合入 | `editor/src/api/client.ts`（仅加 `sourceFile`）、`editor/src/panels/TableList.tsx`、`editor/src/panels/SourceViewDialog.tsx`（新）、`editor/tests/TableList.test.tsx`、`editor/tests/SourceViewDialog.test.tsx`（新）、`editor/tests/e2e/host-source-view.spec.ts`（新） | standard |
| 16 | G1 host-reveal ⚠ | **M7-G S01～S04** | T1 合入 **+ Owner 授权** | `src/lumio_config/editor/reveal.py`（新）、`src/lumio_config/editor/server.py`、`src/lumio_config/cli.py`、`tests/test_editor_reveal.py`（新） | standard |
| 17 | F3 docs-and-static（主 loop 自做） | M7-F/G 文档段、全卡收口 | 15/16 合入 | `docs/reference/editor.md`、`.spec/knowledge/features/web-editor-ux.md`、`src/lumio_config/editor_static/`、`editor/docs/screens/*.png` | — |

### 3.2 子卡 ↔ Workflow 单映射（收口时按此对账验收项）

| Workflow 单 | 卡 | 由哪些子卡交付 |
| --- | --- | --- |
| [R-00395](https://lumiogamesengine.workflow.games/requirements/01a06ae1-442a-75a1-b7f2-7411ffac033e) | M7-X | Task 1（copy.ts）+ Task 2（types.ts / storage.ts） |
| [R-00396](https://lumiogamesengine.workflow.games/requirements/01a06ae1-4445-7595-b0c6-c37e712856d9) | M7-A | Task 3（client/draftSession）+ 接线点 1 + Task 10（E2E） |
| [R-00397](https://lumiogamesengine.workflow.games/requirements/01a06ae1-44e0-71e4-b095-610de4a791af) | M7-B | 接线点 1 + Task 11（E2E） |
| [R-00394](https://lumiogamesengine.workflow.games/requirements/01a06ae1-42fc-7449-9193-6234a0f4757b) | M7-C | Task 4（projection）+ Task 12（工具栏图例） |
| [R-00398](https://lumiogamesengine.workflow.games/requirements/01a06ae1-5696-7d3e-852c-5b0f2c974dc9) | M7-D | Task 6（session.py 的 `sourcePath` 行）+ Task 13（顶栏菜单） |
| [R-00399](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7032-7584-965b-0e79cc8082b4) | M7-E | Task 7（只读端点）+ Task 15（右键 + 查看器）+ 接线点 2 |
| [R-00400](https://lumiogamesengine.workflow.games/requirements/01a06ae1-76dc-7d2a-b0b9-638d3267b088) | M7-F | Task 6（session.py 的 `capabilities.export` 行）+ Task 8（导出器）+ Task 14（页签） |
| [R-00401](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7f07-76d3-a024-4fabe3f4e8e7) | M7-G | Task 16（Host reveal；菜单项已由 Task 15 按 capability 预留） |
| [R-00402](https://lumiogamesengine.workflow.games/requirements/01a06ae1-837f-7897-96af-4f9c7f90f8ce) | M7-J | Task 9 |
| [R-00403](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8aa0-763e-b67d-b53c11f00e93) | M7-K | Task 5 |
| [R-00404](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8f2e-787a-a1b7-9cf7eaacc007) | M7-H | 决策卡，主 loop 或 Owner 直接执行，不派 worker |
| [R-00405](https://lumiogamesengine.workflow.games/requirements/01a06ae1-963a-7e51-b59e-60717d9a45fc) | M7-I | 决策卡，同上 |

**一处必须知道的口径差**：线上卡 M7-D / M7-F / M7-G 各自把 `src/lumio_config/editor/session.py` 的**一行**写进了自己的拥有范围（`sourcePath` / `capabilities.export` / `capabilities.reveal`）。本文把这三行**合并到 Task 6（H1）一次做完**——同一文件不能三个 worker 并行改。以本文为执行口径；收口对账时，Task 6 的产出同时满足 M7-D S01、M7-F S03（capabilities 部分）与 M7-G S01（capabilities 部分）。

**跨 T 序串行的三个文件**（同名文件出现在两张卡里，必须按 T 序，不得并行）：

- `editor/src/panels/TableList.tsx`：Task 5（T0，storage 注入）→ Task 15（T2，右键菜单）
- `editor/tests/TableList.test.tsx`：Task 5（T0）→ Task 15（T2）
- `editor/tests/GridToolbar.test.tsx`：Task 5（T0，去掉裸 `localStorage.clear()`）→ Task 12（T1，图例断言）
- `editor/src/api/client.ts`：Task 3（T0，SSE 存活 + `sessionStorage` 迁移）→ Task 15（T2，只加 `sourceFile`）

---

## 4. 派工协议（每张子卡）

1. 主 loop 站在集成分支上（§5），运行 `<插件目录>/skills/subagent-driven-development/scripts/task-brief .spec/plans/2026-09-04-editor-v3-hardening-dispatch-prompt.md N`，得到简报路径。
2. 用 `Agent` 工具派 worker：`subagent_type: general-purpose`，`isolation: "worktree"`，`run_in_background: true`，`model` 按 §3.1 档位（mid = sonnet，standard / 最强 = opus）。**同一 T 序的子卡在同一条消息里一起派出。**
3. 派遣 prompt 用插件 `implementer-prompt.md` 骨架填空，只含：① 一句话定位（需求卡 / T 序）；② 简报路径（"先读它；再读 `.spec/plans/2026-09-04-editor-v3-hardening-requirements.md` 里对应的 `## M7-x` 节，那是你的需求正文，验收项逐字照用"）；③ 它 Consumes 的契约文件路径与**逐字签名**（不贴内容），以及本子卡归属的 Workflow 单号（见 §3.2，用于交回对账）；④ `【文件集边界】只改：<独占文件集>。并行方正在改：<同 T 序其他子卡文件集>（一律不动；lint / tsc 报错涉及它们时只记录，主 loop 统一收口）`；⑤ §2 硬约束全文；⑥ §6 环境事实；⑦ 报告文件路径与状态口径（`DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`）。**不贴前几轮历史。**
4. worker 交回后：先看 diff 是否越出文件集；再核对报告里覆盖测试的命令与输出（RED → GREEN 证据）；**成功报告不作数，以 diff 与测试为准**。`BLOCKED / NEEDS_CONTEXT` → 补上下文重派或拆卡；`DONE_WITH_CONCERNS` 触碰契约 → 先修契约卡再重派消费方。
5. 合入 worker 分支后，在 **`docs/reviews/2026-09-04-editor-v3-hardening-progress.md`**（不是 `.sdd/`，见 Task 9 的落点决定）追加一行 `Task N (M7-x): complete (commits <base7>..<head7>, merged)`，concern 用 `note:` 行。**这是你唯一可靠的进度记忆**；上下文被压缩后以它和 `git log` 为准，不重派已完成子卡。

---

## 5. 合入、接线与收口协议（主 loop）

**分支**：本轮一条集成分支 `feat/editor-v3-hardening`，从最新 `origin/main` 切；worker 的 worktree 分支从它切。

**两个接线点（主 loop 亲自做，一次一类事，各一个提交）**：

### 接线点 1（T0 全部合入后）— `editor/src/app/App.tsx`

这是本轮唯一的 P1 修复落点，**照需求文档 M7-A §6 与 M7-B §1-3 逐条做**：

1. 订阅处改用 Task 3 的 `EventStreamCallbacks`：`onOpen` → `dispatch({type:"online", online:true})`；`onClose` 与看门狗 `onDead` → `dispatch({type:"online", online:false})`。
2. 全部 `catch`：`HostApiError.code === "NETWORK_UNREACHABLE"` → 派 `online:false`，**不再落 `failed`**（这是「提交失败」文案错配的根，审计 §G-5）；其余错误维持现状。
3. `openTable` 在 `!state.online` 时直接返回，**不得卸载 Univer 实例**（白屏的直接成因，审计 §C-10）。
4. ErrorTab 的 `state` 选择器改为 `dirtyCount === 0` 无条件优先 `no-changes`；页签 `count` / `tone` 跟着走。
5. 脏格数从 >0 变 0 的四条路径（还原 / undo / 撤销删行 / 切表）都 `setErrors([])`。

**判据**：既有 E2E 全绿 + 手工杀一次 Host 能看到阻断页，接线才算完成。

### 接线点 2（T2 合入后）— `editor/src/app/App.tsx`

挂 `SourceViewDialog`，把 `TableList` 的右键回调接到 `client.sourceFile()`；`capabilities.reveal` 透传给 `TableList`。

### 卡级收口

1. `node <插件目录>/tools/closeout-gate.mjs` 定级；跑全量收口门槛（§6）并留输出。
2. `scripts/review-package <集成分支起点> HEAD` 生成审查包；派 `lumio:reviewer`，材料 = 需求文档对应 `## M7-x` 节的验收项 + 本文对应 Task 节 + 审查包 + 进度台账 + §2 约束。
   - **M7-A（Task 3 + 接线点 1）显式深审**：它是 P1，且改的是全局连接生命周期。
   - **M7-E（Task 7 + 15）与 M7-G（Task 16）显式深审**：新增读文件 / 执行本机命令的攻击面，属 §2 的鉴权安全面，**工具判不了，人工按深审处理**。
   - 其余按 gate 定级，默认快审。
3. 退回 → 先对照代码核实再改（不盲改），修复顺序阻塞 → 简单 → 复杂，逐条测；同一问题三次不过升级 Owner；通过 → 合入 main。
4. push：见 §7 Owner 授权勾选。
5. 向 Owner 交回（§8 格式），Owner 流转 Workflow 卡。

---

## 6. 环境事实与收口命令（照抄，别再踩）

- **开工第一件事：`cd editor && pnpm install --frozen-lockfile`。** 本机 `node_modules` 曾缺 `@axe-core/playwright`（已在 lockfile 里锁了 `4.13.0`，但没落到本地 store），不装回去 `pnpm lint` 会报 6 个 tsc 错、`a11y.spec.ts` 整文件跑不了。见审计 §G-1。
- **Node 当前是 v26.4.0**，它自带的全局 `localStorage` 会遮蔽 vitest 的 jsdom Storage，导致 `TableList.test.tsx`(11) + `GridToolbar.test.tsx`(13) **共 24 条在 Task 5 合入前必红**。这是已知基线，**worker 不得把它当成自己的回归**；Task 5 就是修它的。见审计 §G-2。
- Python 用 `/usr/local/bin/python3.11`（系统 `python3` 是 3.9）。Host 类 E2E（`host-*.spec.ts`）默认 PYTHON 路径是 Windows 的，跑前 `export PYTHON=/usr/local/bin/python3.11`。
- 本机没有 `corepack`：`playwright.config.ts` 的 webServer 命令 `corepack pnpm dev` 会失败。先在另一个终端 `cd editor && pnpm exec vite`，再 `PYTHON=/usr/local/bin/python3.11 pnpm e2e`（`reuseExistingServer` 会接上）。Chromium 用已缓存的 `chromium-1161`（Playwright 1.51.0 对应版本）。
- `benchmark.spec.ts` 每跑一次会改写 `editor/docs/poc-benchmark.md`，提交前 `git checkout -- editor/docs/poc-benchmark.md`。
- worktree 里跑过 `pnpm build` 会改 `src/lumio_config/editor_static/`，提交前还原；只有 Task 17 提交它。
- React 单测写法照 `editor/tests/Button.test.tsx`：`react-dom/client` + `act`，不引 testing-library；`act(...)` 警告是已知噪音。
- **本轮特有**：Task 10 的掉线 E2E 需要在测试里 kill 掉自己起的 Host 子进程再重启。照 `host-drafts.spec.ts:185` "Host restart restores the draft" 的写法，那条用例已经做过一次 Host 重启。
- **本轮特有**：Task 16 的 reveal 测试**必须全程 mock `subprocess.Popen`**，绝不真的拉起文件管理器（CI 与本机都会炸窗口）。
- `.claude/worktrees/` 已在 `.gitignore`。

全量收口门槛（每次合入 main 前跑一次，附输出）：

```bash
cd editor && pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build
PYTHON=/usr/local/bin/python3.11 pnpm e2e
git diff --exit-code -- src/lumio_config/editor_static   # 只有 Task 17 收口时允许非空，且随后提交
/usr/local/bin/python3.11 -m unittest discover -s tests -v
/usr/local/bin/python3.11 tools/lumio_config.py validate
/usr/local/bin/python3.11 tools/lumio_config.py format --check
git diff --check
node <插件目录>/tools/spec-lint.mjs .
```

**基线数字（2026-09-04 实测 @ `f2b0ecf`，用来判断你有没有引入回归）**：

| 命令 | 开工基线 | 收口应达到 |
| --- | --- | --- |
| `pnpm vitest run` | 24 failed / 289 passed (313) | **0 failed**（Task 5 修完后） |
| `pnpm e2e` | 54 passed | ≥ 54 + 本轮新增（10/11/14/15 各至少 1 条） |
| `python3.11 -m unittest discover -s tests` | 150 tests OK (skipped=1) | ≥ 150 + 本轮新增（6/7/8/16） |
| `pnpm build` 后 `git diff -- editor_static` | 空 | 空（除 Task 17） |

---

## 7. Owner 授权与闸门（开工前 Owner 勾选，主 loop 照办）

**四个必须先勾的闸门**——没勾的那张卡不扇出，其余照常并行：

- [ ] **M7-G reveal 授权**：允许 Host 在用户显式开启 `--allow-reveal` 后，执行 `open -R` / `explorer /select,` / `xdg-open`。**未勾 → Task 16 不扇出**（Task 15 仍照做，菜单第三项按 `capabilities.reveal=false` 不渲染，功能完整）。
- [ ] **M7-F 的 `targets` 语义**（二选一）：
  - [ ] A（推荐）：TXT 导出拒绝 `targets` 过滤，只出全列，传了非空就 400。
  - [ ] B：允许过滤，文件名强制加后缀 `<table>.S.txt` + README 大字警告。
  - 未勾 → Task 8 按 A 实现并在交回物标注该假设。
- [ ] **M7-J 的落点决定**（二选一）：
  - [ ] A（推荐）：交回物落 `docs/reviews/`，`.sdd/` 维持整目录 gitignore、降级为纯临时区。
  - [ ] B：`.sdd/.gitignore` 从 `*` 改成只忽略临时文件，`*-return.md` 与 `progress.md` 入库。
  - 未勾 → Task 9 按 A 实现（本文 §4.5 的台账落点已按 A 写）。
- [ ] **push 口径**（二选一）：
  - [ ] 持续授权：每轮收口审查通过并合入 main 后直接 `git push origin main`。
  - [ ] 逐次确认：合入 main 后停下，报 Owner 确认再 push。

**两张决策卡（已落单，本轮可执行，但交付物是结论不是代码）**：

- [R-00404](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8f2e-787a-a1b7-9cf7eaacc007) **M7-H**：向架构仓提清六个问题（命名空间归属 / 自治区段 / 集中登记流程 / 新表 schema 最小字段集 / registry 条目形状 / 删表改名是否同 ADR 覆盖），把回话原文与结论落成可引用 ADR。时间盒 3 个工作日；**拿不到回话就写「未获回话」，不许推测**。
- [R-00405](https://lumiogamesengine.workflow.games/requirements/01a06ae1-963a-7e51-b59e-60717d9a45fc) **M7-I**：请 Owner 签字确认导入降级为「解析成补丁草案走既有预检通道」（选项 A）或要求覆盖式（选项 B → 本卡作废转架构仓）。时间盒 2 个工作日；**拿不到回复就写「未获签字」**。

两卡的实现卡都**不在本轮**——等结论出来后按新蓝图修订再落单。

**必须升级 Owner 的情况**：设计与 `0-1`～`0-8` 冲突；需要改 ADR；需要新增依赖（本轮口径是零新依赖）；需要改 Host 端点形状（本文点名之外的）；同一问题三次修不过；Task 3 的看门狗方案被证明不可行（例如某平台 SSE 心跳不达）。

**升级方式**：停下受影响的阵列，其他阵列继续；一条消息说清证据、影响范围、已做的只读检查、需要 Owner 决定什么。

---

## 8. 交回格式（每轮收口一份）

按仓库「交回物格式」：① 改动清单（文件 + 一句话）；② **验证证据**——§6 每条命令与关键输出、reviewer 报告路径与裁决、E2E 通过数与基线对比；③ known gaps；④ 知识沉淀落点（新模式 / 新规范经 `spec-steward` 落 `.spec/knowledge/`，决策记 `.spec/decisions/`；纯修复可豁免但要声明）。

另附：Workflow 单号（见 §3.2 映射）+ 每条验收项 S01～S04 的证据指针 + 集成分支与合入提交号 + 进度台账相关行。**交回按 Workflow 单组织，不按子卡组织**——一张单的 4 条验收项可能由 2～3 张子卡共同满足。

**没有证据的「已完成」一律视为未完成。** 本轮特别注意三条：

- M7-A 的 S01/S04 必须附**实际耗时数值**（"≤8 秒""≤12 秒"是验收线，不是形容词）。
- M7-E 的 S02 必须附**九条安全边界的实际命令与响应**，逐条列出。
- M7-K 的 S01 必须附 **Node 26 下 `pnpm vitest run` 的完整尾部输出**（`Test Files` / `Tests` 两行）。

---

## Task 1 · X1 contract-copy-batch（契约层 · T0）

**目标**：把本轮五张卡要用的全部用户可见文案一次性落进 `copy.ts`，让 T0 的并行方按签名引用。

**独占文件**：`editor/src/app/copy.ts`、`editor/tests/copy.test.ts`。

**Consumes**：`.spec/knowledge/features/web-editor-ux.md` §12 文案表；需求文档 M7-A/C/D/E/F 各节里带引号的文案。

**Produces（键名逐字，值可在保持语义下微调措辞）**：

```ts
// M7-A 重连
COPY.phase.reconnecting: "正在重新连接…"
COPY.banner.reconnecting: "与本机服务断开了，正在自动重连。若一直连不上，请回终端重新运行 serve。"

// M7-C 列头与图例
COPY.columnType: Record<string, string>   // { u32:"整数", i32:"整数", f32:"小数", f64:"小数", string:"文本", bool:"是否", ref:"引用" }（未知类型回落原字面量）
COPY.visibility: Record<string, string>   // { S:"服务端", C:"客户端", V:"体素" }（未知字符原样保留）
COPY.grid.visibilityLegend: "S 服务端 · C 客户端 · V 体素"
COPY.grid.visibilityLegendTitle: "列的可见性"
COPY.grid.visibilityLegendBody: string    // 完整说明，须含「某列第一次标 C 需要过生产激活单」这层含义
COPY.grid.fullColumnName: (name: string) => `完整列名：${name}`

// M7-D 路径
COPY.paths.sourceFile: (path: string) => `源文件 ${path}`
COPY.paths.schemaFile: (path: string) => `Schema ${path}`
COPY.paths.copied: "已复制路径"

// M7-E 源文件查看器
COPY.sourceView.title: (path: string) => `${path}（只读）`
COPY.sourceView.readOnlyNote: "只读快照。改这里不会改仓库；要改表请在表格里改，再提交补丁。"
COPY.sourceView.loading: "正在读取…"
COPY.sourceView.tooLarge: "文件太大，编辑器里不显示。请在编辑器外打开。"
COPY.sourceView.failed: "读取失败。"
COPY.sourceView.copyAll: "复制全文"
COPY.sourceView.copied: "已复制全文"
COPY.tableMenu.viewSource: "查看源文件"
COPY.tableMenu.viewSchema: "查看 Schema"
COPY.tableMenu.reveal: "在资源管理器中显示"

// M7-F 导出 TXT
COPY.export.formatTxt: "TXT（权威文本格式）"
COPY.export.txtNote: "TXT 是源表格式的只读快照，不能拷回仓库覆盖。改表请在表格里改，再提交补丁。"
COPY.export.txtDraftNote: "含未提交草稿，与仓库不一致。"
```

**做什么**：只加，不删不改既有键；`COPY` 仍是 `as const`；带参数的用函数。

**测试**：`copy.test.ts` 现有 4 条保持全绿（BANNED 正则守卫覆盖新增的全部字符串，含函数取样输出）；新增一条断言 `COPY.columnType` / `COPY.visibility` 的未知输入回落行为**在消费侧**（本卡只保证映射表存在，回落逻辑在 Task 4）。

**只跑**：`pnpm vitest run tests/copy.test.ts`。

## Task 2 · X2 contract-types-storage（契约层 · T0）

**目标**：本轮新增的全部前端类型，加上一个永不抛异常的 storage 访问器。

**独占文件**：`editor/src/api/types.ts`、`editor/src/app/storage.ts`（新）、`editor/tests/storage.test.ts`（新）。

**Produces（签名逐字）**：

```ts
// types.ts —— 只加字段/类型，不改既有字段名
interface SessionTableSummary { /* 既有字段不动 */ sourcePath: string }   // "tables/<name>.txt"
interface SessionCapabilities { /* 既有不动 */ export: string[]; reveal: boolean }
export interface SourceFileResponse {
  table: string; kind: "table" | "schema"; path: string; text: string; bytes: number;
}

// storage.ts（新）—— M7-K 的根治手段
/**
 * 取一个永不抛异常的 Storage。取不到真实实现时回落到进程内 Map 垫片。
 * 覆盖三种取不到的情况：浏览器隐私模式、站点禁用存储、Node 26 的全局 localStorage 遮蔽
 * （Node 26 定义了一个不带 --localstorage-file 就返回 undefined 的全局访问器，
 *  vitest 的 jsdom 环境不会覆盖它，详见 docs/reviews/2026-09-04-editor-v3-completion-audit.md §G-2）。
 */
export function safeStorage(kind: "local" | "session"): Storage;
/** 垫片是否在生效（供 UI 决定是否退化，例如 onboarding toast 改为每次都提示）。 */
export function isStorageFallback(kind: "local" | "session"): boolean;
```

**做什么**：`safeStorage` 内部 try/catch 探测 `globalThis.localStorage` / `globalThis.sessionStorage` 是否可读**且可写**（写一个探针键再删掉；只读不写的实现也算不可用）；不可用则返回 Map 垫片，垫片实现完整 `Storage` 接口（`getItem/setItem/removeItem/clear/key/length`）。**同一 kind 多次调用返回同一实例**（垫片状态要在组件间共享）。

**测试**：`storage.test.ts` 覆盖——真实可用时直通、`getItem` 抛异常时回落、`setItem` 抛异常时回落、`globalThis.localStorage` 为 `undefined` 时回落、垫片的完整 `Storage` 行为、同 kind 单例、`isStorageFallback` 正确。

**只跑**：`pnpm vitest run tests/storage.test.ts`。

**注意**：本卡**不改**任何消费方（`TableList.tsx` 归 Task 5，`client.ts` 归 Task 3）。`types.ts` 加了必填字段后其他文件可能 tsc 报错——**只记录，不改**，主 loop 收口。

## Task 3 · A1 sse-liveness（M7-A 前端核心 · T0 · P1）

**目标**：让"连上之后又断了"变成一个能被感知的事件。这是本轮唯一的 P1。

**独占文件**：`editor/src/api/client.ts`、`editor/src/api/draftSession.ts`、`editor/tests/client-sse.test.ts`（新）。

**Consumes**：需求文档 **M7-A 全节**（先读，那是你的需求）；`src/lumio_config/editor/server.py:412-430`（Host 的 SSE 实现，**每 1 秒发一次 `:\n\n` 心跳注释**）；Task 2 的 `app/storage.ts` 签名（用于 `sessionStorage` 迁移）。

**做什么**：照需求文档 M7-A「要做什么」§1～§5 逐条实现。要点复述（细节以需求文档为准）：

1. `subscribeEvents` 改签名为接收 `EventStreamCallbacks`（`onEvent` / `onOpen` / `onClose(reason)` / `onHeartbeat`）。
2. **心跳探测必须做在 `reader.read()` 的字节层**——Host 的 `:\n\n` 块里没有 `data:` 行，现有 `pump()` 的 handler 分支根本不会被调用。这是本卡最容易做错的一处。
3. 主动 `cancel()`（调用方 dispose）**不得触发 `onClose`**，用 `cancelled` 标志区分；否则切表、卸载都会误报掉线。
4. `api()` 在 `fetch` 本身 reject 时抛 `HostApiError("NETWORK_UNREACHABLE", ...)`；HTTP 层的业务错误码不动。
5. 导出 `createLivenessWatchdog({ timeoutMs, onDead })`，`SSE_LIVENESS_TIMEOUT_MS = 5000`（具名常量 + 注释指向 `server.py:422-426`）；`onDead` 只调一次，`feed()` 复活。
6. 退避重连 `1s → 2s → 5s → 10s → 10s…`，成功走 `onOpen`；重连期间不刷数据、不动草稿；每次失败只写一条 console。
7. `readToken` 的 `sessionStorage` 改走 `safeStorage("session")`（§2 硬约束：`editor/src/**` 不得裸用 storage）。
8. `draftSession.ts` 的 `subscribe` 透传回调并补 `.catch(() => cb.onClose?.("error"))`。

**明确不做**：不改 Host；不改 `phaseView.ts`（掉线分支已经对了）；不在本卡碰 `App.tsx`（主 loop 接线）。

**测试（TDD，先 RED）**：`client-sse.test.ts` 用假 `fetch` + 可控 `ReadableStream`，覆盖：建流成功 → `onOpen`；收到 `:\n\n` → `onHeartbeat` 且 **不** 调 `onEvent`；收到真事件 → `onEvent` 且也 `onHeartbeat`；流 `done` → `onClose("ended")`；`read()` throw → `onClose("error")`；`fetch` reject → `onClose("error")` 且 promise 不 reject 给调用方；**主动 dispose → 不调 `onClose`**；看门狗超时触发一次、`feed()` 后可再次触发；退避序列取值正确；`api()` 在 `fetch` reject 时抛 `NETWORK_UNREACHABLE`。

**只跑**：`pnpm vitest run tests/client-sse.test.ts`。

**验收对应**：M7-A S01 S02 S04（S03 与端到端断言在 Task 10 + 接线点 1）。

## Task 4 · C1 header-projection（M7-C 投影半 · T0）

**目标**：列头看得懂、不折行。

**独占文件**：`editor/src/spreadsheet/projection.ts`、`editor/tests/projection.roundtrip.test.ts`。

**Consumes**：需求文档 **M7-C**；Task 1 的 `COPY.columnType` / `COPY.visibility` / `COPY.grid.fullColumnName` 签名（并行开发时按签名写，合入后自然接上）。

**做什么**：照需求文档 M7-C「要做什么」§1、§2、§4：

1. `headerText`（`:177-183`）第二行中文化：类型走 `COPY.columnType`（未知类型**回落原字面量，不得抛**），可见性走 `COPY.visibility`（多字母如 `SCV` 逐字符展开后用 `·` 连接，未知字符原样保留）。第一行的 `*` 与 `🔒` 不动。`ref` 列维持 `ref→<目标表>`（`columnTypeLabel` 不改）。
2. 列宽：把 `:383` 的三元式换成 `columnWidth(column)` = `clamp(112, ceil(firstLineWidth * 8) + 34, 240)`，`firstLineWidth` 按 **CJK 计 2、ASCII 计 1**。`id` 列下限保持 110。**目标：`cooldown_frames *` 在默认缩放下单行不折。**
3. `headerTitleText`（`:186-207`）最前面加一行 `COPY.grid.fullColumnName(column.name)`，其余不动。

**明确不做**：不改列头行高 36 与 `WrapStrategy.WRAP`（自适应之后仍要 WRAP 兜底超长列名）；不加 `description`（需求文档 M7-C「后续」）；不碰 `STYLES` 色值。

**测试**：`projection.roundtrip.test.ts` **既有 19 条必须全绿**（含 10k×50 fixture 回环、「徽标不进 v / token」两条守卫）；新增：`headerText` 对 `skills.damage` 得 `damage *\n整数 · 服务端`、对 `skills.id` 得 `id * 🔒\n整数 · 服务端·客户端·体素`、未知类型/未知可见性字符回落；`columnWidth` 三条边界（超短取 112、`cooldown_frames` 结果 > 该串单行所需宽度、超长取 240）。

**只跑**：`pnpm vitest run tests/projection.roundtrip.test.ts`。

**验收对应**：M7-C S01 S02 S04。

## Task 5 · K1 storage-injection（M7-K 全卡 · T0）

**目标**：把 24 条红测试修绿，并让它不再复发。

**独占文件**：`editor/package.json`、`editor/src/panels/TableList.tsx`、`editor/tests/TableList.test.tsx`、`editor/tests/GridToolbar.test.tsx`、`editor/tests/no-bare-localstorage.test.ts`（新）。

**Consumes**：需求文档 **M7-K 全节**（含根因定位过程，先读）；Task 2 的 `safeStorage` / `isStorageFallback` 签名。

**做什么**：

1. `package.json:7-9` 的 `engines.node` 从 `">=22"` 改为 `">=22 <26"`。
2. `TableList.tsx:31-36` 的 onboarding 读写改走 `safeStorage("local")`；`isStorageFallback("local")` 为真时**退化为每次都提示**（不崩、不静默吞）。
3. `TableList.test.tsx:64,171,185` 与 `GridToolbar.test.tsx:81` 不再裸用 `localStorage`——`GridToolbar` 自己根本不用 storage（grep 零命中），那句 `afterEach` 的 `localStorage.clear()` **直接删掉**；`TableList` 的改用 `safeStorage("local").clear()`。
4. 新增 `no-bare-localstorage.test.ts`：扫描 `editor/src/**` 断言不出现裸 `localStorage.` / `sessionStorage.`。**白名单**：`src/app/storage.ts`（实现本身）、`src/spreadsheet/viewState.ts`（已用注入形参写法，是正确范例）。**注意 `src/api/client.ts` 的 `sessionStorage` 由 Task 3 同期迁移**——若本卡自检时它还没合入，把该文件也临时列进白名单并在报告里注明，主 loop 收口时删掉这行。

**明确不做**：不升级 vitest / jsdom；**不在 `vitest.config.ts` 加全局 setup 去 monkey-patch `globalThis.localStorage`**——那是把问题藏进测试环境，源码里的裸用法在真实浏览器隐私模式下仍会炸；不动 `viewState.ts`。

**测试**：`pnpm vitest run tests/TableList.test.tsx tests/GridToolbar.test.tsx tests/no-bare-localstorage.test.ts` —— **24 条红全部转绿**是本卡的硬判据。另加一条 onboarding 在垫片模式下每次都提示的单测。

**验收对应**：M7-K S01～S04。**交回必须附 `node --version` 与完整的 `Test Files` / `Tests` 两行输出。**

## Task 6 · H1 host-contract（Host 契约 · T0）

**目标**：Host 侧一次把三张卡要的会话契约扩展做掉，避免三张卡抢同一个文件。

**独占文件**：`src/lumio_config/editor/session.py`、`src/lumio_config/editor/settings.py`、`tests/test_editor_server.py`。

**Consumes**：需求文档 M7-D §1、M7-F §3、M7-G §4。

**Produces（逐字）**：

- `session.py:158-170` 表摘要每项加 `"sourcePath": f"tables/{name}.txt"`（与既有 `schemaPath` 同款：仓库相对路径、POSIX 分隔符、**不含绝对路径**）。
- `session.py:180` `"export"` 值改为 `["csv", "tsv", "txt"]`。
- `session.py:177-183` capabilities 加 `"reveal": <bool>`，值取自 `self.settings.allow_reveal`。
- `settings.py` 的 `Settings` 加 `allow_reveal: bool`，**默认 `False`**；`as_public()` 不泄露它以外的新字段。

**明确不做**：不实现导出 txt 的实际逻辑（Task 8）；不实现 reveal 端点与 CLI 开关（Task 16）；不碰 `server.py`。

**测试**：`tests/test_editor_server.py` 扩展——session payload 含 `sourcePath` 且格式正确、不含绝对路径；`capabilities.export == ["csv","tsv","txt"]`；`capabilities.reveal` 默认 `False`；`Settings` 默认值与 `as_public()` 不回归。

**只跑**：`/usr/local/bin/python3.11 -m unittest tests.test_editor_server -v`。

**验收对应**：M7-D S01、M7-F S03（capabilities 部分）、M7-G S01（capabilities 部分）。

## Task 7 · H2 source-endpoint（M7-E Host 半 · T0 · 安全面）

**目标**：一个只读、只能读两个固定前缀、九种攻击入参都拒得掉的源文件端点。

**独占文件**：`src/lumio_config/editor/source_view.py`（新）、`tests/test_editor_source_view.py`（新）。

**Consumes**：需求文档 **M7-E §1、§2 全文**；`src/lumio_config/editor/history.py:12,113-133`（**自注册路由的现成范例，照抄这个模式，不要改 `server.py`**）；`server.py:33 _valid_table`、`:441-447 _static` 的越界兜底、`:297-303 _export_dir` 的同款兜底、`:150-164 _authorize_api`。

**Produces**：

```
GET /api/tables/{table}/source?kind=table|schema
→ 200 { "table","kind","path","text","bytes" }
→ 400 BAD_REQUEST（kind 非法）
→ 403 FORBIDDEN（resolve 后越界）
→ 404 UNKNOWN_TABLE（表未加载）/ NOT_FOUND（文件不存在）
→ 413 PAYLOAD_TOO_LARGE（> 2 MiB）
```

**四道安全边界，一道都不能省**（细节见需求文档 M7-E §1）：`_valid_table` 表名校验 → `kind` 闭合枚举映射到两个**写死**的前缀（`root/"tables"/f"{t}.txt"`、`root/"schemas"/f"{t}.json"`）→ `resolve()` + `relative_to(root)` 兜底 → 只放行 `host.session.table_projection(table) is not None` 的表。

**鉴权：零新代码。** 端点在 `/api/` 前缀下，`server.py:168-171` 在分发到 `_EXTRA_ROUTES` **之前**已跑过 `_authorize_api()`。**不得在本卡另写鉴权**，那只会引入第二套口径。

**明确不做**：不实现写回（撞 `docs/decisions/0-1` §2）；不做语法高亮；不缓存内容；不碰 `server.py`。

**测试（TDD，先 RED）**：`tests/test_editor_source_view.py` —— S01 两种 `kind` 内容与磁盘**逐字节一致**；**S02 九条边界各一条用例**：`..`、URL 编码的 `%2e%2e%2f`、绝对路径、非法 `kind`、未知表、存在但未加载的表、无 token、错 token、非 loopback 的 `Host` 头，全部按上表返回对应码，且**任何一条都不得读到 `tables/` 与 `schemas/` 之外的字节**；超 2 MiB 走 413。

**只跑**：`/usr/local/bin/python3.11 -m unittest tests.test_editor_source_view -v`。

**验收对应**：M7-E S01 S02。**交回必须逐条列出九条边界的实际命令与响应。**

## Task 8 · H3 export-txt（M7-F Host 半 · T0）

**目标**：导出多一个 TXT 格式，且它和 `tables/*.txt` 逐字节一样。

**独占文件**：`src/lumio_config/editor/export_csv.py`、`tests/test_editor_export.py`。

**Consumes**：需求文档 **M7-F 全节**（含"为什么不需要架构仓立卡"的论证）；`src/lumio_config/text_table.py:105 format_table_text(table)`（**权威格式化器，直接调，不要另写一份**）。

**做什么**：照需求文档 M7-F「要做什么」§1、§2、§5、§6：

1. `:96` 枚举加 `"txt"`。
2. `txt` 分支不走 `csv.writer`，调 `format_table_text`，文件名 `<table>.txt`。
3. `README.txt`（`:163`）增段：TXT 是**只读快照**，不能拷回 `tables/` 覆盖。
4. `source=draft` 时文件名改 `<table>.draft.txt`，`README.txt` 单列一段"含未提交草稿，与仓库不一致"。**这是本卡最重要的防呆**——一个长得完全像源表的文件被误当权威源提交，是本卡的最大风险。
5. **`targets` 非空 + `format=txt` → 抛 `ValueError`**（端点会转成 400）。这是 §7 Owner 闸门的选项 A；未勾选就按 A 做，并在报告里标注该假设。

**明确不做**：不做回导（撞 `docs/decisions/0-1` §2）；不改 CLI `lumio_config.py export`（那是架构仓契约的产物导出）；不改 `format_table_text` 本身；不碰 `session.py`（Task 6）。

**测试**：`tests/test_editor_export.py` 扩展 —— S01 `format=txt, source=repo` 的产物与 `tables/<t>.txt` **字节比较相等**（含换行符与行间空行）；S02 四态 token（`@missing` / `""` / `null` / `@default`）原样保留、不被转义不被求值；S03 `source=draft` 产出 `.draft.txt` 且 README 含警告；S04 `targets=["S"] + txt` 抛 `ValueError`。

**只跑**：`/usr/local/bin/python3.11 -m unittest tests.test_editor_export -v`。

**验收对应**：M7-F S01 S02 S04。**交回附 `diff <(cat <导出目录>/skills.txt) tables/skills.txt` 的实际输出（应为空）。**

## Task 9 · J1 sdd-return-discipline（M7-J 全卡 · T0 · 纯文档）

**目标**：让下一轮审计不用再重建一遍全部证据。

**独占文件**：`.sdd/README.md`（新）、`.sdd/.gitignore`、`.sdd/m6-{f,g,h,i,j,k}-return.md`（新 ×6）、`.spec/knowledge/standards/dispatch.md`、`.spec/knowledge/lessons.md`、`editor/docs/a11y-checklist.md`。

**Consumes**：需求文档 **M7-J 全节**；`docs/reviews/2026-09-04-editor-v3-completion-audit.md` 的 §A（Task 1–20 对账）、§B（S 项复核）、§0.1（门槛证据）——**六份交回物的内容从这里回填**。

**做什么**：按需求文档 M7-J §1～§5。落点按 **Owner 闸门 A**（未勾选即按 A）：交回物落 `docs/reviews/`，`.sdd/` 维持整目录 gitignore、降级为纯临时区；`.sdd/README.md` 用 `!README.md` 让自己入库。

**红线：不要编造。** 六份交回物的每条证据必须指向审计报告的具体节或一条可复跑的命令；文首**必须**有一行「本文为事后补记，证据来自 2026-09-04 审计实跑，非当时收口现场记录」。凡审计没查过的，写「未复核」，**不要填看起来合理的内容**。

**测试**：`node <插件目录>/tools/spec-lint.mjs .` 通过；`git ls-files .sdd/` 能查到 `README.md`。

**验收对应**：M7-J S01～S04（S04 含 a11y 清单 `[~]` 口径修正）。

## Task 10 · A2 offline-e2e（M7-A 验收 · T1）

**目标**：用真实的 kill / restart 把 P1 修复钉死。

**独占文件**：`editor/tests/e2e/host-offline.spec.ts`（新）。

**Consumes**：需求文档 **M7-A 验收项 S01/S03/S04**；`editor/tests/e2e/host-drafts.spec.ts:185`（"Host restart restores the draft"，**已经做过一次 Host 重启，照它的写法**）。

**做什么**：一条完整旅程 —— 起 serve → 断言 `status-online` 为在线 → **kill Host 进程** → 断言 **≤ 8 秒**内 `status-online` 变离线、胶囊变红、`[role="alertdialog"]`（`Blocked`）出现、表格锁定 → 点侧栏切表 → 断言**没有** `Failed` 胶囊、**没有**「提交失败」文案、`page.on('pageerror')` 零捕获 → 重新起同端口同 token 的 serve → 断言 **≤ 12 秒**内回到在线且草稿还在。

**注意**：`Blocked` 是 `role=alertdialog`，用它定位而不是 CSS 类；耗时断言要打印实际值供交回物引用。

**只跑**：`PYTHON=/usr/local/bin/python3.11 pnpm exec playwright test tests/e2e/host-offline.spec.ts`。

**验收对应**：M7-A S01 S03 S04。

## Task 11 · B1 errors-e2e（M7-B 验收 · T1）

**目标**：把"还原后错误不消"钉死，顺带补上审计 E-4 的跳格残留。

**独占文件**：`editor/tests/e2e/host-errors.spec.ts`（新）。

**Consumes**：需求文档 **M7-B 验收项 S01/S04**；审计 §C-4/§C-5/§C-8 的实走步骤（可直接复用那条路径）。

**做什么**：

- S01：打开 `skills` → 检查器把 `damage`（必填、无默认）设为 null → 预检 → 断言 `tab-errors` 含 1 → 点检查器「还原」→ 断言 `status-phase` 的 `title` 为 `ReadyClean`、`tab-patch` 为 0、**`tab-errors` 为 0 且无 danger tone**。
- S04：同一条错误项点击 → 断言 Univer 选区落到对应行列（用 `window.__lumioPoc` 读当前选区，或断言检查器标题变成该行该列）。
- 反向：`ReadyDirty` 且预检失败时错误**仍在**（不误清）。

**只跑**：`PYTHON=/usr/local/bin/python3.11 pnpm exec playwright test tests/e2e/host-errors.spec.ts`。

**验收对应**：M7-B S01 S04（同时关掉审计残留 E-4）。

## Task 12 · C2 toolbar-legend（M7-C 前端半 · T1）

**目标**：S/C/V 有个常驻的、键盘够得着的图例。

**独占文件**：`editor/src/panels/GridToolbar.tsx`、`editor/tests/GridToolbar.test.tsx`。

**Consumes**：需求文档 M7-C §3；Task 1 的 `COPY.grid.visibilityLegend*`；既有 `components/ui/Dialog`（焦点陷阱 / Esc / 焦点还原都已具备）。

**做什么**：在工具栏右侧现有的「N 列 · 排序 / 筛选只影响视图」提示**之前**，加一段可点图例 `S 服务端 · C 客户端 · V 体素`，点击弹 `ui/Dialog` 展开完整说明（`COPY.grid.visibilityLegendBody`，须含「某列第一次标 C 需要过生产激活单」这层含义）。图例文本用 `--color-text-muted`，视觉上**不得压过**列数提示。键盘可达：Tab 可聚焦、Enter 打开、Esc 关闭。

**明确不做**：不改工具栏既有 10 个按钮的行为与 testid；不写十六进制色。

**测试**：`GridToolbar.test.tsx` —— 图例渲染、点开对话框、Enter 打开、Esc 关闭、焦点还原；**既有 13 条（Task 5 修绿后的基线）保持全绿**。

**只跑**：`pnpm vitest run tests/GridToolbar.test.tsx`。

**验收对应**：M7-C S03。

## Task 13 · D2 topbar-paths（M7-D 前端半 · T1）

**目标**：用户在界面里能看到并复制表对应的源文件路径。

**独占文件**：`editor/src/panels/TopBar.tsx`、`editor/tests/TopBar.test.tsx`。

**Consumes**：需求文档 M7-D §3、§4；Task 2 的 `SessionTableSummary.sourcePath`；Task 1 的 `COPY.paths.*`；`panels/StatusBar.tsx` 的指纹复制实现（**同款交互，照抄**：`navigator.clipboard.writeText` + `useToast`）。

**做什么**：表名 `⌄` 菜单（既有 `ui/Menu`）加两条只读条目 —— `源文件 tables/skills.txt` 与 `Schema schemas/skills.json`，**单独成组**、与切表项之间有分隔；点击 = 复制路径 + toast「已复制路径」。另外把 `status-table` 的 `title` 改为 `<表名> · tables/<表名>.txt`。

**明确不做**：不显示绝对路径、不显示仓库根；不做"点击打开文件"（那是 Task 15）；不改 `top-revision` 的现有渲染（`:35-39,290`，它是对的）。

**测试**：`TopBar.test.tsx` —— 两条目文本与传入的 `sourcePath` / `schemaPath` 逐字一致；点击调用 `navigator.clipboard.writeText`（spy）且参数正确；toast 出现；`status-table` 的 `title` 断言；**既有 13 条保持全绿**。

**只跑**：`pnpm vitest run tests/TopBar.test.tsx`。

**验收对应**：M7-D S02 S03 S04。

## Task 14 · F2 export-tab-txt（M7-F 前端半 · T1）

**目标**：导出下拉多一项 TXT，并且用户一眼知道它不能拷回去。

**独占文件**：`editor/src/panels/drawer/ExportTab.tsx`、`editor/tests/ExportTab.test.tsx`、`editor/tests/e2e/host-export.spec.ts`。

**Consumes**：需求文档 M7-F §4；Task 1 的 `COPY.export.formatTxt` / `txtNote` / `txtDraftNote`；Task 6 的 `capabilities.export` 含 `"txt"`；Task 8 的 Host 行为。

**做什么**：

1. `:16,102` 的类型从 `"csv" | "tsv"` 扩到 `"csv" | "tsv" | "txt"`；`:165-166` 加第三个 `<option>`。**格式列表优先从 `capabilities.export` 渲染**，而不是写死三项（Host 说了算）。
2. 选中 TXT 时，在现有 `COPY.export.exportNote` 之外**再显示** `COPY.export.txtNote`；`source=draft` + TXT 时**追加** `COPY.export.txtDraftNote`。
3. 选中 TXT 时**禁用目标列选择器**并给 `disabledReason`（Owner 闸门选项 A：TXT 只出全列）。

**明确不做**：不改 `btn-export` / `export-format` / `export-source` / `export-target` / `export-link` 五个 testid（E2E 依赖）。

**测试**：`ExportTab.test.tsx` —— 三个选项从 capabilities 渲染、TXT 选中时两段文案出现、draft + TXT 时第三段出现、TXT 时目标列禁用且有原因；**既有 6 条保持全绿**。`host-export.spec.ts` 增一条：选 TXT → 导出 → 下载 `export-link` → 断言内容与 `tables/skills.txt` 一致。

**只跑**：`pnpm vitest run tests/ExportTab.test.tsx` + `PYTHON=/usr/local/bin/python3.11 pnpm exec playwright test tests/e2e/host-export.spec.ts`。

**验收对应**：M7-F S03。

## Task 15 · E2 tablelist-source-view（M7-E 前端半 · T2 · 安全面）

**目标**：右键表名能看源文件和 Schema。

**独占文件**：`editor/src/api/client.ts`（**仅**加 `sourceFile`，不动 Task 3 落下的 SSE 逻辑）、`editor/src/panels/TableList.tsx`、`editor/src/panels/SourceViewDialog.tsx`（新）、`editor/tests/TableList.test.tsx`、`editor/tests/SourceViewDialog.test.tsx`（新）、`editor/tests/e2e/host-source-view.spec.ts`（新）。

**Consumes**：需求文档 **M7-E §3、§4、§5**；Task 7 的端点；Task 2 的 `SourceFileResponse`；Task 1 的 `COPY.sourceView.*` / `COPY.tableMenu.*`；既有 `components/ui/Menu`（11 条单测）与 `ui/Dialog`。

**做什么**：

1. `api/client.ts` 加 `sourceFile(table: string, kind: "table" | "schema"): Promise<SourceFileResponse>`，走既有 `api<T>()`。本卡在 T2 开工，Task 3 的 SSE 改动早已合入，**该文件此刻无并行方**——但只准加这一个导出，Task 3 落下的 SSE / 看门狗 / 退避逻辑一行都不许动。
2. `TableList.tsx` 加 `onContextMenu`，**同时保留键盘入口**（`Shift+F10` 与 `ContextMenu` 键），复用 `ui/Menu`。三个菜单项见需求文档 M7-E §4 的表；第三项在 `capabilities.reveal !== true` 时**整项不渲染**（不是渲染成禁用——那会暗示用户去开开关）。
3. `SourceViewDialog.tsx`：`ui/Dialog`，宽 720，等宽字体，带行号的只读 `<pre>`，可全选复制，右上「复制全文」+ toast；**显著位置**放 `COPY.sourceView.readOnlyNote`。加载中 / 过大（413）/ 失败三态各有文案。

**明确不做**：**不做编辑**（撞 `docs/decisions/0-1` §2）；不做语法高亮（不引依赖）；不缓存内容；不实现 reveal 的实际调用（Task 16 的 Host 端点存在时才通，本卡只负责菜单项与按 capability 隐藏）。

**测试**：`SourceViewDialog.test.tsx` —— 三态渲染、只读提示在位、复制全文、Esc 关闭、焦点还原。`TableList.test.tsx` —— 右键出菜单、`Shift+F10` 出菜单、↑↓ Enter Esc、`capabilities.reveal=false` 时第三项不渲染、`=true` 时渲染；**Task 5 修绿后的既有 11 条保持全绿**。`host-source-view.spec.ts` —— 右键 → 查看源文件 → 断言内容含 `tables/skills.txt` 的真实首行。

**验收对应**：M7-E S03 S04。

## Task 16 · G1 host-reveal（M7-G 全卡 · T2 · ⚠ 需 Owner 授权 · 安全面）

> **闸门**：§7 的 reveal 授权未勾选则**本卡不扇出**。Task 15 不受影响（菜单第三项按 capability 隐藏，功能完整）。

**目标**：在用户显式开启后，能从编辑器跳到文件管理器。

**独占文件**：`src/lumio_config/editor/reveal.py`（新）、`src/lumio_config/editor/server.py`、`src/lumio_config/cli.py`、`tests/test_editor_reveal.py`（新）。

**Consumes**：需求文档 **M7-G 全节**；`src/lumio_config/editor/vcs.py` 的 `ALLOWED_COMMANDS` 纪律（argv 列表 / `shell=False` / `cwd=root`）；`history.py` 的自注册路由模式；Task 6 的 `Settings.allow_reveal` 与 `capabilities.reveal`。

**做什么**：照需求文档 M7-G §1～§5。三条红线复述：

1. **端点绝不接受路径参数。** body 只有 `table` + `kind`，路径由 Host 按两个写死前缀自己拼；`_valid_table` + `resolve()` + `relative_to(root)` 三道兜底照抄 Task 7。**任何形式的"传路径进来"都是本卡的红线。**
2. **argv 列表 + `shell=False` + 平台模板写死三条**（macOS `["open","-R",path]` / Windows `["explorer", f"/select,{path}"]` / Linux `["xdg-open", str(path.parent)]`），其他平台 403 `REVEAL_UNSUPPORTED`；`Popen` 后立即返回 204，不读输出不等返回码。
3. **默认关**：`Settings.allow_reveal` 默认 `False`（Task 6 已建字段），本卡加 CLI `serve --allow-reveal` 开关；关着时返回 403 `REVEAL_DISABLED` 且**不执行任何子进程**。

**明确不做**：不打开 IDE / 编辑器；不做"打开终端到该目录"；关着时不把菜单项渲染成禁用态（前端已按 capability 整项不渲染）。

**测试（全程 mock `subprocess.Popen`，绝不真的拉起文件管理器）**：`tests/test_editor_reveal.py` —— S01 默认关时 403 且 `Popen` **零调用**；S02 三平台 argv **逐字断言** + `shell=False` + 绝对路径正确；**S03 六条注入用例**（body 传 `path` / 传 `cmd` / `../` / 绝对路径 / 未知 `kind` / 未知表）全部拒绝且 `Popen` 零调用；S04 `serve --help` 含开关说明。

**只跑**：`/usr/local/bin/python3.11 -m unittest tests.test_editor_reveal -v`。

**验收对应**：M7-G S01～S04。**交回必须逐条列出 S03 六条注入用例的实际输出。**

## Task 17 · F3 docs-and-static（主 loop 自做 · T3 · 串行最后）

**目标**：文档、生成物、截图收口。

**文件**：`docs/reference/editor.md`、`.spec/knowledge/features/web-editor-ux.md`、`src/lumio_config/editor_static/`（`cd editor && pnpm build` 重建并提交）、`editor/docs/screens/*.png`。

**做什么**：

1. `docs/reference/editor.md`：加「离线与重连」段（M7-A 的用户口径：什么时候会看到阻断页、怎么恢复）；导出段加 TXT 与"只读快照不可回导"；加「查看源文件」段；若 Task 16 做了，加 reveal 段（默认关、怎么开、**为什么默认关**）；错误码速查表补 `NETWORK_UNREACHABLE` / `REVEAL_DISABLED` / `PAYLOAD_TOO_LARGE` / `TABLE_EXISTS`（若有）。
2. `.spec/knowledge/features/web-editor-ux.md`：列头中文化与图例、源文件查看器进设计现状；`status` 字段按 spec-steward 口径维护。
3. 截图重出：1440×900 默认态（要能看清 `cooldown_frames` **不折行**与 S/C/V 图例）、抽屉展开态、**新增一张离线阻断页**。
4. 全量收口门槛（§6）全绿 → `pnpm build` → `git diff -- src/lumio_config/editor_static` 非空即为本次重建 → 提交。
5. 出一份 §8 交回物。

**验收对应**：M7-F/M7-G 文档段；本轮整体收口。

## Task 0 · 文件结束标记（无内容）

（本节只为让 `task-brief` 在 Task 17 处正确截断，不含任务。）

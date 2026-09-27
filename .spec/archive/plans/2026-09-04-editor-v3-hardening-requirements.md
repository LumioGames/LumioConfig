---
status: pending
---

# 网页编辑器 v3 · 加固与补齐 需求文档（2026-09-04）

> 本文是**需求正文**，不是实现计划。派活提示词见 `.spec/plans/2026-09-04-editor-v3-hardening-dispatch-prompt.md`。
>
> 来源：`docs/reviews/2026-09-04-editor-v3-completion-audit.md`（v3 完成度审计）§E known gaps 复核 + §F.2 需求卡清单 + Owner 2026-09-04 关切 D1～D6。
>
> **卡号说明**：`M7-A`～`M7-K` 是本仓内部编号，用于派活与交回引用。**Workflow 卡号由 Owner 立卡时分配**，立卡后在本文对应卡的「Workflow 卡号」一行回填 `R-000xx`；本文与 Workflow 不一致时以 Workflow 卡正文为准并上报。

---

## 0. 本轮范围与不做什么

**做**：把 v3 审计查实的 1 条 P1、1 条 P2 缺陷修掉，把 Owner 的 D1／D2／D4／D5 四条关切落地，并补两项工程债。

**不做（本轮明确排除）**：

- 不改 `docs/decisions/0-1`～`0-8`（架构仓镜像 ADR，本仓无改写权）。
- 不改 `.spec/decisions/0003`～`0008`。
- 不动 `tables/`、`schemas/`、`registry/` 的内容。
- 不实现「表里写公式」。审计 §D6 已查实：公式持久化由 `docs/decisions/0-7:50` 明令禁止，输入端已在 `interceptors.ts:181,197` 拦截并剥离，**不存在"导出丢公式"的场景**。若 Owner 要派生值，正确路径是架构仓新开「派生列 / 编译期表达式」ADR，本仓不得先发明表达式语法。
- 不做 Excel 双向同步（`docs/decisions/0-1`「明确不做」）。

**优先级口径**：P1 = 用户会撞上且当前无解；P2 = 用户会撞上但有绕法或只是难用；P3 = 需要前置决策才能开工。

## 0.1 落单状态（2026-09-04 已完成）

本文 11 张卡已全部落到 Workflow **项目 LumioGamesEngine / 需求室 RM-00009 LumioConfig**，蓝图标记
`workflow-plan:lumioconfig-m7-editor-hardening-20260904/r1/<卡号>`，每张带 4 条结构化验收项（S01–S04）。

落单时按 Workflow 规划规程做了**两处调整**，本文随之更新：

1. **新增第 12 张卡 `M7-X`**（[R-00395](https://lumiogamesengine.workflow.games/requirements/01a06ae1-442a-75a1-b7f2-7411ffac033e)，见 §M7-X）。`copy.ts` / `types.ts` / `storage.ts` 是 M7-A/C/D/E/F/K 六张卡的共享热点，不冻结成 wave 0 的独立契约卡，六个 Agent 会在同三个文件上互相覆盖；接口冻结必须先于一切消费卡，这是规划规程的硬闸门。
2. **M7-H / M7-I 改造为 `[预研]` 决策卡**。原验收项含「具体断言待闸门解除后补」这类未决占位，落单模板禁止带占位的卡进入执行队列。两卡重塑为**交付决策结论本身**：带时间盒（3 天 / 2 天）、决策人、停止阈值、以及「拿不到回话就写未获回话、不许推测」的红线。对应的实现卡等结论出来后按新蓝图修订再落。

**依赖拓扑**：最长依赖链 4 张（`M7-X → M7-K → M7-E → M7-G`），并行宽度 5，Owner 已确认接受。
波次：`[M7-X, M7-B, M7-J, M7-H, M7-I] → [M7-A, M7-D, M7-F, M7-K] → [M7-C, M7-E] → [M7-G]`。
线上已写入 10 条需求引用边（7 条 `interface` 指向冻结物，3 条 `implementation` 为共享可变文件序列化）。

## 0.1 卡索引

| 卡 | 标题 | 优先级 | 归属 | 前置 | Workflow 卡号 |
| --- | --- | --- | --- | --- | --- |
| M7-A | 掉线态真正可感知 | **P1** | 本仓 | 无 | [R-00396](https://lumiogamesengine.workflow.games/requirements/01a06ae1-4445-7595-b0c6-c37e712856d9) |
| M7-B | 错误页签状态收敛 | P2 | 本仓 | 无 | [R-00397](https://lumiogamesengine.workflow.games/requirements/01a06ae1-44e0-71e4-b095-610de4a791af) |
| M7-C | 列头可读性（S/C/V 图例 + 中文化 + 列宽） | P2 | 本仓 | 无 | [R-00394](https://lumiogamesengine.workflow.games/requirements/01a06ae1-42fc-7449-9193-6234a0f4757b) |
| M7-D | 源文件与 Schema 路径可见 | P2 | 本仓 | 无 | [R-00398](https://lumiogamesengine.workflow.games/requirements/01a06ae1-5696-7d3e-852c-5b0f2c974dc9) |
| M7-E | 源文件只读端点 + 表列表右键查看 | P2 | 本仓 | 无 | [R-00399](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7032-7584-965b-0e79cc8082b4) |
| M7-F | 导出支持权威文本格式 TXT | P2 | 本仓 | Owner 拍板 §M7-F.4 一条 | [R-00400](https://lumiogamesengine.workflow.games/requirements/01a06ae1-76dc-7d2a-b0b9-638d3267b088) |
| M7-G | 在资源管理器中显示（reveal） | P3 | 本仓 | **Owner 授权** | [R-00401](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7f07-76d3-a024-4fabe3f4e8e7) |
| M7-H | 编辑器内建新表 | P3 | 本仓（前置架构仓） | **架构仓回话** | [R-00404](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8f2e-787a-a1b7-9cf7eaacc007) |
| M7-I | 导入降级为补丁草案 | P3 | 本仓（前置 Owner） | **Owner 拍板** | [R-00405](https://lumiogamesengine.workflow.games/requirements/01a06ae1-963a-7e51-b59e-60717d9a45fc) |
| M7-J | `.sdd/` 交回物制度补课 | P2 | 本仓 | 无 | [R-00402](https://lumiogamesengine.workflow.games/requirements/01a06ae1-837f-7897-96af-4f9c7f90f8ce) |
| M7-K | Node 版本上界与 storage 注入 | P2 | 本仓 | 无 | [R-00403](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8aa0-763e-b67d-b53c11f00e93) |

**M7-G / M7-H / M7-I 三张卡在前置条件解除前不得开工**，见各卡「开工闸门」。

---

## M7-A · 掉线态真正可感知

- 优先级：**P1**（本轮唯一 P1）
- 归属：本仓 · 前端为主，Host 无改动
- Workflow 卡号：[R-00396](https://lumiogamesengine.workflow.games/requirements/01a06ae1-4445-7595-b0c6-c37e712856d9)

### 背景（审计查实）

`phaseView.ts:59-68` 早就写好了完整的掉线派生态——红色胶囊、`COPY.banner.offline` 横幅、`gridLocked: true`、四个 `can` 全 false；`panels/Blocked.tsx` 的整页阻断页也做好了并有 9 条单测；`App.tsx:1745` 挂了 `hostMode && !state.online && phase !== "Opening"` 的渲染条件。

**但没有任何代码把 `online` 置为 false。** 逐处查实：

- `grep -n "online" editor/src/app/App.tsx` → `dispatch({ type: "online", online: true })` 只出现在 `App.tsx:536` 与 `:794`，**全仓无一处派发 `online: false`**。
- `editor/src/api/client.ts:83-110`：SSE 的 `pump()` 在 `reader.read()` 返回 `done` 时只 `break` 跳出循环，**没有任何回调通知调用方**。
- `editor/src/api/draftSession.ts:51-56`：`void subscribeEvents(handler).then((dispose) => {...})` **没有 `.catch`**，连接建立失败也被静默吞掉。
- `state.ts:43` 初值 `online: false`，所以 `Blocked` **只在"首次就没连上"时可达**；"连上后再断线"永远到不了。

实走复现（审计 §C-10，`serve --port 8851` → `kill`）：

- 杀掉 Host 后 25 秒，`status-online` 仍是「在线」、胶囊仍是 `ReadyClean`、无 `Blocked`。
- 再点侧栏切表 → phase 变 `Failed`，胶囊显示红字「**提交失败**」——用户从头到尾没点过提交，文案完全错配（`App.tsx` 的 catch 统一 `dispatch({type:"failed"})`）。
- 一次复现中还观测到未捕获异常 `Error: extractTokens requires a workbook snapshot or Univer instance` 导致整页白屏。

**有利条件**：Host 端 `src/lumio_config/editor/server.py:422-426` 的 SSE 循环**每 1 秒发一次 `:\n\n` 心跳注释**（`Empty` 超时分支）。前端已经有一条现成的 1 秒存活信号，只是没用。注意心跳块里没有 `data:` 行，现有 `pump()` 不会调 `handler`，所以**存活探测必须做在 `reader.read()` 的字节层，不能做在 handler 层**。

### 要做什么

1. **`client.ts` — `subscribeEvents` 增加生命周期回调。** 签名改为：

   ```ts
   export interface EventStreamCallbacks {
     onEvent(name: string, data: unknown): void;
     /** 首次成功建立流（HTTP 200 且拿到 body）时调用一次。 */
     onOpen?(): void;
     /** 流结束或出错时调用一次；reason 用于日志与测试断言，不进用户文案。 */
     onClose?(reason: "ended" | "error" | "stale"): void;
     /** 收到任意字节（含 `:` 心跳）时调用，供调用方喂看门狗。 */
     onHeartbeat?(): void;
   }
   export function subscribeEvents(cb: EventStreamCallbacks): Promise<() => void>;
   ```

   - 建流失败（`!response.ok || !response.body` 或 `fetch` reject）→ `onClose("error")`，**不再抛给调用方吞掉**。
   - `pump()` 的 `done` 分支 → `onClose("ended")`；`reader.read()` throw → `onClose("error")`。
   - 每次 `reader.read()` 返回非空 `value` → `onHeartbeat()`（心跳注释块也算）。
   - 主动 `cancel()`（调用方 dispose）**不触发** `onClose`——用 `cancelled` 标志区分，避免切表/卸载时误报掉线。

2. **`client.ts` — `api()` 区分"网络不可达"与"业务错误"。** `fetch` 本身 reject（`TypeError: Failed to fetch`，即 Host 进程没了）时，抛 `new HostApiError("NETWORK_UNREACHABLE", ...)`；HTTP 层返回的业务错误码保持现状不变。

3. **`draftSession.ts` — 订阅生命周期不再吞异常。** `DraftSessionProvider.subscribe` 签名改为接受 `EventStreamCallbacks`，`LocalDraftSessionProvider.subscribe` 把回调透传，`subscribeEvents(...)` 后挂 `.catch(() => cb.onClose?.("error"))`。

4. **看门狗（放在 `client.ts`，不放 `App.tsx`）。** 导出 `createLivenessWatchdog({ timeoutMs, onDead })`：`feed()` 重置计时，`timeoutMs` 内没被 feed 过就调一次 `onDead()`（只调一次，直到下次 `feed()` 复活）。**`timeoutMs` 定为 5000**（Host 心跳 1s，留 5 倍余量；写成具名常量 `SSE_LIVENESS_TIMEOUT_MS` 并注释指向 `server.py:422-426`）。

5. **重连（退避）。** `onClose` 后按 `1s → 2s → 5s → 10s → 10s…` 退避重连；重连成功 `onOpen` → 恢复在线。重连期间**不刷新表数据、不动草稿**，只恢复连接。上限不设——用户可能去泡了杯咖啡；但每次失败只写一条 console，不刷屏。

6. **接线（主 loop 做，不进 worker 文件集）。** `App.tsx`：
   - 订阅处改用新回调，`onOpen` → `dispatch({type:"online", online:true})`；`onClose` / 看门狗 `onDead` → `dispatch({type:"online", online:false})`。
   - 所有 `catch` 里，`HostApiError.code === "NETWORK_UNREACHABLE"` → `dispatch({type:"online", online:false})`，**不再落 `failed`**；其余错误维持现状。
   - 掉线时切表：`openTable` 在 `!state.online` 时直接返回并保留当前工作簿，**不得卸载 Univer 实例**（这是白屏的直接成因）。

7. **文案（M7-A 只消费，不新增）。** `COPY.phase.offline`（"无法连接本机服务"）与 `COPY.banner.offline`（"无法连接本机服务。请重新运行 serve，再打开新链接。"）已存在于 `copy.ts:24,41`，直接用。**唯一新增**：重连中的胶囊副文案，见 M7-A 与 X1 契约卡的交接（`COPY.phase.reconnecting`）。

### 明确不做

- 不做 Service Worker、不做离线编辑缓存。掉线就是阻断，这是 `docs/decisions/0-7` 的既定边界。
- 不改 Host 的 SSE 实现（心跳已经够用）。
- 不改 `phaseView.ts` 的掉线分支（已经对了）。
- 不引入任何新运行时依赖。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | 断流可感知：Host 被 kill 后 **≤ 8 秒**内 `status-online` 变「离线」、胶囊变红、`Blocked` 整页阻断页出现、表格锁定。E2E 断言。 |
| S02 | 不误报：正常切表、正常刷新、正常关抽屉都不触发离线；`subscribeEvents` 主动 dispose 不调 `onClose`。单测 + E2E。 |
| S03 | 掉线后再操作不落错文案、不白屏：Host 死后点切表 / 点导出，**不得**出现「提交失败」胶囊，**不得**出现未捕获异常，Univer 实例保留。E2E 断言 console 无 uncaught error。 |
| S04 | 自动恢复：Host 重新 `serve`（同端口同 token）后 ≤ 12 秒自动回到在线态并可继续编辑，草稿未丢。E2E 断言。 |

### 证据要求

- 新增 `editor/tests/client-sse.test.ts`：假 `fetch` + 可控 `ReadableStream`，覆盖 onOpen / onHeartbeat / ended / error / 主动 cancel 不误报 / 看门狗超时只触发一次 / 退避序列。
- 新增 `editor/tests/e2e/host-offline.spec.ts`：起 serve → 断言在线 → kill → 断言 ≤8s 阻断页 → 切表断言无 `Failed`、无 uncaught → 重新 serve → 断言 ≤12s 恢复。
- 交回时附 S01/S04 的实际耗时数值。

---

## M7-B · 错误页签状态收敛

- 优先级：P2
- 归属：本仓 · 前端
- Workflow 卡号：[R-00397](https://lumiogamesengine.workflow.games/requirements/01a06ae1-44e0-71e4-b095-610de4a791af)

### 背景（审计查实）

实走复现（审计 §C-8）：把 damage 设为 null → 预检失败 → 「错误 1」→ 点检查器「还原」→ 值回 120、胶囊回 `ReadyClean`、补丁 0、状态条「无未提交改动」，**但「错误 1」仍挂着，等 6 秒不消**。

根因两处：

- `App.tsx:1416-1425` 的 state 选择器把 `errors.length > 0` 排在**最前**，于是 `clean` / `not-validated` / `no-changes` 三个空态在有历史错误时永远够不到。
- `setErrors([])` 只在草稿保存成功（`App.tsx:258`）和提交成功（`:679`）时调用；**回滚到干净态不触发**。

后果：用户看到"没有改动"和"1 个错误"同时成立，无法判断该不该提交。

### 要做什么

1. **选择器改为以状态为准，不以数组长度为准。** `App.tsx` 的 ErrorTab `state` 计算改成（顺序即优先级）：
   - `state.dirtyCount === 0` → `"no-changes"`（**无条件优先**，不管 errors 里还剩什么）
   - `state.phase === "ReadyToSubmit"` → `"clean"`
   - `errors.length > 0` → `"errors"`
   - 其余 → `"not-validated"`
2. **脏格归零即清错误。** 在维护 `dirtyCounts` 的同一处，当前表脏格数从 >0 变为 0 时 `setErrors([])`。含四条路径：检查器「还原」、Univer undo 回基线、行删除撤销、切表。
3. **页签计数跟着走。** `App.tsx:1365` 的 `count: errors.length` 与 `tone` 在 `no-changes` 态下必须显示 0 / 无 tone。
4. **顺带补上审计 E-4 的残留**：错误页签跳格目前只有人工走查证据，本卡补一条 E2E。

### 明确不做

- 不改 `ErrorTab.tsx` 的渲染逻辑与四种空态文案（`ErrorTab` 本身是对的，它的 10 条单测保持全绿）。
- 不改预检 / 提交的错误产生路径。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | 还原改动回到 `ReadyClean` 后，错误页签立即显示 `no-changes` 空态，页签计数为 0，无 danger tone。 |
| S02 | 四条归零路径（还原 / undo / 撤销删行 / 切表）都清错误，各一条单测。 |
| S03 | 不误清：`ReadyDirty` 且预检失败时错误仍在；`Validating` 中不闪空态。 |
| S04 | 错误页签点击跳格有独立 E2E（补 E-4 残留）：预检失败 → 点错误项 → 断言 Univer 选区落在对应行列。 |

### 证据要求

- `editor/tests/ErrorTab.test.tsx` 既有 10 条保持全绿（本卡不改该文件则无需重跑之外的证据）。
- 新增/扩展 `editor/tests/e2e/host-submit.spec.ts` 或新建 `host-errors.spec.ts` 覆盖 S01 与 S04。
- 交回附还原前后两次 DOM 快照（`tab-errors` 文本 + `status-dirty` 文本）。

---

## M7-C · 列头可读性（S/C/V 图例 + 中文化 + 列宽）

- 优先级：P2
- 归属：本仓 · 前端
- Workflow 卡号：[R-00394](https://lumiogamesengine.workflow.games/requirements/01a06ae1-42fc-7449-9193-6234a0f4757b)
- 来源：Owner 2026-09-04 关切 D1

### 背景（审计查实）

列头文本由 `editor/src/spreadsheet/projection.ts:177-183` 生成：

```
第一行  `${column.name}${required ? " *" : ""}${readOnly ? " 🔒" : ""}`
第二行  `${columnTypeLabel(column)} · ${column.visibility}`
```

三个问题，逐条有据：

1. **`column.visibility` 是 schema 字面量原样透传**。真实取值（`schemas/skills.json`）：`id`/`name` = `SCV`，`damage`/`cooldown_frames` = `S`，`display_name`/`icon` = `C`。**界面上没有任何地方解释 S/C/V 是 server/client/voxel**。
2. **唯一的中文解释藏在悬浮 `title`**（`projection.ts:186-207`，走 `COPY.inspector.constraintLabels`）——鼠标悬停才可见，键盘用户拿不到，截图里也看不见。
3. **列头折行属实**。列宽写死在 `projection.ts:383`：`w: column.name === "id" ? 110 : column.name === "name" ? 140 : 120`；列头 `WrapStrategy.WRAP` + 行高 36（`:42,394`）。`cooldown_frames *` 在 120px 内必然折成 `cooldown_fram` / `es *`（实走截图为证）。

附带一条同源缺口：检查器的「描述」永远显示"无"，因为 `editor/src/api/types.ts:11-22` 的 `TableColumn` **根本没有 description 字段**（`projection.ts:185` 的注释自认"TableColumn 暂无描述字段，待 Host 补"）。**本卡不做 description**（要动 Host + 类型 + schema 约定），单独记入 §M7-C「后续」。

### 要做什么

1. **列头第二行中文化。** `headerText` 第二行由 `u32 · SCV` 改为 `整数 · 服务端·客户端·体素` 形态：
   - 类型中文名走新增的 `COPY.columnType`（映射表，见 X1 契约卡；未知类型回落原字面量，不得报错）。
   - 可见性走新增的 `COPY.visibility`（`S`→服务端，`C`→客户端，`V`→体素；多字母逐字符展开后用 `·` 连接；未知字符原样保留）。
   - `ref` 列维持现有 `ref→<目标表>` 形态（`columnTypeLabel` 不改）。
2. **列宽按列名自适应。** 把 `:383` 的三元式换成函数 `columnWidth(column)`：`clamp(112, ceil(firstLineLength * 8) + 34, 240)`，其中 `firstLineLength` 按 CJK 计 2、ASCII 计 1。`id` 列保持 110 下限不变（它有 🔒 与 `*`）。**目标：`cooldown_frames *` 在默认缩放下单行不折。**
3. **S/C/V 图例常驻。** 在表格工具栏右侧现有的「N 列 · 排序 / 筛选只影响视图」提示位（`panels/GridToolbar.tsx`）之前，加一段可点的图例：`S 服务端 · C 客户端 · V 体素`，点击弹 `ui/Dialog` 展开完整说明（含"某列第一次标 C 必须过生产激活单"这层含义，文案见 X1）。图例文本用 `--color-text-muted`，不得压过列数提示。
4. **列头 `title` 保留并补齐。** `headerTitleText` 现有内容不删，前面加一行"完整列名：`<name>`"（因为窄列可能仍被 Univer 截断）。

### 明确不做

- 不改 `column.visibility` 的取值语义，不在前端做可见性推断——那是 Schema 的事。
- 不加 description 字段（见「后续」）。
- 不改列头行高 36 与 `WrapStrategy.WRAP`（自适应宽度之后仍需 WRAP 兜底超长列名）。
- 不写十六进制色值（`no-hardcoded-colors.test.ts` 会拦）。

### 后续（不在本卡，供 Owner 排期）

Host 侧 `session.py` 的 schema 透传里带上列描述，`TableColumn` 加 `description?: string`，检查器「描述」与列头 `title` 同时受益。要先确认 `schemas/*.json` 是否已有描述字段的约定——若没有，这条要先过架构仓（Schema 是跨仓契约的一部分）。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | 列头第二行显示中文类型与中文可见性；`skills` 表 `damage` 列显示 `整数 · 服务端`，`id` 列显示 `整数 · 服务端·客户端·体素`。 |
| S02 | `cooldown_frames` 列头在 1440×900 默认缩放下**单行不折**；列宽函数有边界单测（超短名取下限、超长名取上限 240）。 |
| S03 | 工具栏图例常驻可见且可点开完整说明；键盘可达（Tab 可聚焦、Enter 打开、Esc 关闭）。 |
| S04 | 投影回环不受影响：`projection.roundtrip.test.ts` 既有 19 条全绿，「徽标不进 v / token」两条守卫仍在。 |

### 证据要求

- `editor/tests/projection.roundtrip.test.ts` 扩展：`headerText` 中文化断言、`columnWidth` 边界断言。
- `editor/tests/GridToolbar.test.tsx` 扩展：图例渲染 + 点开对话框 + 键盘可达。
- 交回附 1440×900 截图一张，能看清 `cooldown_frames` 不折行、图例在位。

---

## M7-D · 源文件与 Schema 路径可见

- 优先级：P2
- 归属：本仓 · Host + 前端
- Workflow 卡号：[R-00398](https://lumiogamesengine.workflow.games/requirements/01a06ae1-5696-7d3e-852c-5b0f2c974dc9)
- 来源：Owner 2026-09-04 关切 D2

### 背景（审计查实）

- `grep -rn "tables/" editor/src` 只有三处，**全在 API 路径拼接**（`api/draftSession.ts:16`、`api/client.ts:67`、`api/types.ts:186` 注释）。实走用 `document.body.innerText.includes('tables/')` 验证 = **false**：界面上没有任何地方显示表对应的源文件路径。
- **Host 已经送了一半数据但前端没用**：`src/lumio_config/editor/session.py:165` 每张表都返回 `"schemaPath": f"schemas/{name}.json"`；`grep -rn "schemaPath" editor/src` = **0 命中**，`api/types.ts:78-84` 的 `SessionTableSummary` 里字段声明了但没人读。缺的只是 `sourcePath`。
- **修订已经在显示**：`panels/TopBar.tsx:35-39,290` 渲染 `top-revision`，实走确认 git 显示 `main · f2b0ecf` + `title` 全 40 位 sha，svn 显示 `r<id>`，none 不显示。

所以 D2 的准确说法是「**源文件路径缺失，修订已有**」，本卡只补路径。

### 要做什么

1. **Host：`session.py:158-170` 的表摘要加一个字段** `"sourcePath": f"tables/{name}.txt"`。与既有 `schemaPath` 同款，仓库相对路径、POSIX 分隔符、不含绝对路径（不泄露用户目录）。
2. **类型：`api/types.ts` 的 `SessionTableSummary` 加 `sourcePath: string`**（必填，Host 保证有）。
3. **前端展示：顶栏表名 `⌄` 菜单加两条只读条目**（`panels/TopBar.tsx`，复用既有 `ui/Menu`）：
   - `源文件 tables/skills.txt`
   - `Schema schemas/skills.json`
   - 点击 = 复制路径到剪贴板 + toast「已复制路径」。交互与 `StatusBar.tsx` 的指纹复制完全同款（`navigator.clipboard.writeText` + `useToast`）。
   - 两条目在菜单里单独成组，与切表项之间有分隔。
4. **状态条兜底**：`status-table` 的 `title` 改为 `<表名> · tables/<表名>.txt`，让悬浮也能拿到。

### 明确不做

- 不显示绝对路径、不显示仓库根目录。
- 不做"点击打开文件"（那是 M7-E / M7-G）。
- 不改 `top-revision` 的现有渲染。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | `/api/session` 每张表返回 `sourcePath`，值为 `tables/<name>.txt`，且不含绝对路径；Host 单测断言。 |
| S02 | 顶栏表名菜单显示两条路径，文本与 Host 下发值逐字一致；单测断言。 |
| S03 | 点击复制成功并弹 toast；`navigator.clipboard.writeText` 被调用且参数正确（单测用 spy）。 |
| S04 | `status-table` 的 `title` 含源文件路径；实走截图为证。 |

### 证据要求

- `tests/test_editor_server.py` 扩展 session payload 断言。
- `editor/tests/TopBar.test.tsx` 扩展菜单条目与复制断言。
- 交回附 `curl -H "Authorization: Bearer <token>" http://127.0.0.1:<port>/api/session | jq '.tables[0]'` 的实际输出。

---

## M7-E · 源文件只读端点 + 表列表右键查看

- 优先级：P2
- 归属：本仓 · Host + 前端
- Workflow 卡号：[R-00399](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7032-7584-965b-0e79cc8082b4)
- 来源：Owner 2026-09-04 关切 D5（只读部分）

### 背景（审计查实）

- `panels/TableList.tsx` 无 `onContextMenu`；表列表只能点选，不能右键。
- `src/lumio_config/editor/server.py` 的全部路由（`do_GET` / `do_POST` / `do_PUT` / `do_DELETE`）里**没有任何读源文件的端点**；`_static`（`:433-458`）只服务前端产物 `editor_static/`。
- 现成可复用的安全模式在仓内已有三处先例：`server.py:33 _valid_table()`（正则 `^[A-Za-z0-9_.-]+$` + 显式拒 `..`）、`server.py:441-447 _static` 的 `resolve()` + `relative_to(root)` 兜底、`server.py:297-303 _export_dir` 的同款兜底。
- **路由可以自注册，不必改 `server.py`**：`history.py:12,133` 用 `from .server import register` + `register("GET", r"/api/tables/(?P<table>[^/]+)/history", _handle_history_request)` 的方式挂了扩展路由。本卡照抄这个模式。

### 要做什么

1. **新增 `src/lumio_config/editor/source_view.py`**，自注册只读端点：

   ```
   GET /api/tables/{table}/source?kind=table|schema
   → 200 { "table": "skills", "kind": "table", "path": "tables/skills.txt", "text": "<文件全文>", "bytes": 1234 }
   ```

   安全边界，四道，缺一不可：

   - **表名校验**：直接复用 `server.py:33 _valid_table()`，正则 + 显式拒 `..`。
   - **`kind` 是闭合枚举**，只映射到两个写死的前缀：`table` → `root/"tables"/f"{t}.txt"`，`schema` → `root/"schemas"/f"{t}.json"`。**路径的任何一段都不由请求方拼装**——这从根上免疫目录穿越。非法 `kind` → 400 `BAD_REQUEST`。
   - **`resolve()` + `relative_to(root)` 兜底**，模式照抄 `server.py:441-447`；越界 → 403 `FORBIDDEN`。
   - **只放行已加载的表**：`host.session.table_projection(table) is None` → 404 `UNKNOWN_TABLE`，与 `server.py:177-182` 口径一致。

   另外：文件不存在 → 404 `NOT_FOUND`；文件超过 **2 MiB** → 413 `PAYLOAD_TOO_LARGE`（防止把 10k 行大表整个塞进一次 JSON 响应，前端提示"文件过大，请在编辑器外打开"）。

2. **鉴权零新代码。** 端点落在 `/api/` 前缀下，`do_GET` 在分发到 `_EXTRA_ROUTES` **之前**已经跑过 `_authorize_api()`（`server.py:168-171`），三道检查（Host 头必须 loopback、Origin 必须匹配、`Authorization: Bearer <token>`）自动继承。**worker 不得在本卡里另写鉴权。**

3. **前端 API**：`api/client.ts` 加 `sourceFile(table: string, kind: "table" | "schema"): Promise<SourceFileResponse>`；类型进 `api/types.ts`。

4. **表列表右键菜单**：`panels/TableList.tsx` 加 `onContextMenu`（同时保留键盘入口 `Shift+F10` / `ContextMenu` 键），复用既有 `components/ui/Menu`（已有 `role=menu` / `menuitem` / ↑↓ Enter Esc / 视口边缘夹紧 + 11 条单测）。菜单项：

   | 项 | 行为 | 可用条件 |
   | --- | --- | --- |
   | 查看源文件 `tables/{t}.txt` | 打开只读查看器 | 总是 |
   | 查看 Schema `schemas/{t}.json` | 打开只读查看器 | 总是 |
   | 在资源管理器中显示 | 见 M7-G | `capabilities.reveal === true`，否则**整项不渲染** |

5. **只读查看器 `panels/SourceViewDialog.tsx`**（新）：走 `ui/Dialog`（已有焦点陷阱 / Esc / 焦点还原），宽 720，等宽字体，`readOnly` 文本域或 `<pre>`，带行号，可全选复制，右上角「复制全文」按钮 + toast。**明确标注"只读快照，改这里不会改仓库"**（文案见 X1）。加载中 / 过大 / 失败三种态各有文案。

### 明确不做

- **不做编辑**。这是只读窗口，不是第二个编辑器。任何写回都违背 `docs/decisions/0-1` §2「唯一写路径是结构化补丁」。
- 不做语法高亮（不引依赖）。
- 不缓存文件内容（每次打开重新拉，保证与仓库一致）。
- 本卡**不实现** reveal（那是 M7-G），但菜单要预留位置并按 `capabilities.reveal` 隐藏。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | 端点可用：`kind=table` / `kind=schema` 各返回正确 `path` 与全文；内容与磁盘文件逐字节一致。 |
| S02 | 安全边界全覆盖：`..`、`%2e%2e%2f`、绝对路径、非法 `kind`、未知表、未加载表、无 token、错 token、非 loopback Host 头，**九种入参各有一条 Host 单测**，全部按上表返回对应错误码，且**任何一种都不得读到 `tables/` 与 `schemas/` 之外的字节**。 |
| S03 | 右键菜单可用且键盘可达（`Shift+F10` 打开、↑↓ 选择、Enter 执行、Esc 关闭）；`capabilities.reveal=false` 时第三项不渲染。 |
| S04 | 查看器显示全文、可复制、明确标注只读；超 2 MiB 走 413 分支并显示对应文案。 |

### 证据要求

- 新增 `tests/test_editor_source_view.py`（S01/S02 九条边界）。
- 新增 `editor/tests/SourceViewDialog.test.tsx`；扩展 `editor/tests/TableList.test.tsx`。
- 新增 `editor/tests/e2e/host-source-view.spec.ts`：右键 → 查看源文件 → 断言内容含 `tables/skills.txt` 的真实首行。
- 交回**必须**附 S02 九条边界的实际命令与响应，逐条列出。

---

## M7-F · 导出支持权威文本格式 TXT

- 优先级：P2
- 归属：**本仓**（不需要架构仓立卡，见下）
- Workflow 卡号：[R-00400](https://lumiogamesengine.workflow.games/requirements/01a06ae1-76dc-7d2a-b0b9-638d3267b088)
- 来源：Owner 2026-09-04 关切 D4

### 背景（审计查实，含对 Owner 前提的修正）

Owner 的原话是「导出 TXT 需架构仓立卡变更格式枚举」。**审计查实：不需要。** 逐处核对导出格式枚举的定义归属：

| 位置 | 内容 |
| --- | --- |
| `src/lumio_config/editor/export_csv.py:96` | `if fmt not in {"csv", "tsv"}: raise ValueError("format must be csv or tsv")` |
| `src/lumio_config/editor/session.py:180` | `"export": ["csv", "tsv"]`（capabilities 下发前端） |
| `editor/src/panels/drawer/ExportTab.tsx:16,102,165-166` | 类型 + 两个 `<option>` |

**三处全在本仓**，且 `grep -rn "csv\|tsv" docs/decisions/` = **0 命中**。架构仓真正拥有的是**另一条导出**：`docs/decisions/0-4` §1 的四层产物骨架 `build/export/` 下 `manifest.json` + `server|client|voxel/<table>.json`，由 CLI `lumio_config.py export` 产出。两者物理隔离——编辑器导出落 `build/export/editor/<exportId>/`（`server.py:297-303`），实走确认目录结构为 `build/export/editor/ddbf330305834a43/{drops,effects,skills}.csv + README.txt`，不与架构仓产物冲突。

**唯一会撞架构仓的情况**：如果导出的 TXT 被期望**能回导**成权威源。那撞 `docs/decisions/0-1` §2「唯一写路径是结构化补丁……禁止整文件覆盖」，必须先在架构仓改这条。**本卡明确不做回导。**

**实现成本几乎为零**：本仓已有权威格式化器 `src/lumio_config/text_table.py:105 format_table_text(table)`——就是 `lumio_config.py format` 写 `tables/*.txt` 用的同一个函数。

### 要做什么

1. **`export_csv.py:96` 格式枚举加 `"txt"`**：`if fmt not in {"csv", "tsv", "txt"}`。
2. **`txt` 分支不走 `csv.writer`**，改调 `text_table.format_table_text(table)`，产出与 `tables/<t>.txt` **逐字节一致**的内容（`source=repo` 时）。文件名 `<table>.txt`。
3. **`session.py:180` capabilities 改为 `["csv", "tsv", "txt"]`**（本卡与 M7-D 共用该文件，见派活提示词的文件集安排）。
4. **`ExportTab.tsx` 加第三个 `<option value="txt">TXT（权威文本格式）</option>`**。
5. **README.txt 增段**：TXT 导出时，`README.txt` 里必须写明"本目录的 .txt 是源表格式的**只读快照**，不能拷回 `tables/` 覆盖；改表请在编辑器里改并提交补丁"。
6. **`source=draft` 的 TXT 必须显著标注**：文件名改为 `<table>.draft.txt`，且 `README.txt` 里单列一段"含未提交草稿，与仓库不一致"。**这条是防呆的关键**——一个看起来完全像源表的文件被误当权威源提交，是本卡最大的风险。

### 需要 Owner 拍板的一条

**`targets`（S/C/V 目标列过滤）对 TXT 的语义。** 建议：**TXT 只允许 `targets` 为空（= 全部列）**，传了非空 `targets` 就返回 400 `BAD_REQUEST`。理由：权威文本源本来就是全列的，产出一个"长得像源表但缺了几列"的 .txt 文件极其危险。

- [ ] Owner 选项 A（推荐）：TXT 拒绝 `targets` 过滤，只出全列。
- [ ] Owner 选项 B：允许过滤，但文件名强制加后缀 `<table>.S.txt` 并在 README 里大字警告。

**Owner 未勾选前，worker 按选项 A 实现**，并在交回物里标注该假设。

### 明确不做

- **不做回导**（撞 ADR 0-1 §2）。UI 文案沿用现有 `COPY.export.exportNote`「单向生成物，不会导回仓库」，TXT 分支再加一句更强的警告。
- 不改 CLI `lumio_config.py export`（那是架构仓契约的产物导出，与本卡无关）。
- 不改 `text_table.format_table_text` 本身。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | `format=txt` + `source=repo` 导出的文件与 `tables/<t>.txt` **逐字节相同**（含 BOM 策略、换行符、行间空行）。Host 单测用 `filecmp` / 字节比较断言。 |
| S02 | 四态 token 原样保留：`@missing` / `""` / `null` / `@default` 在导出的 TXT 里与源文件一致，不被转义、不被求值。 |
| S03 | `source=draft` 产出 `<table>.draft.txt` 且 `README.txt` 含未提交警告；`capabilities.export` 含 `"txt"`；下拉框第三项可选。 |
| S04 | `targets` 非空 + `format=txt` → 400 `BAD_REQUEST`（按 Owner 选项 A）；错误文案可读。 |

### 证据要求

- `tests/test_editor_export.py` 扩展 txt 分支（S01 字节比较、S02 四态、S04 边界）。
- `editor/tests/e2e/host-export.spec.ts` 增一条：选 TXT → 导出 → 下载 `export-link` → 断言内容与 `tables/skills.txt` 一致。
- 交回附 `diff <(cat build/export/editor/<id>/skills.txt) tables/skills.txt` 的实际输出（应为空）。

---

## M7-G · 在资源管理器中显示（reveal）

- 优先级：P3
- 归属：本仓
- Workflow 卡号：[R-00401](https://lumiogamesengine.workflow.games/requirements/01a06ae1-7f07-76d3-a024-4fabe3f4e8e7)
- 来源：Owner 2026-09-04 关切 D5（reveal 部分）

### 开工闸门（必须先解除）

> **本卡是整个编辑器里唯一一处从"只读本地服务"升级成"执行本机命令"的动作。** 在 Owner 明确授权前不得开工。
>
> - [ ] Owner 授权：允许 Host 在用户显式开启开关后，执行 `open -R` / `explorer /select,` / `xdg-open` 打开文件管理器。

### 背景

M7-E 的右键菜单已经预留了第三项并按 `capabilities.reveal` 隐藏。本卡只补 Host 半边 + 打开开关。

风险面：这是一个能改变本机状态的动作，必须与 `capabilities.commit`（`session.py:179`）同级对待——「能改本机状态的能力必须显式授权」。

### 要做什么

1. **新增 `src/lumio_config/editor/reveal.py`**，自注册端点（照 `history.py` 模式）：

   ```
   POST /api/reveal   body: { "table": "skills", "kind": "table" | "schema" }
   → 204 无内容 | 403 REVEAL_DISABLED | 400 BAD_REQUEST | 404 UNKNOWN_TABLE
   ```

2. **端点绝不接受路径参数。** body 只有 `table` + `kind` 两个字段，路径由 Host 按 M7-E 同款的**两个写死前缀**自己拼；`_valid_table` + `resolve()` + `relative_to(root)` 三道兜底照抄。**任何形式的"传路径进来"都是本卡的红线。**

3. **命令执行纪律**（与 `vcs.py` 的 `ALLOWED_COMMANDS` 同款）：
   - 只用 argv 列表，**`shell=False`**，`cwd=root`。
   - 命令模板按平台写死三条，不拼字符串：
     - macOS：`["open", "-R", str(path)]`
     - Windows：`["explorer", f"/select,{path}"]`
     - Linux：`["xdg-open", str(path.parent)]`（`xdg-open` 无 select 语义，只开目录）
   - 其他平台 → 403 `REVEAL_UNSUPPORTED`。
   - 不读子进程输出、不等待返回码阻塞请求（`Popen` 后立即返回 204）。

4. **默认关闭，显式开启。**
   - `Settings` 加 `allow_reveal: bool`，默认 `False`。
   - CLI `serve` 加 `--allow-reveal` 开关（`src/lumio_config/cli.py`）。
   - `session.py` capabilities 加 `"reveal": <bool>`。
   - 前端按 `capabilities.reveal` 决定菜单项是否渲染（M7-E 已实现该分支）。

5. **`docs/reference/editor.md` 增一段**：reveal 是什么、默认关、怎么开、为什么默认关。

### 明确不做

- 不打开编辑器 / IDE（`code -g` 之类）。只开文件管理器，语义单一。
- 不做"打开终端到该目录"。
- 不在 `--allow-reveal` 未开时把菜单项渲染成禁用态——**整项不渲染**，避免暗示"去开开关"。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | `allow_reveal=False`（默认）时端点返回 403 `REVEAL_DISABLED` 且**不执行任何子进程**（单测用 mock 断言 `Popen` 零调用）；`capabilities.reveal=false`；菜单第三项不渲染。 |
| S02 | `allow_reveal=True` 时，三平台各自的 argv **逐字断言**（mock `Popen`，不真的开窗口）；`shell=False`；路径为 `root/tables/<t>.txt` 的绝对路径。 |
| S03 | 注入面全封：body 里传 `path` / `cmd` / `../` / 绝对路径 / 未知 `kind` / 未知表，**六种各一条单测**，全部拒绝且 `Popen` 零调用。 |
| S04 | `--allow-reveal` 开关在 `serve --help` 里有说明；`docs/reference/editor.md` 有对应段落。 |

### 证据要求

- 新增 `tests/test_editor_reveal.py`（S01/S02/S03，全部 mock `Popen`，**测试里绝不真的拉起文件管理器**）。
- 交回**必须**附 S03 六条注入用例的实际输出。

---

## M7-H · 编辑器内建新表

- 优先级：P3
- 归属：本仓，**但有架构仓前置**
- Workflow 卡号：[R-00404](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8f2e-787a-a1b7-9cf7eaacc007)
- 来源：Owner 2026-09-04 关切 D3（建表部分）

### 开工闸门（必须先解除）

> **架构仓前置**：新建表要同时产出 `schemas/<t>.json` + `tables/<t>.txt` + `registry/` 的行号命名空间条目。**ID Namespace 授权归架构仓**（`.spec/AGENTS.md` 红线 5、`docs/decisions/0-2`）。
>
> - [ ] 架构仓回话：新表的终身编号命名空间怎么分配？由谁授权？本仓工具能否自行分配一个未占用区段，还是必须走架构仓登记？
>
> **未拿到回话前不得开工。** 这不是流程洁癖——弄错命名空间会让两个仓的表撞号，且撞号是不可逆的（终身编号一旦发出就不能改）。

### 背景（审计查实）

`grep -rn "新建表|创建新表|导入" editor/src` = **0 命中**；命令面板实走 13 条命令里只有「打开表 ×3」，无建表；`server.py` 全部路由无建表端点；CLI `lumio_config.py` 的 8 个子命令（`validate format export patch query preview registry serve`）也**没有建表命令**。

所以这不是"编辑器少个按钮"，是**整条链路都没有**——本卡至少要同时做 CLI、Host、前端三层，或者至少 Host + 前端。

**与 ADR 0-1 的关系**：0-1 §2 禁的是"整文件覆盖已有权威源"。**新增一张此前不存在的表不属于覆盖**，不违背 0-1。但它引入了 0-1 没覆盖的新问题：新表的初始 schema 从哪来、id 段从哪来。

### 要做什么（待闸门解除后细化）

1. **CLI 先行**：`lumio_config.py table new <name> --from-schema <path> | --template <minimal>`，产出三件套并跑一次 `validate` + `format`。CLI 是权威路径，编辑器只是它的窗口。
2. **Host 端点**：`POST /api/tables`，body `{ name, columns: [...] }`，幂等（同名已存在 → 409 `TABLE_EXISTS`），内部调 CLI 同一份实现，不复制逻辑。
3. **前端**：命令面板加「新建表…」，`ui/Dialog` 表单——表名（校验同 `_valid_table`）、列定义（名 / 类型 / 必填 / 可见性 / 默认值）、至少要有 `id` 与 `name` 两列。
4. **建完立即打开新表**，并在补丁页签显示"这是一张新表，提交后才会进仓库"。

### 明确不做

- 不做删表（删表涉及墓碑与 registry，风险面完全不同，单独立卡）。
- 不做改 schema 列（`docs/decisions/0-7:50` 禁止"插 / 删 Schema 列"）。

### 验收项（草案，闸门解除后定稿）

| 项 | 内容 |
| --- | --- |
| S01 | CLI `table new` 产出三件套且 `validate` + `format --check` 全绿。 |
| S02 | 端点幂等；非法表名、重名、缺 `id`/`name` 列各有拒绝路径。 |
| S03 | 新表的 id 命名空间符合架构仓回话的规则（**具体断言待闸门解除后补**）。 |
| S04 | 前端建表 → 打开 → 加一行 → 提交，全流程 E2E 通过。 |

---

## M7-I · 导入降级为补丁草案

- 优先级：P3
- 归属：本仓，**但有 Owner 前置**
- Workflow 卡号：[R-00405](https://lumiogamesengine.workflow.games/requirements/01a06ae1-963a-7e51-b59e-60717d9a45fc)
- 来源：Owner 2026-09-04 关切 D3（导入部分）

### 开工闸门（必须先解除）

> **Owner 前置**：`docs/decisions/0-1` §2 明写「唯一写路径是结构化补丁……人不直接改文件；编辑器保存必须生成逐格补丁，**禁止整文件覆盖**」，「明确不做」里还有「不把 Excel 当源，不做 Excel 双向同步」。
>
> 因此**导入唯一的合规形态**是：把外部文件解析成一份**结构化补丁草案**，进入既有的「预检 → 冲突 → 提交」通道，**绝不落盘覆盖**。
>
> - [ ] Owner 签字：确认导入必须降级为补丁草案，不做整文件覆盖，不做 Excel 双向同步。
>
> 若 Owner 想要真正的"整表导入覆盖"，那不是本仓能决定的——**必须先在架构仓改 ADR 0-1**，本卡就地作废重开。

### 背景

见 M7-H 背景（同一条 grep 证据）。导入比建表更危险：一个"导入"按钮在用户心智里就是"用我的文件替换你的表"，而这正是 ADR 0-1 禁止的。所以本卡的产品设计必须让用户**从第一眼就知道这是在生成补丁**，而不是在覆盖。

### 要做什么（待闸门解除后细化）

1. **`POST /api/import/preview`**：接收 CSV / TSV（首版不接 `.xlsx`——那要引依赖，另议），**只解析不落盘**，返回既有的 `Patch` 形状（`api/types.ts` 的 `PatchOp`）。
2. **逐行按稳定 `id` 对齐**；文件里没有的行 = 不动（**不生成 delete**）；id 不存在 = `create`；值不同 = `update`。四态 token 原样透传。
3. **前端**：命令面板 /「⋯」菜单加「从文件导入为补丁…」，选文件 → 预览 → **直接灌进补丁页签**，用户在既有 UI 里逐条看、逐条改、再走预检提交。
4. **文案必须直白**：「导入不会直接改表。它会生成一份补丁草案，你确认后才提交。」

### 明确不做

- 不落盘、不覆盖、不生成 delete 操作。
- 不接 `.xlsx`（首版）。
- 不做"导入新表"（那是 M7-H）。

### 验收项（草案，闸门解除后定稿）

| 项 | 内容 |
| --- | --- |
| S01 | 导入只产出 `Patch`，端点执行前后 `tables/` 与 `registry/` 字节不变（单测用指纹前后比对断言）。 |
| S02 | 按 id 对齐正确：改值 → `update`，新 id → `create`，文件缺行 → **无 `delete`**。 |
| S03 | 四态 token 原样透传，不被求值、不被转义。 |
| S04 | 前端全流程：选文件 → 补丁页签列出改动 → 预检 → 提交，E2E 通过；界面文案明确"不会直接改表"。 |

---

## M7-J · `.sdd/` 交回物制度补课

- 优先级：P2（工程债）
- 归属：本仓 · 纯文档 / 流程
- Workflow 卡号：[R-00402](https://lumiogamesengine.workflow.games/requirements/01a06ae1-837f-7897-96af-4f9c7f90f8ce)

### 背景（审计查实）

任务书 `.spec/plans/2026-09-03-web-editor-redesign-dispatch-prompt.md` §4.5 要求每张子卡合入后在 `.sdd/progress.md` 追加一行、§8 要求每张 Workflow 卡收口出一份交回物。实际状态：

- `.sdd/.gitignore` 内容是 `*`（**整目录自忽略**）。
- 目录里只有 `progress.md`，内容属于**更早的 `editor-ui-primitives` feature**（wave 0–2、closeout review 1/2），M6-F～M6-K **零记录**。
- 任务书点名的 `.sdd/m6-{f,g,h,i,j,k}-return.md` **六份全部不存在**。

**后果是实打实的**：2026-09-04 的完成度审计因此无法与交回物对账，A/B/E 三个维度只能全靠代码 + 测试重建，成本翻倍；而且**下一轮审计会重复同样的成本**。

### 要做什么

必须先做一个决定，二选一（建议 A）：

- **A（建议）**：交回物是**要留档的产物**，落 `docs/reviews/`（已入库、可检索、可对账）；`.sdd/` 降级为纯临时区（worker 简报、中间 diff），维持整目录 gitignore。
- **B**：交回物留在 `.sdd/`，但把 `.gitignore` 从 `*` 改成只忽略临时文件（`task-*-brief.md`、`*.diff`），`*-return.md` 与 `progress.md` 入库。

选定后：

1. **新增 `.sdd/README.md`**（无论选 A 还是 B 都要）：写清 `.sdd/` 是什么、哪些文件入库哪些不入库、为什么。这个文件本身必须**不被忽略**（`.gitignore` 加 `!README.md`）。
2. **补记 M6-F～M6-K 六份交回物**。**不要编造**——照 2026-09-04 审计报告 §A / §B 的实测结论回填，每条证据指向审计报告或可复跑的命令，并在文首注明"本文为事后补记，证据来自 2026-09-04 审计实跑，非当时收口现场记录"。
3. **更新 `.spec/knowledge/standards/dispatch.md`**：把交回物落点写成单一权威的一句话，删掉与之冲突的表述。
4. **`.spec/knowledge/lessons.md` 增一条**：「派活提示词里写了台账要求，不等于台账会存在。`.sdd/` 整目录 gitignore 会让台账在收口后蒸发；下一轮审计因此付出了重建全部证据的代价。台账的落点必须是入库路径。」
5. **顺带修 a11y 清单的勾选口径漂移**（审计 §G-3）：`editor/docs/a11y-checklist.md` §3 第 4 条（J1–J5）与第 6 条（错误跳格）都打了 `[x]`，但正文写着"记为残留"，与该清单开头自定的"给出自动用例 ID 或截图 / 走查证据才打勾"矛盾。引入 `[~]`（部分）标记或拆条。

### 明确不做

- 不追溯修改已合入的提交。
- 不为了补台账而重跑一遍 M6 全部工作。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | 落点决定已写进 `.spec/knowledge/standards/dispatch.md`，全仓无第二处冲突表述（grep 自证）。 |
| S02 | `.sdd/README.md` 存在且**已入库**（`git ls-files` 能查到）。 |
| S03 | M6-F～M6-K 六份交回物齐备，每条证据可复跑或指向审计报告的具体节；文首有"事后补记"声明。 |
| S04 | `lessons.md` 增一条；a11y 清单勾选口径与正文一致（`[~]` 或拆条）。 |

### 证据要求

- `node <插件目录>/tools/spec-lint.mjs .` 通过。
- 交回附 `git ls-files .sdd/` 输出，证明该入库的入了库。

---

## M7-K · Node 版本上界与 storage 注入

- 优先级：P2（工程债）
- 归属：本仓 · 前端工程
- Workflow 卡号：[R-00403](https://lumiogamesengine.workflow.games/requirements/01a06ae1-8aa0-763e-b67d-b53c11f00e93)

### 背景（审计查实）

本次 `pnpm vitest run` = **24 failed | 289 passed (313)**，`tests/TableList.test.tsx`(11) 与 `tests/GridToolbar.test.tsx`(13) 整文件红，错误统一是 `TypeError: Cannot read properties of undefined (reading 'clear'/'setItem'/'removeItem')`，位置在 `TableList.test.tsx:64,171,185` 与 `GridToolbar.test.tsx:81` 的 `localStorage.*`。

逐步定位（探针测试，跑完即删）：

- `node --version` = **v26.4.0**；`node -e "globalThis.localStorage"` → `undefined` + `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`。**Node 26 自带一个全局 `localStorage` 访问器**，不给 flag 就返回 `undefined`。
- `vitest.config.ts:7` 确有 `environment: "jsdom"`，`jsdom@26.0.0` 也装好了：探针里 `new JSDOM("", {url:"http://localhost:3000"}).window.localStorage` → `object`，**jsdom 本身完全正常**。
- 但在 vitest 的 jsdom 环境里，`Object.getOwnPropertyDescriptor(globalThis,"localStorage")` 仍是 **Node 自己的 getter**（`get=function`），且 `window === globalThis` 为 `true`，`window.localStorage` = `undefined`。即 vitest 的 `populateGlobal` 没有覆盖这个已存在的全局名，jsdom 的 Storage 到不了测试。

**这不是产品缺陷**——`TableList` / `GridToolbar` 的功能已在浏览器实走确认可用。但后果是实打实的：**M6-H / R-00380 S01 S02 的"单测绿"验收证据在当前工具链上取不到**，且任何人升到 Node 26 后 `pnpm test` 都会红。

**顺带一条代码侧观察**：`editor/src/spreadsheet/viewState.ts:57,81,95,107,128` 把 storage 做成可注入形参（`storage: Pick<Storage, "getItem"> = globalThis.localStorage`），所以 `viewState.test.ts` 5 条全绿；而 `editor/src/panels/TableList.tsx:32-33` 直接裸用 `localStorage`。**同一仓库两种写法，健壮的那种恰好没被推广。**

另注：`GridToolbar.tsx` **自己完全不用 localStorage**（grep 零命中），它红纯粹是因为 `GridToolbar.test.tsx:81` 的 `afterEach` 里有一句 `localStorage.clear()`。所以这一半是纯测试改动。

### 要做什么

1. **`editor/package.json` 的 `engines.node` 从 `">=22"` 收成 `">=22 <26"`**，并加一行注释性说明（放 README 或 `docs/`，package.json 不支持注释）——记录"Node 26 的全局 `localStorage` 会遮蔽 vitest 的 jsdom Storage"。这是**止血**，不是根治。
2. **根治：推广 `viewState.ts` 的注入写法。** `TableList.tsx` 的 onboarding 读写改为走一个共享的存储访问器，而不是裸 `localStorage`：
   - 新增（或复用 `viewState.ts` 内已有的）`safeStorage()`：优先 `globalThis.localStorage`，取不到则回落到一个内存 Map 实现的 `Storage` 垫片。**永不抛异常**——隐私模式、storage 被禁、Node 26 三种情况都能跑。
   - `ONBOARDING_KEY` 的读写走它。
3. **测试侧**：`TableList.test.tsx` 与 `GridToolbar.test.tsx` 的 `afterEach` 不再裸用 `localStorage.clear()`，改用同一个访问器或直接删掉（`GridToolbar` 根本不需要）。
4. **加一条守卫**：新增 `editor/tests/no-bare-localstorage.test.ts`，扫描 `editor/src/**` 断言不出现裸 `localStorage.` / `sessionStorage.`（`viewState.ts` 与 `safeStorage` 实现文件本身在白名单里）。防止下次又混进裸用法。
   - 注意 `api/client.ts:22,26` 用了 `sessionStorage`（token 存取）——**本卡一并纳入访问器**，否则守卫会红；`sessionStorage` 在 Node 26 下有同样的遮蔽问题。

### 明确不做

- 不升级 vitest / jsdom 去赌上游修复。
- 不改 `vitest.config.ts` 加全局 setup 去 monkey-patch `globalThis.localStorage`——那是把问题藏进测试环境，源码里的裸用法在真实浏览器的隐私模式下仍会炸。
- 不动 `viewState.ts` 已有的注入签名（它是对的）。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | 在 **Node 26.4.0** 下 `pnpm vitest run` **全绿**（当前 24 红清零）。交回附 `node --version` 与完整测试计数。 |
| S02 | `engines.node` 收窄为 `">=22 <26"`；`pnpm install` 在 Node 26 下给出明确警告而非静默。 |
| S03 | `editor/src/**` 无裸 `localStorage.` / `sessionStorage.`（白名单除外），新守卫测试通过。 |
| S04 | 垫片可用性：storage 取不到时组件不抛异常、onboarding toast 退化为"每次都提示"而不是崩溃；token 读取退化为"仅本次页面有效"。各一条单测。 |

### 证据要求

- 交回**必须**附 Node 26 下的 `pnpm vitest run` 完整尾部输出（`Test Files` / `Tests` 两行）。
- 若本机能装到 Node 22，附两个版本各一次的结果对照。

---

---

## M7-X · 冻结加固批次契约层：文案表、前端类型与安全存储访问器

- 优先级：P1（**本批次 wave 0，其余消费卡以本卡冻结物为前置**）
- 归属：本仓 · 前端公共契约
- Workflow 卡号：[R-00395](https://lumiogamesengine.workflow.games/requirements/01a06ae1-442a-75a1-b7f2-7411ffac033e)

### 背景

`editor/src/app/copy.ts`、`editor/src/api/types.ts` 与新增的 `editor/src/app/storage.ts` 是 M7-A / M7-C / M7-D / M7-E / M7-F / M7-K **六张卡的共享热点**。若不先冻结，六个 Agent 会在同三个文件上互相覆盖；且规划规程的硬闸门要求「接口冻结是第一张可执行卡」，消费卡在合同冻结前不得标为可执行。

### 要做什么

三份冻结物，**键名与签名即契约，改名即六张卡返工**：

1. **`copy.ts` 新增文案段**——M7-A 的 `phase.reconnecting` / `banner.reconnecting`；M7-C 的 `columnType` / `visibility` / `grid.visibilityLegend*` / `grid.fullColumnName`；M7-D 的 `paths.*`；M7-E 的 `sourceView.*` / `tableMenu.*`；M7-F 的 `export.formatTxt` / `txtNote` / `txtDraftNote`。只加不删不改既有键，`COPY` 仍为 `as const`，带参数的用函数。
2. **`types.ts` 新增类型**——`SessionTableSummary.sourcePath: string`、`SessionCapabilities.export: string[]` 与 `reveal: boolean`、`SourceFileResponse { table, kind, path, text, bytes }`。
3. **`storage.ts`（新）**——`safeStorage(kind: "local" | "session"): Storage` 与 `isStorageFallback(kind): boolean`。探测真实 storage **可读且可写**（写探针键再删），不可用则回落进程内 Map 垫片、**永不抛**；垫片实现完整 `Storage` 接口；同 kind 单例。覆盖三种取不到的情况：浏览器隐私模式、站点禁用存储、Node 26 的全局 `localStorage` 遮蔽（见审计 §G-2）。

### 明确不做

不改任何消费方（`TableList.tsx`、`client.ts`、`projection.ts`、`TopBar.tsx`、`ExportTab.tsx` 一律不动）；不加依赖；不改 `viewState.ts` 已有的注入签名；**不在 `vitest.config.ts` 加全局 setup 去 monkey-patch `globalThis.localStorage`**。

### 验收项

| 项 | 内容 |
| --- | --- |
| S01 | `copy.ts` 新增键与规格逐字一致，`COPY` 仍为 `as const`；`copy.test.ts` 全绿且 BANNED 正则覆盖全部新增字符串（含函数取样输出）。 |
| S02 | `types.ts` 三处签名逐字一致；`pnpm lint`（eslint + `tsc --noEmit` + check-deps）通过。 |
| S03 | `safeStorage` / `isStorageFallback` 在真实可用时直通、抛异常或全局 `undefined` 时回落且永不抛、垫片接口完整、同 kind 单例——`storage.test.ts` 逐条覆盖并全绿。 |
| S04 | 零消费方改动（`git diff --stat` 只含本卡 5 个文件）；未新增任何依赖；未提交 `editor_static/` 与 `poc-benchmark.md` 抖动。 |

## 附录 A · 与架构仓的边界（本轮结论）

| 议题 | 归属 | 依据 | 本轮动作 |
| --- | --- | --- | --- |
| 编辑器导出格式枚举（csv/tsv/txt） | **本仓** | 三处定义全在本仓；`docs/decisions/` grep `csv` 零命中 | M7-F 直接做，不立架构仓卡 |
| `build/export/` 四层产物骨架 | 架构仓 | `docs/decisions/0-4` §1 | 不碰。编辑器导出隔离在 `build/export/editor/<id>/` |
| 导出 TXT 能否回导 | 架构仓 | `docs/decisions/0-1` §2 禁止整文件覆盖 | M7-F 明确不做回导 |
| 表里写公式 / 派生列 | **架构仓** | `docs/decisions/0-7:50` 禁止公式持久化；`0-3` 给了"编译期换算"模式 | 本轮不做。若 Owner 要，先在架构仓开 ADR（表达式语法子集、求值确定性、Rust/C# 一致性向量、是否进内容指纹） |
| 新表的 id 命名空间授权 | 架构仓 | `.spec/AGENTS.md` 红线 5；`docs/decisions/0-2` | M7-H 的开工闸门 |
| 导入是否可整文件覆盖 | 架构仓 | `docs/decisions/0-1` §2 | M7-I 的开工闸门（Owner 先签字降级为补丁草案） |
| 列描述字段（`TableColumn.description`） | 待定 | Schema 是跨仓契约的一部分 | M7-C「后续」，先确认 `schemas/*.json` 有无既有约定 |

## 附录 B · 审计残留与本轮卡的对应

| 审计编号 | 残留 | 本轮处理 |
| --- | --- | --- |
| E-1 | 阻断页不可达（P1） | **M7-A 全量修复** |
| E-2 | 还原后错误页签不清空 | **M7-B 全量修复** |
| E-3 | J1 / J3 无独立键盘旅程 | M7-J 顺带修清单口径；**旅程用例本轮不补**（口径合并可接受，已在 J2 覆盖） |
| E-4 | 错误跳格无独立 e2e | **M7-B S04 补上** |
| E-5 | 七种标记灰度可辨未人工走查 | **本轮不做**，记入下轮；需要人工灰度走查，不适合自动化卡 |
| E-6 | `.grid-toolbar__hint` 对比度 | 已修（axe 三态零违例证实），无需处理 |
| E-7 | landmark / heading / region moderate 违例 | 已修，无需处理 |
| E-8 | Univer canvas tabindex 豁免 | 合理豁免，维持；升 Univer 大版本时重评 |
| G-1 | `@axe-core/playwright` 未落本机 node_modules | 环境问题，非代码；派活提示词 §6 已写明开工先 `pnpm install --frozen-lockfile` |
| G-2 | Node 26 遮蔽 jsdom Storage | **M7-K 全量修复** |
| G-3 | a11y 清单勾选与正文矛盾 | **M7-J S04** |
| G-4 | `.sdd/` 交回物整体缺失 | **M7-J 全量修复** |
| G-5 | 掉线后胶囊文案错配「提交失败」 | **M7-A 要做什么 §6 一并修** |

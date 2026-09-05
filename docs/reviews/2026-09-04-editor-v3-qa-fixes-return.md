# 2026-09-04 · Editor v3 QA 缺陷修复交回（QA-P2-8 / QA-P3-1 / QA-P3-2 + 已知问题 P2-1~P2-7 收口）

日期：2026-09-04
对 QA 报告：`docs/reviews/2026-09-04-editor-v3-qa-report.md`（独立对抗式 QA，被测 HEAD 8328a2f）
性质：缺陷修复（先经 Owner 讨论判定「修 / 忽略」，再实施；见 §1 判定表）

## 1. 判定表（讨论结论）

| QA 条目 | 判定 | 依据 / 处置 |
| --- | --- | --- |
| QA-P2-8 脏会话杀 Host 换 token → Failed/「提交失败」 | **修** | 与 P2-1 同根因簇（错误分类缺口 + generic Failed 无恢复路径） |
| P2-1 首连失败恢复后停在 Failed | **修** | 同上 |
| P2-4 `api()` 的 `response.text()` 在 try 外 | **修** | 同一道分类防线，一行 |
| P2-6 413 在整读之后 | **修** | 追加发现：真正的整读在 `table_projection` 的指纹计算（fingerprint.py:95），不止 source_view 自己那次 |
| P2-7 非 UTF-8 decode 断连无 JSON | **修** | 归 422 JSON |
| QA-P3-1 status-table 无路径 title | **修** | M7-D 需求第 4 条与 S04 验收原文都指向 status-table；「口径改顶栏」是文件集约束的 workaround，不是产品决定 |
| QA-P3-2 检查器/列头 title 英文类型与原样可见性 | **修（Owner 拍板）** | Owner 方案：悬浮 title 三行（完整列名 / 中文类型·可见性与列头第二行同源 / 约束行）；检查器类型双显 `整数（i32）`、可见性展开中文。属对 M7-C「现有内容不删」的**有意修订**：约束信息保留，只换排版与语言 |
| P2-2 看门狗无 dispose | **修（顺手）** | 与批次 1 同文件，3 行 |
| P2-3 黑洞只判死不重连 | **修（顺手）** | 看门狗判死 → `restart()` 重建流；本机无活探针，验收止于单测（Windows 无黑洞工具，维持 QA 未覆盖声明） |
| P2-5 reconnecting 文案无消费 | **修（顺手）** | M7-A §7 要求的「重连中的胶囊副文案」首次接线；重连在跑时掉线叠加态显示「正在重新连接…」 |
| types.ts:102 `serve --allow-reveal` 注释漂移 | **修** | 一行注释，reveal 未实现、CLI 无此开关 |
| M7-K Node 26 复跑 | 忽略 | 环境缺二进制，非缺陷 |
| E-8 tabindex 豁免 / 数据行不上帧 / M7-G 未授权 / M7-H/I 未签字 | 忽略 | QA 自标「合理/环境/不计缺陷」，维持 |

## 2. 修复明细

### 2.1 批次 1 · 前端连接韧性（QA-P2-8 / P2-1 / P2-4 / P2-5 / P2-2 / P2-3）

`editor/src/api/client.ts`

- **P2-4**：`response.text()` 包进 try；body 中途断与 fetch reject 同归 `HostApiError("NETWORK_UNREACHABLE")`，不再漏裸 TypeError。
- **P2-2**：`createLivenessWatchdog` 返回 `{ feed, dispose }`；dispose 清在计时定时器，此后 feed 惰性。
- **P2-3**：`subscribeEventsWithReconnect` 返回 `{ dispose, restart }`。`restart()` 静默拆当前流（不触发调用方 onClose）、计一次失败走统一退避重建；配**代际守卫**——建流 fetch 未决时被 restart 打断的旧连接，其迟到的 onOpen/onClose/事件/.then 一律丢弃并自行销毁（不误报在线、不重复排重连、不覆盖新流）。

`editor/src/app/state.ts`

- 新增 action `draftSaveFailed`：自动保存非业务失败 → 按脏格数回 ReadyDirty/ReadyClean，不落 Failed。
- 新增 action `recover`：只清连接类残留（SavingDraft 卡死、无业务 failKind 的 Failed）；带 failKind 的业务终态（VCS/SCHEMA_CHANGED/DRAFT_VERSION_CONFLICT）不清。

`editor/src/app/App.tsx`

- 自动保存（`persistDraft`）错误分类收紧：DRAFT_VERSION_CONFLICT → failed(kind)（原样）；NETWORK_UNREACHABLE → 掉线（原样）；**其余（401 换 token 竞态、5xx 等）→ draftSaveFailed + 重排一次自动保存**——不再错配「提交失败」胶囊、不锁格、脏格不丢（QA-P2-8 核心）。
- 开表与会话拉取的 401 UNAUTHORIZED 归掉线派生态（坏 token 与 Host 不在的补救一致：重跑 serve 拿新链接，Blocked 横幅文案已覆盖该指引）。
- SSE 重连成功（onOpen）统一走 `recoverOnReconnect`：表未挂上（首连失败）→ 重走 session + 开表；已挂表 → recover 回可编辑态并按脏格重排自动保存（P2-1）。
- 看门狗 onDead → 掉线 + `eventStream.restart()`（P2-3 接线）；effect cleanup 补看门狗 dispose（P2-2）。
- 掉线叠加态新增 `reconnecting` 上下文：重连在跑时胶囊/横幅切 `COPY.phase.reconnecting` / `COPY.banner.reconnecting`（P2-5，冻结文案首次消费）；`TopBar.phaseNameOf` 把该 label 归入枚举 `Offline`（§5 同一行）。

`editor/src/app/copy.ts`：新增 `status.draftSaveRetry`（aria-live 提示「草稿暂未保存…」，过 BANNED 正则）。

### 2.2 批次 2 · Host 源文件端点（P2-6 / P2-7）

`src/lumio_config/editor/source_view.py`

- **P2-6**：先 `path.stat().st_size` 判 2MiB 再读；边界 4 的成员判断从 `table_projection` 换成新增的 `EditorSession.is_loaded`——`table_projection` 为算指纹会整读源文件（fingerprint.py:95），会把 stat 先行的次序翻回去（QA 只观测到「413 在整读后」，根因在此）。
- **P2-7**：`decode("utf-8")` 包 try，非 UTF-8 回 `422 UNSUPPORTED_ENCODING` JSON；不再以 RemoteDisconnected 断连收场（客户端不再误判掉线）。

### 2.3 批次 3 · UI 落字（QA-P3-1 / QA-P3-2 / 注释漂移）

- **QA-P3-1**：`StatusBar` 的 `status-table` 增加 `title = <表名> · tables/<表名>.txt`（优先 Host 下发 `sourcePath`，App 统一传当前表路径）；TopBar 表名按钮的 title 保留为第二悬浮点，过时「兜底」注释更正。
- **QA-P3-2**：`projection.ts` 抽出 `headerSecondLine`（列头第二行与悬浮 title 第二行**同一函数**，永不漂移）；`headerTitleText` 改三行——完整列名 / 中文类型·可见性 / 约束（必填·默认值·枚举·范围），英文字面量（i32/S）不再出现在悬浮 title。检查器「类型」双显 `整数（i32）`（u32/i32 译名同但不失区分），「可见性」逐字符展开中文。
- `types.ts` reveal 注释更正为「未实现，Host 恒 false，CLI 无对应开关」。

## 3. 测试证据

单测（vitest 42 文件 / **388 passed**，基线 378 + 新增 10）：

- `client-sse.test.ts`：text() 中断归类、看门狗 dispose、restart 拆健康流不给调用方误报 onClose、**建流 fetch 未决时 restart 的代际守卫**（迟到的旧流回调丢弃且不覆盖新流）。
- `state.test.ts`：draftSaveFailed 回可编辑态保脏格；recover 只清连接类残留、三种业务 failKind 不清。
- `phaseView.test.ts`：重连在跑时掉线叠加态文案/转圈/锁定与四 can 不变。
- `projection.roundtrip.test.ts`：悬浮 title 三行形状（damage / id·SCV），不含 i32 与「可见性 S」。
- `StatusBar.test.tsx`：status-table title 下发优先/未接线推导两分支。
- `Inspector.test.tsx`：类型双显、SCV 展开。

E2E（Playwright chromium **62 passed**，基线 60 + 新增 2，`host-offline.spec.ts`）：

- `P2-1 first-connect failure recovers after unblock`：route abort `/api/**` → Blocked → unroute → **1123ms** 回可编辑 Ready 态且工作簿重新挂上（串行套件下重放 test 1 草稿为 ReadyDirty——脏格回来了也算恢复），全程零「提交失败」、零 uncaught。
- `QA-P2-8 autosave 401 keeps grid editable and retries to saved`：脏格 PUT 一律 401 → ReadyDirty 可编辑、hint「草稿暂未保存」、map 存活；unroute 后自动重试把草稿真正存上（draftVersion > 0），脏格原样。
- 既有 S01/S03/S04 不回归：S01 Blocked **14ms**（预算 8s）、S04 回在线 **827ms**（预算 12s）。

Python（unittest **171 passed**，基线 168 + 新增 3，`tests/test_editor_source_view.py`）：

- 超大文件在 `read_bytes` 之前被拒（mock 断言整读不发生）+ 既有 413 断言不回归。
- 非 UTF-8 的 table/schema 均回 422 JSON、Host 与会话仍健康。

## 4. 门槛输出（全绿）

```text
corepack pnpm lint          → eslint 0 error + tsc --noEmit + check-deps ok
corepack pnpm vitest run    → 42 files / 388 passed
corepack pnpm build         → ✓ built in 14.62s;editor_static 仅 bundle 哈希轮换
corepack pnpm e2e (CI=1)    → 62 passed (1.5m)
python -m unittest discover → 171 tests OK
python tools/lumio_config.py validate         → validate: OK
python tools/lumio_config.py format --check   → format: OK
git diff --check            → 空
spec-lint                   → OK
```

## 5. 残留与边界

- **P2-3 黑洞连接**的活体验证（无 FIN/RST 挂起）在 Windows 本机依旧不可行，验收止于单测级（模拟永挂流 + 看门狗判死 → restart 重建）。维持 QA 未覆盖声明。
- **M7-K S01 Node 26** 复跑仍未覆盖（本机无二进制）。
- QA-P3-2 是对 M7-C「列头 title 现有内容不删」的有意修订（约束信息保留，类型/可见性换中文、检查器双显）——本文件即决策记录，未动 ADR。
- `copy.ts` 的 `COPY.grid.fullColumnName`、`COPY.phase/banner.reconnecting` 均已有消费点（后者为本批接线）；无新增孤儿文案。

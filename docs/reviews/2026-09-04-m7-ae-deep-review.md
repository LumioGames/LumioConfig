# M7-A / M7-E 对抗式深审报告（编辑器 v3 加固批次）

- 审查人：收口 reviewer（对抗式深审）
- 日期：2026-09-04
- 范围：`feat/editor-v3-hardening` @ `4c12a19..HEAD`，仅深审两张卡：
  - **M7-A 掉线可感知（P1，R-00396）**——全局连接生命周期
  - **M7-E 源文件只读端点 + 查看器（P2，R-00399，安全面）**——新增读文件攻击面
- 方法：源码逐行审（非仅 diff）+ 独立对抗探针（live server 18 条恶意路径）+ 本机复跑全部相关测试与两条 e2e。只读审查，未改任何仓库文件。

## 裁决：MERGE

无 P0 / 无 P1。两张卡的验收项 S01–S04 全部成立且有测试实证；M7-E 安全面四道边界在测试与独立探针下均无绕过。发现 7 项 P2（均为边角 / 纵深加固 / 死代码，不阻塞合入）与若干 P3 备注，建议列入后续批次。

---

## 一、M7-A 掉线可感知

### 1.1 逐点核验（对照需求「要做什么」§1–§7 与 Task 3 简报）

| 要求 | 实现位置 | 结论 |
| --- | --- | --- |
| §1 `subscribeEvents` 生命周期回调，建流失败不抛 | `editor/src/api/client.ts:103-180` | ✅ fetch reject / `!ok` / 无 body → `onClose("error")`；`onOpen` 每次成功建流一次 |
| §1 心跳探测在字节层 | `client.ts:142-147` | ✅ 每次 `reader.read()` 非空 `value` → `onHeartbeat()`，`:\n\n` 注释块也被喂到（handler 层看不到它） |
| §1 主动 dispose 不触发 onClose | `client.ts:125-134`（`cancelled`/`reported` 双标志） | ✅ dispose 后 pump 的 `ended`/`error` 都被 `cancelled` 抑制；单测 `client-sse.test.ts:171-183` 实证 |
| §2 `api()` 区分网络不可达 | `client.ts:41-49` | ✅ fetch reject → `HostApiError("NETWORK_UNREACHABLE")`；HTTP 业务码透传不变（单测 `:324-332`）。⚠ 见 P2-4（`response.text()` reject 未包） |
| §3 draftSession 透传 + `.catch` | `editor/src/api/draftSession.ts:51-73` | ✅ 已做。⚠ 见 P3-1（该路径实际未被 App 使用） |
| §4 看门狗 5000ms / 只触发一次 / feed 复活 | `client.ts:187-215` | ✅ 语义正确（先喂后计时、`dead` 标志只触发一次、feed 复活），单测 `client-sse.test.ts:186-214` 全覆盖。⚠ 无 cancel API，见 P2-2 |
| §5 退避重连 1s→2s→5s→10s→10s… | `client.ts:217-294` | ✅ 序列与封顶正确（`:222-224`）；成功清零（`onOpen` → `failures=0`）；每次失败一条 `console.warn`；dispose 后 `clearRetry` + 置 `disposed` 停止重连；重连期间不刷数据不动草稿；每次尝试重读 token（`client.ts:104`，支撑 e2e 的换 token 恢复） |
| §6 App 接线 | `editor/src/app/App.tsx:837-903`（订阅+看门狗）、`:190-195`（failOffline）、`:534-536`（openTable 守卫）、六处 catch（`:299/:602/:645/:730/:809/:854`）全部先判 `NETWORK_UNREACHABLE` | ✅ 见 1.2 |
| §7 文案 | `copy.ts:24,42` offline 已消费 | ⚠ `COPY.phase.reconnecting`/`COPY.banner.reconnecting`（`copy.ts:25,43`）**定义后无任何组件消费**，见 P2-5 |

### 1.2 接线审计（App.tsx）

- **catch 全覆盖**：App.tsx 共 11 处 catch（`:288/:564/:587/:601/:644/:716/:729/:808/:853/:1275`）。六处会落全局 `failed` 的 catch 全部先判 `NETWORK_UNREACHABLE → failOffline()`；其余为局部吞掉（ref 加载、seen 刷新、history 面板），不产生「提交失败」误配。ExportTab 出错只落面板内 hint（`ExportTab.tsx:148-158`），且 TopBar 导出按钮 `disabled={!view.can.export}`（`TopBar.tsx:396`）——掉线时 `can.export=false`，S03 的「点导出」被结构性挡住。
- **openTable 守卫**：`App.tsx:534` `hostMode && phase !== "Opening" && !online → return`。正常路径（online=true）不触发；Opening 例外是首次加载的放行口，不误伤；守卫返回**不调 disposeSheet**，Univer 实例保留（e2e `host-offline.spec.ts:179` 断言 `__lumioPoc.map()` 非空，白屏回归哨兵在位）。
- **failOffline / Blocked 消费链**：`App.tsx:190-195` 掉线派生 `online:false`；仅 Opening 时补 `dispatch failed`（带 offline hint）以离开 Opening，使 `App.tsx:1846` 的 `hostMode && !online && phase !== "Opening"` 达成、Blocked（kind=offline）整页渲染。`phaseView.ts:60-69` `!online` 优先于一切阶段——即使 phase=Failed 也显示离线胶囊而非「提交失败」。链路自洽。
- **误判方向核查**：401/409/422 等 HTTP 业务错误不会被当成掉线（`api()` 只在 fetch reject 时抛 NETWORK_UNREACHABLE，`client-sse.test.ts:324-332` 断言 409 原样透传）；掉线也不会被当成业务错误（fetch reject 恒为 NETWORK_UNREACHABLE）。⚠ 唯一漏网：响应中途断流（`response.text()` reject）逃逸为裸 TypeError → 落 `failed`，见 P2-4。
- **效果稳定性（看门狗误判死的前提排查）**：SSE 订阅 effect 依赖 `[hostMode, rebaseNow, failOffline]`；逐层核过全部传递依赖（`markDirty[hostMode]` → `writeToken[markDirty]` → `applyFourStateToSelection[selectionRowColumn,writeToken]` → `mountWorkbook[...]` → `rebaseNow[disposeSheet[],hostMode,mountWorkbook,failOffline[dispatch]]`），全为稳定引用，**effect 每挂载只跑一次**，当前不存在"重跑后旧看门狗 5 秒后误派 offline"的活路径（亦无 StrictMode）。风险为潜伏性，见 P2-2。

### 1.3 验收实证（本机复跑）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| S01/S03/S04 e2e | `playwright test tests/e2e/host-offline.spec.ts` | **1 passed**；S01 Blocked 出现于 kill 后 **10ms**（预算 8000ms），S04 重启后 **820ms** 回在线（预算 12000ms），全程 0 uncaught、无「提交失败」、草稿 token 原样保留 |
| 单元 | `vitest run tests/client-sse.test.ts` | 18 passed（生命周期/心跳/看门狗/退避/NETWORK_UNREACHABLE/provider 透传全覆盖） |
| 全量 | `vitest run` | 378 passed / 42 files（与台账一致） |

S02 的「不误报」：订阅生命周期挂在 App 级 effect 而非每表，切表/关抽屉不 dispose 流；单测断言主动 dispose 不调 onClose；e2e 正常旅程中在线态稳定。

### 1.4 M7-A 问题清单

**P2-1 首连失败后自动恢复落入「提交失败」锁死网格。** 页面在 Host 已死时打开：加载失败 → `failOffline` 落 `failed`（Opening 例外，正确）；Host 之后重启 → SSE 自动重连 `onOpen` → `online:true` → Blocked 整页**消失**，但 phase 仍是 `Failed`（无任何自动补载路径）→ 胶囊 `COPY.phase.failed`（"提交失败"，`copy.ts:20`）、gridLocked、四 can 全 false。这正是 M7-A 要消灭的「没点过提交却显示提交失败」文案错配，在"从未连上→后来连上"这一支复活了；需用户点一次表（openTable 守卫放行 online 路径，可恢复）或刷新。证据：`App.tsx:190-195`（failed 仅 Opening 时落）、`App.tsx:868-871`（onOpen 只派 online，无数据补拉）、`phaseView.ts:141-184`。建议：onOpen 时若 `mapRef.current == null`（从未挂载成功）自动重放 `openTable(state.table)`，或 failOffline 的 Opening 分支改用可自愈的中间态。

**P2-2 看门狗无 cancel，onDead 闭包不受 dispose 保护。** `createLivenessWatchdog` 只返回 `{feed}`（`client.ts:193-215`），effect cleanup 只 `stop()` 订阅（`App.tsx:902`），看门狗计时器悬挂；触发时无条件 `dispatch online:false`（`App.tsx:864`）。当前因依赖全稳定 + App 为根组件，悬挂计时器只在卸载后触发（React 18 无副作用），**不构成活 bug**；但任何未来给该 effect 加不稳定依赖的人都会得到"重连成功 5 秒后被旧计时器打成假离线且永不自愈"（onOpen 只在重建流时触发）。建议加 `dispose()` 并在 cleanup 调用。

**P2-3 看门狗判死不驱动重连（黑洞连接不恢复）。** 重连只由 `onClose` 触发（`client.ts:265-277`）；连接若无 FIN/RST 地黑洞化（睡眠唤醒、网卡切换——本机 serve 被杀场景有 RST，e2e 覆盖的是这条），`reader.read()` 可无限悬挂：看门狗 5 秒判死、Blocked 出现（感知对了），但**永远不会发起重连**，直到浏览器自己报错流（TCP 级可达分钟级）。建议 `onDead` 里同时 stop 当前订阅以触发退避重连。需求文档本身也只写了 `onDead → online:false`，属规格级缺口。

**P2-4 `api()` 未包 `response.text()` 的 reject。** try 只围 `fetch`（`client.ts:41-49`）；Host 在响应头之后、body 完成之前死掉时 `response.text()` 抛裸 TypeError → 落通用 `failed`（"提交失败"）。与 §2"网络不可达与业务错误区分"的精神不符。常见场景（进程死）会被 SSE 掉线派生掩盖，影响限于半途断流。建议把 `text()` 一并纳入 try，同样归一为 NETWORK_UNREACHABLE。

**P2-5 重连中文案未消费。** `COPY.phase.reconnecting` / `COPY.banner.reconnecting`（`copy.ts:25,43`）由 X1 契约卡入仓后无任何渲染点：退避等待期间用户看到的与彻底死连的文案完全相同（"无法连接本机服务。请重新运行 serve…"），需求 §7"唯一新增：重连中的胶囊副文案"未落地。验收表 S01–S04 未考此项，故不阻塞；列为跟进。

**P3-1 provider.subscribe 成死接线。** App 直接用 `subscribeEventsWithReconnect`（`App.tsx:867`），`LocalDraftSessionProvider.subscribe`（`draftSession.ts:51-73`，纯 `subscribeEvents` 无重连）无调用方——未来任何经 provider 订阅的消费方都会静默失去重连。建议 provider 内部改用带重连驱动器，或删掉该接口方法。

**P3-2 重连间隙事件无重放。** Host SSE 无 Last-Event-ID/重放（`server.py:418-437`），掉线期间的 `repo_revision_changed` 丢失，用户在旧基线上继续编辑，直到提交撞 STALE_BASELINE 或切表重载。规格已接受（"重连期间不刷数据"），建议在用户文档标注此已知边界。

**P3-3 Opening 失败旅程无自动化覆盖。** "页面在 Host 已死时打开 → Blocked → Host 起来 → 恢复"这一支只有代码级核验（也正是 P2-1 所在支），无 e2e/单测。

---

## 二、M7-E 源文件只读端点 + 查看器（安全面）

### 2.1 四道边界逐道核验（`src/lumio_config/editor/source_view.py`）

| 边界 | 实现 | 结论 |
| --- | --- | --- |
| 1 表名校验 | `:24` 复用 `server.py:33 _valid_table()`（`^[A-Za-z0-9_.-]+$` + 显式拒 `..`），失败 404 NOT_FOUND | ✅ `/`、`\`、`:`（盘符/ADS）、`%`、空格、`~`、`%00` 全被正则拒 |
| 2 kind 闭合枚举 | `:12-15,27-31` 两值 dict → 写死 `(directory, suffix)`；路径任何一段不由请求拼装；非法 400 | ✅ 大小写敏感（`TABLE`→400）；构造性免疫穿越 |
| 3 resolve+relative_to | `:37-45` `root.resolve()` + `path.resolve()` + `relative_to(root)`，越界 403 | ✅ 兜底真实在位（连 symlink 外指也会被 resolve 暴露后 403） |
| 4 只放行已加载表 | `:34-36` `table_projection(table) is None` → 404 UNKNOWN_TABLE | ✅ 磁盘存在但未加载（orphan/ads 诱饵）不可读 |

**鉴权继承（读分发顺序核实，非信注释）**：`server.py:166-171`——`do_GET` 中 `path.startswith("/api/")` 分支**第一件事**就是 `_authorize_api()`（Host 头 loopback :150-154 → Origin 匹配 :155-158 → Bearer token 全等 :159-164），`_EXTRA_ROUTES` 循环在 `:198-202`，位于三道检查之后。`source_view.py:66` 注册的 `GET /api/tables/(?P<table>[^/]+)/source` 只能经此路径触达。**核实为真，零新鉴权代码。**

**路由正则绕过排查**：`do_GET:168` 先 `unquote` 再匹配。逐项验证：
- `%2F` 先解码为 `/` → `[^/]+` 无法跨越 → 不匹配该路由（404 unknown api path），不存在"编码斜杠进表名"。
- 双重编码 `%252e%252e%252f` → 解一次为 `%2e%2e%2f` → `%` 不在白名单 → 拒。
- 静态路由（`/api/tables/([^/]+)` `:175`）fullmatch 不含 `/source` 后缀，不会抢匹配。
- handler 内不再二次解码表名（query 的 `kind` 经 `parse_qs` 解码后仍须命中闭合枚举，无自由拼装）。

**独立对抗探针（本机 live server，18 条，超出九条边界用例）**：`%00`、`%5C`反斜杠穿越、`kind=TABLE/Table`、`kind=table&kind=exe`（首值语义，取 table，仍闭合）、`kind=exe&kind=table`（400）、路径分号参数、尾点表名 `skills.`、尾空格、`kind=t%61ble`（解码后仍 table，闭合枚举内）、query 内 `%2e%2e%2f`、`kind=table%00`、诱饵文件 ads.txt（在 tables/ 但未加载）、`skills.txt` 后缀走私、编码的 `schemas/skills.json`、三层 `..` 到 Windows 目录、`/API/` 大小写、尾斜杠、空表名——**全部 404/400，零字节泄露**（探针同时校验三枚诱饵 secret 不出现在任何响应体）。

### 2.2 Host 其余口径

- 2 MiB 上限 → 413 `PAYLOAD_TOO_LARGE`（`:50-51`），前后端三态对齐；测试 `test_editor_source_view.py:257-275` 用真实 >2MiB 的已加载表验证 413 且响应 <64KiB。⚠ 见 P2-6/P2-7。
- 内容逐字节一致：S01 两条（table/schema）做 `text.encode("utf-8") == raw` 字节级断言（`:102-124`）。

### 2.3 前端（Task 15 + 接线点 2）

- **只读性**：`SourceViewDialog.tsx` 全文渲染在 `<pre>{view.data.text}`（`:197-199`，React 转义，无 XSS/innerHTML）；仅有的外呼是 GET `sourceFile`（`client.ts:84-90`，`encodeURIComponent` 表名 + 闭合 kind）；「复制全文」只写剪贴板。**无任何写回路径**（不撞 ADR 0-1 §2）。无缓存：effect 依赖 `[open, table, kind]` 重拉（`:119-143`），App 侧关闭即卸载（`App.tsx:1396-1404`），单测 `SourceViewDialog.test.tsx:170` 断言不缓存。
- **三态**：loading / tooLarge（413 按 `code === "PAYLOAD_TOO_LARGE"` 鸭子判型）/ failed，各有 testid 与文案（`copy.ts:144-152`）；单测 9 条覆盖（含 Esc、焦点还原、复制全文 toast）。
- **TableList**：右键 + `Shift+F10`/`ContextMenu` 键双入口（`TableList.tsx:87-99`），折叠态 rail 同样有（`:169-170`）；第三项 `revealEnabled === true` 才整项渲染（`:118-126`，非禁用态）——App 由 `session.capabilities.reveal === true` 供料（`App.tsx:846`），本批 Task 16 未扇出、`allow_reveal` 默认 False → 整项不渲染，e2e `host-source-view.spec.ts:129-130` 断言恰好 2 项。
- **e2e**：右键 → 菜单 → 查看源文件 → 断言 `tables/skills.txt` 真实首行 `table: skills` + 只读提示 + 行号（`host-source-view.spec.ts:120-146`）。本机复跑 1 passed。

### 2.4 测试实证（本机复跑）

| 命令 | 结果 |
| --- | --- |
| `python -m unittest tests.test_editor_source_view -v` | **12 OK**（S01×2 + 九边界 + 413） |
| `python -m unittest tests.test_editor_server tests.test_editor_export` | 21 OK |
| 独立探针（18 条恶意路径 + 诱饵泄露断言） | 全拒，零泄露 |
| `vitest run tests/SourceViewDialog.test.tsx tests/TableList.test.tsx` | 28 passed |

### 2.5 M7-E 问题清单

**P2-6 413 判定在整读之后。** `source_view.py:49-51` 先 `path.read_bytes()` 再比长度——超大文件被完整读入内存才回 413。文件是仓内的（攻击者不能凭空造大文件），但提交路径可造出大表；建议先 `path.stat().st_size` 判长再读。

**P2-7 非 UTF-8 文件会以未处理异常断连。** `:60` `data.decode("utf-8")` 若抛 UnicodeDecodeError，`do_GET` 无兜底 → 连接被BaseHTTPRequestHandler 掐断、无 JSON 错误体。仅在已加载表的文件被外部改成非法 UTF-8 时可达（会话加载本身已隐含 UTF-8 解析成功）；建议 try/except → 422 或 500 JSON。

**P3-4 手改 local.json 开 reveal 得到静默 noop 菜单项。** `allow_reveal` 字段已在 Settings（`settings.py:25`），用户手改 `.lumio/local.json` 置 true 后第三项渲染，但 App 未传 `onReveal`（`App.tsx:1373-1395`）→ 点击无任何反馈。Task 16 落地前可考虑 capability 与端点同批开放，或 reveal 项在无 `onReveal` 回调时不渲染。

**P3-5 `copyAll` 的剪贴板 Promise 无 `.catch`。** `SourceViewDialog.tsx:156-158`——剪贴板被拒时产生 unhandled rejection（控制台噪音，非崩溃）。

**P3-6 e2e 的 skip 分支已成死代码。** `host-source-view.spec.ts:137-140` 为接线前设计的 skip 探测，接线已落地（dialog 恒可见），可删。

---

## 三、结论

- **M7-A**：架构与实现质量高（双标志抑制 dispose 误报、字节层心跳、退避驱动器、catch 全覆盖、结构性挡导出），验收 S01–S04 以 10ms/820ms 实测通过；剩余问题集中在"首连失败后恢复"与"看门狗不驱动重连"两个边角及两处包装遗漏，均不违背已承诺的验收口径。
- **M7-E**：四道边界 + 鉴权继承经分发顺序核实与 30 条独立向量（12 单测 + 18 探针）双重实证，无绕过、无越界字节；前端严格只读、capability 门控落实；两处 P2 为纵深加固（先 stat 后读、decode 兜底）。

**MERGE**——建议把 P2-1/P2-3（M7-A 恢复路径）与 P2-6/P2-7（M7-E 纵深）排入下一个小批次，P3 项随手清。

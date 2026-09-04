# 网页编辑器 v3（M6 + M7）独立 QA 报告

- 日期：2026-09-04
- 角色：独立对抗式 QA（只找问题、取证、写报告，不改产品）
- 被测 HEAD：`8328a2f97f2a6bc5a2a1fdfa07e68a3d54a50503`（进场 `git status` 干净，`main` 相对 `origin/main` ahead 1）
- 环境：Windows · Node v24.18.0 · Python 3.12.10 · corepack pnpm 9.15.9
- 破坏性用例根：临时仓 `{SCRATCH}/temp-repo`（`schemas/` `tables/` `registry/` `repository.yaml` + `git init`，revision `d1d2eeb`）；P2-6/P2-7 另起 `{SCRATCH}/p27-*-repo`
- 证据目录：`{SCRATCH}` = `C:\Users\g923\AppData\Local\Temp\grok-goal-dfe4f8ef08fc\implementer`；截图 `docs/reviews/assets/qa-2026-09-04/`
- 本机限制（OBJECTIVE §8.11，非缺陷）：Windows Chromium 下 Univer **数据行不上帧**；行级断言一律走 `window.__lumioPoc`（Playwright `bypassCSP: true`）

---

## 1. 一页结论

**有条件通过。**

| 级 | 新缺陷计数 | 说明 |
| --- | ---: | --- |
| P0 | 0 | 未观测到权威源被写坏、仓外字节泄漏、或不可恢复白屏 |
| P1 | 0 | M7-A 官方 e2e 路径（先 `saveDraftNow` 再 kill）S01/S03/S04 绿；无「假在线 / 错误跳格失效 / 提交成功 UI 报失败」 |
| P2 | **1** | 新缺陷 QA-P2-8（脏会话杀 Host + 换 token 重连落入 Failed/「提交失败」）。OBJECTIVE §8 的 P2-1～P2-7 **仍在**，计复核，不计入本列 |
| P3 | **2** | QA-P3-1 `status-table` 无路径 title；QA-P3-2 检查器 / 列头 `title` 仍英文类型与原样可见性 |

**发布建议：** 门槛全绿（Node 24 + Python 3.12），M7-B/C/D/E/F 黑盒旅程可走通，源文件与导出攻击面未打穿。但 M7-A 在「未等自动保存完成就杀 Host、再换 token 重连」这条真实用户路径上会锁死网格并错配「提交失败」——与本卡要消灭的文案错配同类。建议修 QA-P2-8 并顺手清 P2-1 后再标无条件通过。P2-6/P2-7 仍会让源文件端点在坏文件上断连或整读 2MiB+，不阻塞配表主路径。

M7-G reveal 缺席、M7-H 未获回话、M7-I 未获签字 **不计缺陷**。Node 26 vitest 本机无二进制，M7-K S01 记未覆盖。

---

## 2. 缺陷清单

OBJECTIVE §8 条目见第 5 节，不在此重复计数。

### QA-P2-8 · 脏会话杀 Host 换 token 重连落入 Failed / 「提交失败」（表格锁定）

| 项 | 内容 |
| --- | --- |
| 级别 | **P2**（有绕法：再点当前表名可离开 Failed；文案与状态错配，网格 `gridLocked`） |
| 域 | B 掉线对抗 / M7-A S04 变体 |
| 可复制复现 | 1. 临时仓 `python tools/lumio_config.py serve --port 19103 --no-open --root <temp>` 打开 `#token=` URL。2. 等 ReadyClean。3. `__lumioPoc.applyFourState("40001","display_name","null")`，**不等** `saveDraftNow`（约 600ms）。4. kill Host 监听 PID。5. 断言 Blocked ≤8s。6. 同端口再 `serve`，把新 URL 的 token 写入 `sessionStorage["lumio-token"]`。7. 等 `status-online` 含「在线」。 |
| 期望 | ≤12s 回在线、胶囊不是「提交失败」、可继续编辑、脏格还在（M7-A S04） |
| 实际 | 三次独立复现全部：回在线，但 `phase=Failed`、胶囊「提交失败」、`data-tone=red`、Blocked 消失。点 `table-skills` 后离开 Failed；若 Host 从未收到该草稿 PUT，点表会从仓库重载，**内存里的未保存脏格丢失** |
| 证据 | `{SCRATCH}/probes/remain-facts.json`：`s04Ms=3707`，`s04.capsule=提交失败`，`title=Failed`，`raw.null` 仍在。`{SCRATCH}/probes/s04-visuals.json` S04A：`s01Ms=9`，`s04Ms=3346`，`s04.capsule=提交失败`；`net` 中 `PUT /api/drafts/skills` **401**；`afterClickTable` 变 `ReadyClean` / `Fireball`（脏格丢）。S04B：`s01Ms=8`，`s04Ms=3580`，同样 Failed。Failed 帧截图 `40-legend-dialog-1440x900.png`（胶囊「提交失败」、`1 格未提交`）。`36-offline-reconnected-1440x900.png` 是 S04A **点表之后**的 ReadyClean / Fireball（脏格丢失），`47-s04-race-second-1440x900.png` 是 S04B 点表之后的 ReadyDirty，都不是 Failed 瞬间（同脚本后续步骤覆盖了同名文件） |
| 第二次确认 | S04A + S04B（端口 19103）+ remain（端口 19102），形状相同 |
| 怀疑根因（猜测） | `persistDraft` 在旧 token 下 PUT → 401 `UNAUTHORIZED`，该码不是 `NETWORK_UNREACHABLE`，落入 `editor/src/app/App.tsx:303` 的通用 `failed`（胶囊 `COPY.phase.failed` =「提交失败」）。官方 e2e `host-offline.spec.ts:147-151` 在 kill **之前** `saveDraftNow()`，避开这条竞态，故 e2e 仍绿 |

对照：官方 e2e 本机复跑 `[M7-A S04] back online 820ms`，`ok 29 host-offline.spec.ts`，**不**断言重连后胶囊不是「提交失败」。

### QA-P3-1 · `status-table` 无源文件路径 `title`（M7-D S04 字面未达）

| 项 | 内容 |
| --- | --- |
| 级别 | **P3** |
| 域 | A / M7-D |
| 复现 | Host 模式 ReadyClean：读 `[data-testid="status-table"]` 与 `[data-testid="topbar-table"]` 的 `title` |
| 期望 | 需求原文 S04：`status-table` 的 `title` 含源文件路径 |
| 实际 | `status-table` 文本 `skills`、`title=null`；路径在顶栏 `topbar-table` title = `skills · tables/skills.txt`。开发方交回物声明「口径」落点改到顶栏 |
| 证据 | `{SCRATCH}/probes/ui-facts.json` `readyDom.statusTableTitle=null` / `topbarTableTitle="skills · tables/skills.txt"`；`ui3-facts.json` 同；`editor/src/panels/StatusBar.tsx:109` 无 title 属性；`editor/src/panels/TopBar.tsx:276,339` |

### QA-P3-2 · 检查器「列约束」与列头悬浮 title 仍英文类型 / 原样可见性

| 项 | 内容 |
| --- | --- |
| 级别 | **P3** |
| 域 | A / M7-C 周边（S01 验收对象是网格列头第二行，该项本身 复核通过） |
| 复现 | 点 damage / id / effect_id 格，读检查器「列约束」；悬浮列头读 `title` |
| 期望 | 用户可见类型/可见性与列头第二行同一套中文（`整数 · 服务端`） |
| 实际 | 检查器：`类型 i32` / `u32` / `ref→effects`，`可见性 S` / `SCV`。列头 title：`完整列名：damage · 类型 i32 · 必填 · 范围 ≥0 · 可见性 S` |
| 证据 | `{SCRATCH}/probes/ui2-facts.json` `inspector1`/`inspectorId`/`inspectorRef`/`headerTooltip`；`editor/src/panels/Inspector.tsx:257` `columnTypeLabel`；`editor/src/spreadsheet/projection.ts:224-246` `headerTitleText` 仍用 `columnTypeLabel` + `column.visibility`。截图 `15-inspector-damage-1-1440x900.png`（类型 i32 / 可见性 S）、`17-inspector-id-1440x900.png`（u32 / SCV）、`18-inspector-ref-1440x900.png`（ref→effects / S）、`19-header-tooltip-damage-1440x900.png`（title「完整列名：damage · 类型 i32 · … · 可见性 S」） |

### 未复现，怀疑路径（不计缺陷）

- **P2-3 黑洞连接不重连：** 本机未做无 FIN/RST 挂起；源码 `subscribeEventsWithReconnect` 只在 `onClose` 里 `setTimeout(connect)`（`client.ts:265-276`），`createLivenessWatchdog` 的 `onDead` 只 `dispatch online:false`（`App.tsx:862-864`）。记复核，见 §5。
- **P2-4 `response.text()` reject：** 未构造「响应头已到、body 中途断」而不杀进程的探针。
- **Unicode 同形表名 `skіlls`：** 客户端 `urllib` 在发请求前 `UnicodeEncodeError`（latin-1 `і`），Host 未收到；`leaked_secret=false`。不是 Host 绕过。
- **局域网 IP 直连：** `192.168.1.33:18991` `ConnectionRefused`——Host 绑定 `127.0.0.1`（`server.py:83`），非 loopback 根本连不上。Host 头伪造成非 loopback 已测 403 `FORBIDDEN_HOST`。

---

## 3. 覆盖矩阵

单元格取值：实测通过（证据）/ 复核通过（复引自动用例）/ 未覆盖（原因）。

### 3.1 十二张卡 × S01–S04

| 卡 | S01 | S02 | S03 | S04 |
| --- | --- | --- | --- | --- |
| **M7-A** | **实测通过。** kill 后 Blocked：remain 8ms、S04A 9ms、S04B 8ms、e2e 11ms（预算 8000ms）。`status-online=离线`，胶囊「无法连接本机服务」，`title=Offline`，`data-tone=red`。截图 `35-offline-killed-1440x900.png`、`39-offline-killed-s04-1440x900.png` | **复核通过** `editor/tests/client-sse.test.ts:171`（主动 dispose 不调 onClose）+ e2e 正常切表零误报。实走：掉线中点 `table-effects` 仍 Offline、无「提交失败」（remain `s03`） | **实测通过。** 掉线切表 `failedCopy=false`、`mapAlive=true`、`pageErrors=[]`。e2e `ok 29 host-offline.spec.ts`（S03 断言「提交失败」count=0 且 map 仍在） | **复核通过**（官方路径：`host-offline.spec.ts:147-151` 先 `saveDraftNow` 再 kill；e2e S04 820ms，草稿 token 仍 `null`；**不**断言重连后胶囊不是「提交失败」）。**对抗变体见 QA-P2-8，不把该格标实测通过** |
| **M7-B** | **实测通过。** null damage → 预检「错误1」→ 检查器还原 → `ReadyClean` / `错误0` / 「还没有改动」/ `damage=120`。`ui2-facts.json` `afterValidate`→`afterRevert`；截图 `22-errors-after-validate-1440x900.png`、`23-errors-after-revert-1440x900.png`。e2e `ok 20` | **复核通过** `host-errors.spec.ts` S02（undo 回基线 + 切表），e2e `ok 22` | **实测通过。** ReadyDirty 预检失败时 `tabText=错误1`、`count=1`、胶囊仍「1 格未提交」（`afterValidate`） | **实测通过。** 点错误项 `lastJump={rowKey:40001,column:damage}` 且 `activeAfterJump` 相同。e2e `ok 21` |
| **M7-C** | **复核通过** `editor/tests/projection.roundtrip.test.ts:353-354`：`damage *`→`整数 · 服务端`，`id * 🔒`→`整数 · 服务端·客户端·体素`（vitest 含此文件）。本机 canvas 列头第二行不能像素读出 | **复核通过** 同文件 `columnWidth` 单测（112 下限 / 240 上限 / cooldown 宽于首行 `length*8`）。交回物写 162px，单测**未**钉该数字。实走 1440×900 未做像素折行测量（数据行不上帧） | **实测通过。** 图例「S 服务端 · C 客户端 · V 体素」（`ui-facts.json` `readyDom.legend`）；点击/键盘打开的 dialog 全文含「某列第一次标 C 是披露变更，必须过生产激活单」（`ui-facts.json` `legendDialog`、`ui2-facts.json` `legendDialogKb`、`remain-facts.json` `legendDialog`）。截图 `03`/`20`/`40` 文件名是图例，盘上内容已被后续 overlay 覆盖，不以像素为准 | **复核通过** roundtrip「徽标不进 v/token」守卫（同文件 `does not write four-state badges…`）在 vitest 378 绿内 |
| **M7-D** | **实测通过。** `GET /api/session` 三表 `sourcePath` 为 `tables/<name>.txt`，无绝对路径、无 `C:\Users`。`session-1.json`/`session-2.json` 形状一致 | **实测通过。** 顶栏菜单两项：`ui-facts.json` `pathMenu` = `源文件 tables/skills.txt` / `Schema schemas/skills.json`。截图 `02-path-menu-1440x900.png` 只清楚看到「源文件 tables/skills.txt」半幅，以 JSON 为准 | **实测通过。** 点击后 clipboard=`tables/skills.txt`，`pathToast=true`（`ui-facts.json`） | **实测通过（口径）。** 路径 title 在 `topbar-table`；`status-table` 无 title → **QA-P3-1** |
| **M7-E** | **实测通过。** `kind=table` 200 path=`tables/skills.txt`；`kind=schema` 200 path=`schemas/skills.json`。`domain-d-summary.tsv` + `source-table.json`/`source-schema.json` | **实测通过。** 九条边界 + 变体均拒绝且 `leaked=false`（见 §3.2 D）。诱饵 `SECRET_BAIT.txt` / `ads/ads.txt` 零泄漏 | **实测通过。** 右键/Shift+F10 两项，无「在资源管理器中显示」。`remain-facts.json` `sourceMenuCount=2`；`s04-visuals.json` `shiftF10.items` 两条。截图 `48-shift-f10-menu-1440x900.png` 左侧两项可见（同帧误开了命令面板）；`05` 菜单对比度低，以 JSON 为准 | **实测通过（查看器）+ 复核 413。** 只读快照文案、行号、等宽 `ui-monospace`、全文含 `table: skills`（`remain-facts.json` `sourceView` / `ui3-facts.json` `sourceView3`）。`>2MiB` HTTP 413 `PAYLOAD_TOO_LARGE` 两次（`p2-7-repro.json` p26/p26_2，端口 19112/19113）。`tests/test_editor_source_view.py` 413 断言仍在。UI「文件太大」页未单独点开超大文件（会先整读，P2-6） |
| **M7-F** | **实测通过。** TXT 下载 SHA256 = 临时仓 = 真仓：skills `D69D7A7B…E0D0`，effects `8E86DBF1…453A`，drops `77004BB0…83E4`。`export-hash-compare.json` | **复核通过** `tests/test_editor_export.py` 四态。实走 draft TXT 含字面 `null`（`export-draft2-skills.draft.txt.json`） | **实测通过。** `source=draft` 文件名 `skills.draft.txt`；README 含 `GENERATED / NOT AUTHORITATIVE` 与 `uncommitted draft`。capabilities `export: [csv,tsv,txt]`。下拉第三项「TXT（权威文本格式）」、目标列禁用 | **实测通过。** `format=txt` + `targets:["S"]` → 400 `txt export does not support targets filtering…`（`http3-illegal-post.json`） |
| **M7-G** | **实测通过（证明缺席，不计缺陷）。** `capabilities.reveal=false`（session×2）；`POST /api/reveal` 404 `unknown api path`；菜单两项；`serve --help` 无 `--allow-reveal`；DOM/命令面板无「导入/建表/资源管理器」 | **未覆盖。** Owner 未授权，无 `allow_reveal=True` 的 argv 断言环境 | **未覆盖。** 无 reveal 端点可打注入面 | **未覆盖。** CLI 无开关；`docs/reference/editor.md` 无 reveal 段（与「未实现」一致）。`types.ts:102` 注释仍写 `serve --allow-reveal`——文档漂移，见未覆盖声明 |
| **M7-H** | **复核通过（决策卡）。** `docs/reviews/2026-09-04-m7-h-architecture-questions.md` 状态 **未获回话**。不按缺功能计 | 同左 | 同左 | 同左 |
| **M7-I** | **复核通过（决策卡）。** `docs/reviews/2026-09-04-m7-i-import-decision.md` 状态 **未获签字** | 同左 | 同左 | 同左 |
| **M7-J** | **复核通过。** `.spec/knowledge/standards/dispatch.md:11` 单一落点句；本仓 grep 无第二处「交回物落 .sdd」冲突 | **实测通过。** `git ls-files .sdd/` = `.sdd/.gitignore` + `.sdd/README.md` | **实测通过。** 六份 `docs/reviews/2026-09-04-m6-{f,g,h,i,j,k}-return.md` 均在 git 中 | **复核通过。** lessons 有交回物落点条目；a11y e2e 三态 `ok 1–3`，violations `[]` |
| **M7-K** | **未覆盖（Node 26）。** 本机只有 v24.18.0；nvm/fnm/nvs 均无。Node 24 下 **实测** `pnpm vitest run` → `378 passed / 42 files`。开发方声称的 Node 26.4.0 `374+4 skip` 本机不能复核 | **实测通过。** `editor/package.json` `"node": ">=22 <26"` | **复核通过** `no-bare-localstorage.test.ts`（白名单仅 `storage.ts` / `viewState.ts`）含在 378 绿内 | **复核通过** `storage.test.ts` 9 条在 378 绿内 |
| **M7-X** | **复核通过** `copy.test.ts`（vitest 378 内；BANNED 正则仍在） | **复核通过** `pnpm lint`（eslint + `tsc --noEmit` + check-deps ok） | **复核通过** `storage.test.ts` | **未覆盖。** 不重放当时 `git diff --stat` 五文件约束 |

### 3.2 域 A–K

| 域 | 结论 |
| --- | --- |
| **A 需求对账** | 覆盖。M7-A～F 黑盒实走；M7-X/J 静态+守卫；M7-G 证明缺席；M7-H/I 决策状态。M7-K S01 Node 26 未覆盖 |
| **B 掉线对抗** | 覆盖 kill / 掉线切表 / 脏杀恢复 / 首连失败（P2-1 仍在，两次）。**黑洞连接未覆盖。** 掉线中 Ctrl+K/导出未逐条点（Blocked 整页遮罩，`can.export=false`） |
| **C 错误/冲突/并发** | 预检→还原、错误跳格、双标签 `DRAFT_VERSION_CONFLICT`（胶囊「草稿已在别处更新」，截图 `46-draft-conflict-tab2-1440x900.png`）实测。冲突三列解决 / `DELETED_ROW_CONFLICT` / `SCHEMA_CHANGED` 文件级 / 外部 git commit→Stale **未覆盖**（冲突解决走 e2e `host-rebase` 复核：`ok 30–32`）。脏树默认拒绝：`allowDirtyWorkingTree=false` 时 `WORKING_TREE_DIRTY` 实测（offline 重启失败） |
| **D 安全** | **实测通过**（下方 HTTP 对）。无仓外字节。公式输入拦截；CSV `'` 前缀两次。无导入/建表/reveal 端点 |
| **E 数据完整性** | 四态→预检→还原实测；`POST /api/patch/apply` 在**临时仓** `damage 120→121` commit `83fc97f4…`，真仓 `tables/skills.txt` SHA 始终 `D69D7A7B…E0D0`。10k 行 Host 提交 **未覆盖**（fixture e2e `ok 4` 26.6s 仅 POC） |
| **F 键盘/a11y** | Ctrl+K 面板、Shift+F10、图例 Enter/Esc 实测。J2/J4/J5 e2e `ok 36–38`（`APP_WIRED=true`）。axe 三态 e2e `ok 1–3`。E-5：chrome/胶囊/冲突横幅灰度走查（截图 `26`/`32`/`43`/`44`）；**数据行徽标因不上帧未辨** |
| **G 状态机/文案** | `setPhase` 注入 14 阶段+掉线叠加，`phase-matrix.json`：可见英文 `[]`，胶囊中文。`COPY.phase.reconnecting` 无消费点（P2-5 复核） |
| **H 并发时序** | 双标签草稿冲突实测。检查器开着连切表×20、提交中切表、Ctrl+S 与自动保存竞争 **未覆盖**（dispose 竞态依赖既有回归 e2e，未单独压） |
| **I 边界/环境** | 1280×720 布局 `ratioVsMain=0.836` 无横滚（`ui3-facts.json`）；1440×900 `0.872`。e2e layout `ok 46–49`。空表/单列/10k Host / Edge/Firefox / Node 26 **未覆盖** |
| **J 门槛/文档** | 第 4 节全命令。`editor.md` 无 reveal/导入段（与未实现一致）；`types.ts` 仍写 `--allow-reveal`。`editor/docs/screens/*.png` 与当前 UI **未逐张像素对** |
| **K 已知问题** | 第 5 节 12 条均给 仍在/已修/恶化/已补走查 |

### 3.2.1 Domain D 请求/响应摘录（判据：不得读到 `tables/` `schemas/` 外字节）

Host：`http://127.0.0.1:18991`，`Authorization: Bearer <token>`。完整集 `{SCRATCH}/probes/domain-d-variants.json`、`http3-illegal-post.json`、`http3-export-escape.json`、`http3-csv-formula-2.json`（CSV 公式前缀两次）。

**源文件合法：**

```
GET /api/tables/skills/source?kind=table
HTTP/1.0 200
{"table":"skills","kind":"table","path":"tables/skills.txt","text":"table: skills\n…","bytes":408}
```

```
GET /api/tables/skills/source?kind=schema
HTTP/1.0 200
{"table":"skills","kind":"schema","path":"schemas/skills.json",…}
```

**源文件拒绝（均 `leaked_secret=false`）：**

| 用例 | 状态 | 码 |
| --- | --- | --- |
| `kind=TABLE` / `kind=Table` / `kind=exe` / `kind=` / CRLF kind | 400 | `BAD_REQUEST` `kind must be one of: table, schema` |
| `../skills`、`%2e%2e%2f`、反斜杠、盘符、ADS `skills.txt::$DATA`、`skills.txt` 走私 | 404 | `NOT_FOUND` / `UNKNOWN_TABLE` |
| 未加载表 `ads`、未知表 | 404 | `UNKNOWN_TABLE` |
| 无 token / 错 token | 401 | `UNAUTHORIZED` `missing or invalid bearer token` |
| `Host: 192.168.1.33:18991`（loopback 上改头） | 403 | `FORBIDDEN_HOST` `Host must be loopback` |
| `Origin: https://evil.example` / `Origin: null` | 403 | `FORBIDDEN_ORIGIN` |

无 token 原文：

```
GET http://127.0.0.1:18991/api/session
HTTP/1.0 401
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'
{"code": "UNAUTHORIZED", "message": "missing or invalid bearer token", "errors": []}
```

**导出穿越：**

```
GET /api/exports/370d78cf791aba86/../SECRET_BAIT.txt
HTTP/1.0 404
{"code":"NOT_FOUND","message":"unknown export file","errors":[]}
```

`%2e%2e/SECRET_BAIT.txt`、`..%2f…`、绝对路径 同 404，body 无 `SECRET_SHOULD_NOT_LEAK`。

**非法能力：**

```
POST /api/reveal  → 404 unknown api path
POST /api/import  → 404
POST /api/tables  → 404
POST /api/export {"format":"xlsx",…} → 400 format must be csv, tsv or txt
POST /api/export {"format":"txt","targets":["S"],…} → 400 txt export does not support targets filtering…
```

**CSP：**

```
GET /
HTTP/1.0 200
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'
```

**CSV 公式注入（草稿 overlay，两次相同）：**

```
GET /api/exports/66a1acebec188d69/skills.csv
HTTP/1.0 200
id,name,display_name,effect_id,damage,cooldown_frames,icon
40001,'+1+1,'=cmd|calc,50001,'-1+2,150,'@SUM
```

`= + - @` 均已加 `'`。第二次 exportId `3a7b6a8c7eb28f2c` 字节相同（`http3-csv-formula-2.json` `csv` / `csv2`）。

**公式 UI：** `__lumioPoc` 写 `=SUM` 后 token 仍 `Fireball`，hint「公式不可用，配表不持久化公式」（`ui3-facts.json` `formula2`）。键入 `@missing` 按字面 value，不升格为四态 missing（`ui2-facts.json` `atMissing`）。

**Token 泄漏面：** 加载后 `location.hash=""`，token 在 `sessionStorage["lumio-token"]`，`localStorage` 无 token（`ui-facts.json`）。错误 JSON 不回显 token。

---

## 4. 门槛输出

命令在产品仓 `C:\Work\LumioGames\LumioConfig` 复跑；全文 `{SCRATCH}/gates/`（utf8 转写在 `gates/utf8/`）。

**环境** `gates/utf8/env.txt.utf8.txt`：

```
node: v24.18.0
python: Python 3.12.10
pnpm: 9.15.9
nvm: absent
fnm: absent
nvs: absent
```

**`corepack pnpm install --frozen-lockfile`**（cwd `editor`）EXIT 隐含 0：

```
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 572ms using pnpm v9.15.9
```

**`corepack pnpm lint`：**

```
> eslint src tests scripts --max-warnings=0 && tsc --noEmit && node scripts/check-deps.mjs
check-deps: ok (no @univerjs-pro, Univer locked to 0.25.x)
```

**`corepack pnpm vitest run`：**

```
 Test Files  42 passed (42)
      Tests  378 passed (378)
   Duration  8.91s
```

**`corepack pnpm build`：**

```
✓ built in 14.03s
```

其后 `git diff -- src/lumio_config/editor_static` 空（`gates/utf8/editor_static-diff.txt.utf8.txt` 空文件）。

**`corepack pnpm e2e`**（`CI=1`，本会话 `run-e2e.py` 捕获，EXIT=0）：

```
Running 60 tests using 1 worker
…
[M7-A S01] Blocked appeared 11ms after SIGKILL (budget 8000ms)
[M7-A S04] back online 820ms after restart serve (budget 12000ms)
  ok 29 [chromium] › tests\e2e\host-offline.spec.ts:132:3 › … (1.6s)
…
  60 passed (1.6m)
```

e2e 改写了 `editor/docs/poc-benchmark.md`；已 `git checkout --` 还原，不进入本报告 diff。

**`python -m unittest discover -s tests -v`：**

```
Ran 168 tests in 35.480s
OK
```

**`python tools/lumio_config.py validate`：** `validate: OK` `EXIT=0`

**`python tools/lumio_config.py format --check`：** `format: OK` `FORMAT_EXIT=0`

**`git diff --check`：** 空，EXIT=0

**spec-lint：** `spec-lint: OK`

**Node 26 `pnpm vitest run`：** 未跑。本机无 Node 26 二进制（见 env）。

**Host 会话（两次同形）：** 临时仓 `serve --port 18991 --no-open --root <temp>`

```
GET http://127.0.0.1:18991/api/session
HTTP/1.0 200
{"repoName":"LumioConfig","revision":{"vcs":"git","id":"d1d2eeb6c97221b24b0ef2e04b76c24d3ffabe03","branch":"master","dirty":false},
 "tables":[
   {"name":"drops","sourcePath":"tables/drops.txt",…},
   {"name":"effects","sourcePath":"tables/effects.txt",…},
   {"name":"skills","sourcePath":"tables/skills.txt","sourceFingerprint":"a10eb3b674957381a510f243e95c4a55bd6b6a22af78405329af4184acfc3325",…}
 ],
 "capabilities":{"submit":true,"commit":true,"export":["csv","tsv","txt"],"events":true,"history":true,"reveal":false}}
```

`session-1.json` 与 `session-2.json` 同日同 Host、body 长度 3154，无用户目录路径。后续 remain Host `http://127.0.0.1:19102/#token=8Zc2FyFX…`、S04 Host `http://127.0.0.1:19103/#token=lZTvlVeN…`。

---

## 5. 已知问题复核表（OBJECTIVE §8）

| # | 条目 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | P2-1 首连失败恢复后 Failed / 「提交失败」 | **仍在** | 端口 19102：abort `/api/**` → Blocked「无法连接本机服务」；unroute 后 914ms / 1006ms 回「在线」但 `phase=Failed`、胶囊「提交失败」、`mapAlive=false`。截图 `37-p21-first-connect-fail-1440x900.png`、`38-p21-after-reconnect-1440x900.png`。`remain-facts.json` `p21`/`p21b`。`failOffline` Opening 分支 `editor/src/app/App.tsx:190-195` 仍 `dispatch failed`；`onOpen` 只 `online:true` |
| 2 | P2-2 看门狗无 dispose | **仍在** | `createLivenessWatchdog` 返回值仍仅 `{feed}`（`editor/src/api/client.ts:193-215`）；effect cleanup 只 `stop()` 订阅（`App.tsx:902`） |
| 3 | P2-3 黑洞只判死不重连 | **仍在（源码复核，活探针未覆盖）** | `onDead` 不 `stopStream`（`App.tsx:864`）；重连只挂在 `onClose`（`client.ts:265-276`） |
| 4 | P2-4 `api()` 未包 `response.text()` | **仍在** | `client.ts:42-49` try 只围 `fetch`；`await response.text()` 在 try 外（`:53`） |
| 5 | P2-5 reconnecting 文案无消费 | **仍在** | `editor/src/app/copy.ts:25,43` 定义；`editor/src` 除该文件外零引用 |
| 6 | P2-6 413 在整读之后 | **仍在** | `source_view.py:49-51` 先 `read_bytes()` 再比 2MiB。活测：已加载表改成 2MiB+ UTF-8 → 仍 413 JSON（Host 线程未死）。p27 run1/run2 各一次 |
| 7 | P2-7 非 UTF-8 decode 断连无 JSON | **仍在** | 在已加载 `tables/skills.txt` 追加 `\xff\xfe\x80` 后 `GET .../source?kind=table` → `RemoteDisconnected: Remote end closed connection without response`，无 JSON 体。run1（:19112）与 run2（:19113）相同。`host_alive_after=true`（进程在，该请求的处理线程崩）。`session` 随后仍 200 |
| 8 | E-3 J1/J3 并入 J2 | **仍在（口径）** | `keyboard-journeys.spec.ts` 只跑 J2/J4/J5，`APP_WIRED=true`，e2e `ok 36–39` |
| 9 | E-5 七种标记灰度 | **已补走查（chrome）；数据行未辨** | 灰度滤镜下脏态/Conflicted 胶囊可辨（`43`/`44-grayscale-*.png`）。Univer 数据行不上帧，三角/「新」/删除线/`!`/⚑/🔒 **未覆盖** |
| 10 | E-8 Univer canvas tabindex 豁免 | **仍在（合理）** | a11y e2e 排除 `#univer-doc-main-canvas`，三态 violations `[]` |
| 11 | 本机 Chromium 数据行不上帧 | **仍在（环境，非缺陷）** | 全程 `__lumioPoc`；截图网格空白 |
| 12 | M7-G reveal 未实现 | **仍在；不计缺陷** | 见矩阵 M7-G S01 |

P2-1 在「首连失败」上未恶化。QA-P2-8 是**另一条** Failed/「提交失败」入口（脏会话 + 401），不把 P2-1 标恶化。

---

## 6. 未覆盖声明

1. **Node 26.4.0 `pnpm vitest run`：** 本机无该二进制，M7-K S01 不能 实测通过。不引用开发方「374+4 skip」为证据。
2. **无 FIN/RST 黑洞 / SIGSTOP / 防火墙丢心跳：** Windows 本会话未挂起套接字；P2-3 仅源码复核。
3. **`response.text()` 半途断流（P2-4）活探针。**
4. **`SCHEMA_CHANGED`：** 未在 Host 运行中改 `schemas/*.json` 等 SSE。
5. **外部 `git commit` → `repo_revision_changed` → Stale 自动 rebase 横幅**（e2e `host-rebase` / `host-history` 复核，未手改真文件）。
6. **`DELETED_ROW_CONFLICT` 两条路径；冲突页「采仓库/采我/手工」全键盘走完。** e2e `ok 30–32`、`ok 37` J4 复核。
7. **`openPolicy.allowDirtyWorkingTree=true`：** 只测了默认 false → `WORKING_TREE_DIRTY`。
8. **10k 行在 Host 模式的滚动/提取/提交耗时。** fixture `benchmark.spec.ts` `ok 4` 26.6s。
9. **Chromium 以外浏览器**（无 Playwright firefox/webkit 项目）。
10. **E-5 数据行七种标记**（环境不上帧）。
11. **源查看器 UI 对 >2MiB 的「文件太大」页：** HTTP 413 已测；未在 SPA 里点开超大文件（P2-6 会先整读）。
12. **M7-G S02–S04**（未授权）。`types.ts:102` 仍写 `serve --allow-reveal`，CLI `serve --help` 只有 `--port/--no-open/--root`。
13. **检查器开着连续切表 ×20** 的 dispose 回归压测。
14. **`editor/docs/screens/*.png` 与当前 UI 逐张对图。**
15. **局域网网卡 IP 真连接：** Host 只绑 `127.0.0.1`，改 Host 头的 403 已测。
16. **fixture 模式 vs Host 模式全域双跑：** 键盘/四态/a11y/layout 走了 fixture e2e；Host 走了草稿/离线/导出/源查看/提交。

---

## 附录 A · 产品树与清理

- 进场：`git status` 干净（`{SCRATCH}/git-status-before.utf8.txt`）。
- 破坏性写入只发生在临时仓；真仓 `tables/skills.txt` SHA256 全程 `D69D7A7BBBD0C8C0F09BDDE680419A8EC0BC5B039F1FD9FBDE6B3BA02425E0D0`。
- e2e 触发的 `editor/docs/poc-benchmark.md` 已还原。
- 本会话起的 Host（18991/19101/19102/19103/19111/19112/19113）已杀。进场前已存在的 `:8765` pid 29688、`:8850` pid 24336 **不是本会话拉起的**，未动。
- 本报告 diff 预期仅为：`docs/reviews/2026-09-04-editor-v3-qa-report.md` 与 `docs/reviews/assets/qa-2026-09-04/**`。
- 同名截图会被后续 Playwright 步骤覆盖：`36`/`47` 最终是点表之后的恢复帧，不是 Failed 瞬间；Failed 胶囊以 `40-legend-dialog-1440x900.png` 与 JSON 探针为准。

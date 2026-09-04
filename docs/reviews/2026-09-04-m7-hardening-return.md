# 网页编辑器 v3 加固与补齐批次 · 交回物（2026-09-04）

- 集成分支：`feat/editor-v3-hardening`（起点 `4c12a19`，60 个提交），已合入本地 `main`（merge 提交号见下）。**未 push**——Owner push 口径闸门未勾，按红线 6（对外 push 须明确授权）停在本仓，请 Owner 确认后 `git push origin main`。
- 进度台账：`docs/reviews/2026-09-04-editor-v3-hardening-progress.md`（逐 Task 合入记录与门槛证据）。
- 深审报告：`docs/reviews/2026-09-04-m7-ae-deep-review.md`（M7-A/M7-E 对抗式深审，裁决 **MERGE**，无 P0/P1）。
- 执行环境差异声明：本机 Windows + Node v24.18.0 + Python 3.12（任务书假设的是审计机的 Node 26.4.0 + python3.11）；`pnpm` 经 `corepack`（9.15.9）。影响见 M7-K 一节。

## 0. 声明的假设（Owner 闸门未勾项的默认值）

| 闸门 | 取值 | 落点 |
| --- | --- | --- |
| M7-F `targets` 语义 | **选项 A**（TXT 拒绝过滤，只出全列，非空即 400） | Task 8 实现 + Task 14 前端禁用；README 未写 B 后缀 |
| M7-J 落点 | **选项 A**（交回物落 `docs/reviews/`，`.sdd/` 纯临时区） | Task 9；`.sdd/README.md` 入库（`!README.md`） |
| M7-G reveal 授权 | **未授权 → Task 16 不扇出** | capabilities.reveal=false（Task 6）+ 菜单第三项整项不渲染（Task 15）；菜单/前端分支已就绪，授权后补 Task 16 |
| push 口径 | 未勾 → **不 push** | 停在本地 main，待 Owner 确认 |

## 1. 按 Workflow 单的验收对账

### R-00395 · M7-X 冻结契约层（Task 1 + Task 2）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | copy.ts 新键与规格逐字一致、`as const` 保持；`copy.test.ts` 5 绿（BANNED 正则覆盖含函数取样输出：sampleArgs 扩 3 个新函数） |
| S02 | ✅ | types.ts 三处签名逐字（sourcePath / export+reveal / SourceFileResponse）；全量 `pnpm lint`（tsc --noEmit）通过 |
| S03 | ✅ | storage.test.ts 9 条全绿（直通/两种抛异常/全局 undefined/垫片六成员/单例/isStorageFallback） |
| S04 | ✅ | 两卡 diff 仅各自 3 个文件；零新依赖；editor_static 与 poc-benchmark 未夹带 |

### R-00396 · M7-A 掉线可感知（P1）（Task 3 + 接线点 1 + Task 10）

| 项 | 结论 | 证据（**实际耗时数值**） |
| --- | --- | --- |
| S01 断流 ≤8s 可感知 | ✅ | `e2e/host-offline.spec.ts`：kill → `role=alertdialog` 阻断页 + `status-online` 离线，**实测 55/10/10/10/11 ms**（4 次连跑，预算 8000ms）；主 loop 手工验证 9ms |
| S02 不误报 | ✅ | `client-sse.test.ts` 18 条含「主动 dispose 不调 onClose」；既有 e2e 全绿（正常切表/刷新/关抽屉零误报） |
| S03 不落错文案、不白屏 | ✅ | e2e：掉线切表 `status-phase` title=`Offline`（非 `Failed`）、无「提交失败」、`pageerror` 零捕获、`__lumioPoc.map()` 保留 |
| S04 自动恢复 ≤12s | ✅ | e2e：同端口重启 + token 换新进 sessionStorage → 原地退避重连回在线、脏格保留，**实测 809/867/832/825 ms**（预算 12000ms） |

实现要点：心跳探测在 `reader.read()` 字节层（`:\n\n` 无 data 行，handler 层收不到）；`NETWORK_UNREACHABLE` 与业务错误码分流；看门狗 `SSE_LIVENESS_TIMEOUT_MS=5000`；退避 1s→2s→5s→10s 封顶。

### R-00397 · M7-B 错误页签收敛（接线点 1 + Task 11 + 主 loop 反查修复）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | `e2e/host-errors.spec.ts` S01：还原 → ReadyClean + tab-errors 0 无 danger；DOM 快照（还原前 `错误1/danger/1 格未提交` → 后 `错误0/neutral/无未提交改动`，报告 `.sdd/task-11-return.md`） |
| S02 | ✅ | 四路径：还原（S01）+ undo 回基线（S02 测试，`__lumioPoc.undo` 桥）+ 切表（S02 测试）+ 行删除撤销（与 undo 共用 markDirty 同一清除点 `App.tsx` 接线提交，S01 已实证该分支） |
| S03 | ✅ | 反向用例：ReadyDirty 且预检失败时「错误 1」仍在且带 danger（S01 测试前半） |
| S04 | ✅ | 点错误项跳格 e2e（E-4 关闭）；**测试发现真缺陷**：Host 错误 row 是行名而 onJump 只认 rowId → 静默不跳——主 loop 落地 PatchTab 同款 name→rowKey 反查后转绿 |

### R-00394 · M7-C 列头可读性（Task 4 + Task 12）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | projection.roundtrip：`damage *`→`整数 · 服务端`、`id * 🔒`→`整数 · 服务端·客户端·体素`、未知类型/字符回落；24 条全绿 |
| S02 | ✅ | columnWidth 边界三条（112 下限 / cooldown_frames 162px>所需 128px / 240 上限）；1440×900 截图经像素与视觉双重核验单行不折 |
| S03 | ✅ | GridToolbar 图例（`tb-visibility-legend`）+ Dialog + Enter/Esc/焦点还原，18 条全绿 |
| S04 | ✅ | 既有 19 条 roundtrip 全绿，「徽标不进 v/token」两条守卫原样 |

### R-00398 · M7-D 源文件路径可见（Task 6 + Task 13 + 主 loop 传参接线）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | `tests/test_editor_server.py`：每表 `sourcePath == tables/<name>.txt`、POSIX、无绝对路径；168 条 Python 全绿 |
| S02 | ✅ | TopBar 17 条单测：菜单两条目与传入路径逐字一致（App.tsx 已接线传参） |
| S03 | ✅ | clipboard spy 断言 + toast「已复制路径」 |
| S04 | ✅（口径声明） | title 落在顶栏 `topbar-table`（`<表名> · tables/<表名>.txt`）；需求原文写的 `status-table` 在 StatusBar（不在本卡文件集），已按备选口径落地并在 Task 13 报告声明。title 为悬浮属性，截图不可见，以单测断言为准 |

### R-00399 · M7-E 源文件只读端点 + 右键查看（Task 7 + Task 15 + 接线点 2）· 深审通过

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | kind=table/schema 与磁盘逐字节一致（bytes=408/1038 实测）；`tests/test_editor_source_view.py` 12 条 |
| S02 | ✅ | **九条边界实测全部拒绝且零越界字节**（`..`/双重编码/绝对路径/非法 kind/未知表/未加载表/无 token/错 token/非 loopback Host → 404/400/401/403，诱饵文件字节零泄漏；详表在 `.sdd/task-7-return.md` 与深审报告——reviewer 另跑 18 条恶意路径含 `%00`/ADS/尾点全部拒绝） |
| S03 | ✅ | TableList 19 条：右键/Shift+F10/ContextMenu 键/↑↓EnterEsc/reveal=false 第三项不渲染/=true 渲染 |
| S04 | ✅ | SourceViewDialog 9 条三态 + 只读标注 + 复制全文；`e2e/host-source-view.spec.ts` 断言真实首行 |

### R-00400 · M7-F 导出 TXT（Task 6 + Task 8 + Task 14）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | `tests/test_editor_export.py` 三表字节比较相等；`diff <导出>/skills.txt tables/skills.txt` 输出为空（Task 8 报告附实测） |
| S02 | ✅ | 四态 token（@missing/""/null/@default）导出再解析原样保留 |
| S03 | ✅ | draft → `<t>.draft.txt` + README 警告段；capabilities 含 txt；下拉从 capabilities 渲染（App.tsx formats 接线）；e2e 下载 Buffer 逐字节等于 `tables/skills.txt` |
| S04 | ✅（假设 A） | `targets` 非空 + txt → ValueError→400；前端 TXT 时禁用目标列并给原因。**按 Owner 选项 A 实现（闸门未勾的默认值）** |

### R-00401 · M7-G reveal —— **部分交付，卡保持开启**

Task 16 未扇出（授权闸门未勾）。已交付的部分：`Settings.allow_reveal`（默认 False，Task 6）+ `capabilities.reveal` 下发（Task 6）+ 前端菜单第三项按 capability 整项不渲染（Task 15）。S02–S04（端点/注入面/CLI 开关/文档段）待 Owner 授权后按 Task 16 规格补做。

### R-00402 · M7-J 交回物制度补课（Task 9）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | dispatch.md 单一权威落点句，grep 自证无第二处冲突 |
| S02 | ✅ | `git ls-files .sdd/` → `.sdd/.gitignore` + `.sdd/README.md` |
| S03 | ✅ | 六份 `docs/reviews/2026-09-04-m6-{f..k}-return.md` 齐备——**基于本机 `.sdd/` 发现的 M6 当场原件移档（字节级拷贝，md5 一致）**，非重建；文首如实声明移档口径 + 文末审计对账补注 |
| S04 | ✅ | lessons.md 新增一条；a11y 清单引入 `[~]` 口径并修正两处勾选漂移 |

### R-00403 · M7-K Node 上界与 storage 注入（Task 5 + Task 14 收尾）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| S01 | ✅ | **双 Node 实测**：Node 24.18.0 → `378 passed / 0 failed`；**Node 26.4.0（便携版实机）→ `42 files passed，374 passed + 4 skipped（0 failed）`**。4 个 skip 均为「真实 storage 直通」类用例在无真实存储环境下的前提不成立跳过（Node 26 遮蔽，审计 §G-2），等价行为由垫片退化用例覆盖——与 storage.test.ts 既定口径一致 |
| S02 | ✅ | engines.node = `>=22 <26`；README 止血说明按简报跳过（editor/README.md 不存在，报告已注明） |
| S03 | ✅ | 守卫测试在库且全绿；白名单清零（client.ts 由 Task 3 迁移、ExportTab.tsx 由 Task 14 迁移后各删一行） |
| S04 | ✅ | 垫片退化「每次都提示」单测；token 读取走 safeStorage("session") |

### R-00404 · M7-H 决策卡（预研）

六问已成文：`docs/reviews/2026-09-04-m7-h-architecture-questions.md`（命名空间归属/自治区段/集中登记流程/schema 最小字段集/registry 条目形状/删表改名是否同 ADR）。时间盒 2026-09-04→09-07。**当前状态：未获回话**（Workflow 对本仓只读，请 Owner 转达架构仓）；截止未回话即按红线记「未获回话」，不推测。

### R-00405 · M7-I 决策卡（预研）

签字请求已成文：`docs/reviews/2026-09-04-m7-i-import-decision.md`（选项 A 补丁草案 vs 选项 B 覆盖式→需先改 ADR 0-1）。时间盒 2026-09-04→09-06。**当前状态：未获签字**。

## 2. 验证证据总表（集成分支终态）

| 命令 | 结果 | 基线对比 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | OK | — |
| `pnpm lint`（eslint+tsc+check-deps） | PASS | 基线 PASS |
| `pnpm vitest run` | **378 passed / 0 failed（42 文件）** | 基线 313（+65） |
| `pnpm e2e` | **60 passed** | 基线 54（+6：offline 1 / errors 3 / source-view 1 / export-txt 1） |
| `python -m unittest discover -s tests` | **168 OK** | 基线 150（+18） |
| `validate` / `format --check` | OK / OK | — |
| `git diff --check` / `spec-lint` | 空 / OK | — |
| build 后 `editor_static` | 重建后提交，二次 build 零差异 | — |

reviewer 裁决：**MERGE**（`docs/reviews/2026-09-04-m7-ae-deep-review.md`）。

## 3. Known gaps（下批候选，均不阻塞本批验收）

1. **P2×7（深审报告）**：首连失败恢复后 phase=Failed 胶囊文案错配；看门狗无 cancel/dispose 保护；黑洞连接（无 FIN/RST）只判死不重连；`api()` 未包 `response.text()` reject；`COPY.phase.reconnecting`/`banner.reconnecting` 已冻结未消费（退避期间无区分文案）；source_view 413 判定在整读之后（应先 stat）；非 UTF-8 源文件 decode 异常断连。
2. **本机渲染限制**：本 Windows 机器的 Chromium 下 Univer 数据行不上帧（新旧构建同样、headed/headless 同样；审计机正常——10.1% vs 2.8% 非白像素对照证实）。列头/侧栏/抽屉/阻断页渲染正常，E2E 全走数据模型断言不受影响；截图数据行空白属环境限制。已用 main@4c12a19 旧产物同机对照排除本批回归。
3. M7-G 三条验收项（R-00401 S02–S04）待授权。
4. M7-H/M7-I 时间盒内无回话即记「未获回话/未获签字」，实现卡继续冻结。

## 4. 知识沉淀落点

- `docs/reference/editor.md`：离线与重连 / TXT 导出 / 查看源文件 / 错误码补条（随卡更新，非新规范）。
- `.spec/knowledge/features/web-editor-ux.md`：status → 已交付 + §14 M7 设计现状（spec-steward 口径）。
- `.spec/knowledge/standards/dispatch.md` + `.spec/knowledge/lessons.md`：交回物落点单一权威句 + 台账教训（M7-J）。
- 无新 ADR（本轮无跨仓契约变更；M7-H 待架构仓回话后才落 ADR）。

## 5. 提交号索引

- 集成分支：`feat/editor-v3-hardening`（`4c12a19..b20a382`，60 提交；T0 九卡 merge ×9 + 接线 e1dc87c/44d9088、T1 merge ×5 + 接线、T2 merge + 接线点 2、Task 17 文档与产物、dispose 竞态修复 19e63a5、深审报告与台账）。
- 各子卡提交号见进度台账逐条记录；worker 原始报告在 `.sdd/task-{1..15}-return.md`（临时区，按 M7-J 选项 A 不入库，结论已抄录进台账与本文件）。

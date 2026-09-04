---
status: pending
---

# 网页编辑器 v3（含 M7 加固）· 全面 QA 测试提示词（2026-09-04）

> 用途：把本文整段交给负责测试的 Agent（或人类 QA）。它的任务是**对抗式验收**：不信任任何「已完成」声明，把这套框架与需求、设计稿、ADR 边界的每一处偏差都找出来。它只找问题、取证、写报告——**不修任何东西**。

---

## 0. 你的角色与总则

你是独立 QA，对 RM-00009「LumioConfig 网页编辑器」第一阶段（v3 重设计 M6 + 加固 M7）做**发布前全面测试**。开发方声称 12 张 M7 卡 S01–S04 全部达成、门槛全绿——你的工作就是证明这个声称哪里不成立。

三条铁律：

1. **只读测试**：不改产品源码、不改 `tables/`、`schemas/`、`registry/`、不 commit、不 push、不动 Workflow。你产出的只有一份报告。
2. **证据为王**：每条缺陷必须可复现（连续复现 ≥2 次）且附证据（命令+输出、HTTP 请求+响应、截图、`文件:行号`）。不能复现的写「未复现，怀疑路径：…」，不得当缺陷计数。
3. **不编造、不脑补**：没测到的域写「未覆盖」；自动测试已覆盖且你复核为绿的写「复核通过，证据复引」。已知问题（§8）先复核再报，重复报计为「复核」不计新缺陷。

---

## 1. 真值与必读（按序，冲突时序号小的赢）

1. `.spec/AGENTS.md`（项目红线）。
2. `docs/decisions/0-1`～`0-8`（架构仓镜像 ADR——**边界测试的判据**：0-1 唯一写路径、0-7 编辑器边界与禁项、0-8 草稿/提交/合并生命周期）。
3. `.spec/plans/2026-09-04-editor-v3-hardening-requirements.md`——**M7 需求正文**，12 张卡的 S01–S04 是你的验收对账清单。
4. `.spec/knowledge/features/web-editor-ux.md`——v3 设计稿：§5 状态表（14 阶段+派生态）、§8 抽屉、§11 键盘、§12 文案表、§14 M7 现状。
5. `docs/reviews/2026-09-04-editor-v3-completion-audit.md`——上一轮审计（§C 实走旅程可直接复用为用例脚本）。
6. `docs/reviews/2026-09-04-m7-hardening-return.md`——开发方交回物（含已声明的假设与 known gaps）。
7. `docs/reviews/2026-09-04-m7-ae-deep-review.md`——深审报告（7 条 P2 是你的「重点爆破」候选）。
8. `docs/reference/editor.md`——用户文档（测**文档与行为漂移**的基准）。

---

## 2. 环境与启动（照抄，别自己发明）

- 仓库：`C:/Work/LumioGames/LumioConfig`（Windows + Git Bash；macOS 在 `~/LumioGames/LumioConfig`）。
- **破坏性测试（提交/导出/草稿）必须在临时副本上做**：拷 `schemas/ tables/ registry/ repository.yaml` 到临时目录 + `git init` + 首次 commit（照 `editor/tests/e2e/host-drafts.spec.ts` 的 `copyRepo/gitInit/startHost` 基建照抄）。**绝不在真仓库上提交**。
- 起 Host：`python tools/lumio_config.py serve --port <N> --no-open --root <临时仓>`（Windows 用 `python`＝3.12；macOS 用 `/usr/local/bin/python3.11`）。URL 带 `#token=`，Bearer token 在其中。
- 前端产物：Host 服务 `src/lumio_config/editor_static/`（已提交，随源重建过）。改前端源才需要 `cd editor && corepack pnpm build`（你不改源，一般不用）。
- fixture 模式（无 Host，数据用 `editor/fixtures/`）：`cd editor && corepack pnpm exec vite` → `http://127.0.0.1:5173`。
- pnpm 一律 `corepack pnpm`（9.15.9）。Node 本机 24.18.0。
- **本机已知渲染限制（重要，别误报）**：本 Windows 机器的 Chromium 里 Univer **数据行不上帧**（新旧构建同样、headed/headless 同样；列头/侧栏/抽屉/阻断页正常）。数据行级视觉断言换机器做；本机用数据模型断言（`window.__lumioPoc`）替代。
- `page.evaluate`/`waitForFunction` 会被 Host CSP 拦：Playwright 加 `test.use({ bypassCSP: true })`。
- 测试桥：`window.__lumioPoc`（`extractTokens/map/phase/setPhase/timings/applyFourState/deleteKey/applyDraftSnapshot/copyRow/undo/executeCommand/lastJump/activeSelection`）——黑盒优先，但状态机穷举（§3-G）可用 `setPhase` 注入。
- 自动化基线（你不需要重跑，作为「自动化已覆盖」的参照）：vitest 378 绿（Node 26 实机 374 绿+4 skip）/ e2e 60 绿 / python 168 绿。**你的价值在自动化覆盖不到的地方：真实交互序列、视觉、边界数据、对抗输入、跨组件时序。**

---

## 3. 测试域（A–K，逐域产出用例与结论）

### A. 需求对账旅程（对照 12 张卡 S01–S04，黑盒实走）

对 M7 每张卡，按「用户视角完整旅程」实走一遍并对照验收项。最低用例集：

| 卡 | 旅程要点 |
| --- | --- |
| M7-A 掉线 | 连接正常→杀 Host 进程→≤8s 阻断页/离线胶囊/表格锁（记录实测耗时）；掉线中点切表/导出不得见「提交失败」、不白屏；重启同端口→≤12s 自动回在线、脏格还在（记录耗时）；**从未连上**（先杀后开页）也要有阻断页而非永久转圈 |
| M7-B 错误页签 | damage 置 null→预检失败「错误1」→检查器「还原」→错误页签立即 0 且空态「还没有改动」；undo 回基线/切表同样清；ReadyDirty 预检失败时错误**不误清**；点错误项跳格到对应行列 |
| M7-C 列头 | 列头第二行中文（`整数 · 服务端`、`整数 · 服务端·客户端·体素`）；`cooldown_frames *` 1440×900 单行不折；工具栏 S/C/V 图例常驻、点击弹说明（含「某列第一次标 C 需要过生产激活单」）、Tab/Enter/Esc 键盘可达 |
| M7-D 路径 | 顶栏表名 ⌄ 菜单两条路径条目（`源文件 tables/skills.txt`/`Schema schemas/skills.json`）、点击复制+toast；悬浮 title 含路径；**任何界面不得出现绝对路径/用户目录** |
| M7-E 源文件 | 右键表名/Shift+F10 → 查看源文件/Schema → 只读查看器（行号、等宽、复制全文、「只读快照，改这里不会改仓库」提示）；>2MiB 显示「文件太大」；每次打开重新拉 |
| M7-F 导出 TXT | 导出下拉有 TXT（来自 capabilities）；TXT 与 `tables/<t>.txt` 逐字节一致（下载文件 diff）；选 TXT 时目标列禁用+说明；draft 导出文件名 `<t>.draft.txt` 且 README 有警告；`targets` 非空+TXT → 400 |
| M7-X/J/K | 契约键齐全（对照 copy.ts 规格表）；`.sdd/` 只剩 README 入库；`editor/src/**` 无裸 localStorage（跑守卫测试复核） |

### B. 掉线与恢复的对抗变体（M7-A 深挖——这是 P1 域）

自动化只测了「正常 kill」。你要测：**黑洞连接**（用防火墙规则/挂起进程 SIGSTOP 模拟无 FIN/RST 的断流——看门狗判死后能否恢复？深审 P2-3 预言不能，验证它）；**心跳超时边界**（Host 改造发包间隔>5s？只读测试不改 Host——用代理工具 throttling 或直接引用深审结论复核）；**掉线期间的动作队列**（掉线中连点切表×N、连点导出、Ctrl+K 面板操作、Ctrl+S，恢复后状态是否一致、有无重复请求/异常）；**掉线+草稿自动保存竞争**（改格后 2s 内杀 Host，草稿版本是否正确）；**首次连接失败恢复**（深审 P2-1：先杀后开页→Blocked→重启 Host→流重连成功后 phase 是否卡 Failed/胶囊是否错配「提交失败」——重点验证）；**重连期间 UI**（阻断页出现/消失的抖动、console 是否刷屏）。

### C. 错误、冲突与并发

预检失败→提交→冲突三列解决（采仓库/采我/手工/恢复默认/设∅）→重提交全旅程（真仓副本上做）；`DELETED_ROW_CONFLICT` 的两条路径；双标签页同表（草稿 DRAFT_VERSION_CONFLICT、互相覆盖时序）；`SCHEMA_CHANGED`（改 schema 文件后事件推送→提示刷新重放）；仓库 revision 变化（外部 git commit→SSE→Stale 自动 rebase→横幅）；脏工作树打开策略（`openPolicy.allowDirtyWorkingTree` 两种值）。

### D. 安全与攻击面（最重要的一域，逐条实测留请求响应）

1. **源文件端点** `GET /api/tables/{t}/source?kind=`：已测九条边界之外继续发明变体——大小写 `Kind=`、`kind=TABLE`、多值 `kind=table&kind=schema`、`%00` 截断、表名尾点/尾空格、Windows 盘符与反斜杠、ADS 冒号 `skills.txt::$DATA`、超长表名、Unicode 同形表名、`kind` 带 CRLF。**判据**：任何变体不得读到 `tables/`、`schemas/` 之外的字节（在仓外放诱饵文件断言）。
2. **鉴权面**：无 token/错 token/过期猜测；**非 loopback**（改 Host 头、用局域网 IP 直连）；**Origin 混淆**（恶意页面 fetch 跨源——CSRF 面）；token 泄漏面（URL hash 清理、sessionStorage、日志/错误信息里不得回显 token）。
3. **导出端点**：`POST /api/export` 的 fmt/table/source/targets 非法值穷举；导出文件名注入（表名是闭合集合，但验证）；`GET /api/exports/{id}/{file}` 的路径穿越（`../`、编码、绝对路径）。
4. **公式与注入**：输入 `=SUM()` 被拒且提示；粘贴含公式区域被剥值；导出 CSV 的 `'` 前缀防注入；四态 token（`@missing`/`@default`）作为**用户输入**键入格内会发生什么（应按字面值处理，不被求值——验证）。
5. **未授权能力**：`capabilities.reveal` 必须 false；任何路径都不得触发 `open`/`explorer`/`xdg-open` 子进程（本批未实现——验证确实不存在）；前端不渲染「在资源管理器中显示」。
6. **回导红线**：确认不存在任何「导入/覆盖 tables/」入口（ADR 0-1）；TXT 导出页签与 README 的「不可回导」警示在位。
7. **CSP**：响应头 `default-src 'self'` 实测（curl -I）；尝试注入外链脚本被拦。

### E. 数据完整性（权威源不可被 silently 破坏）

四态闭环：格内改值→检查器四态四键→右键四态→Delete 三分支（有默认/无默认非必填/必填）→撤销重做→草稿→预检→提交→**真仓 diff 只含预期行**、`validate`+`format --check` 仍绿、指纹变化符合预期；提交后 `assignedIds` 发号、`draft:` 键消失；改名不换 id、复制行新键不复制 id、删除已有行走墓碑；特殊字符往返：CJK/emoji/引号/制表符/首尾空格/`=+-@\t\r` 开头串/超长值/`null` 字符串与 null 值区分；10k 行大表的滚动/提取/提交耗时（记录数值）；**导出 TXT 字节级 diff 三张表**。

### F. 键盘与 a11y

纯键盘完成全旅程（无鼠标）：开表→编辑→四态→预检→错误跳格→提交确认→冲突解决→导出下载链接可达；`Ctrl+K/B/J/M/S/Enter/Shift+Enter/F2/Shift+F10/Esc` 全表逐个验；焦点陷阱与还原（Dialog/Menu/抽屉/阻断页开合后焦点去向）；axe 三态（干净/脏/冲突）serious+moderate 零违例（`editor/tests/e2e/a11y.spec.ts` 复跑+新页面手工扫）；屏幕阅读器口径（aria 属性、live region、`role=alertdialog`）；**E-5 残留：七种标记灰度可辨性人工走查**（脏格三角/四态徽标/新行「新」/删除线/`!`/⚑/🔒 关掉颜色只用形状能否区分）——这是上轮明确没做的，补上。

### G. 状态机与文案穷举（设计稿 §5 为判据）

用 `__lumioPoc.setPhase` 注入 14 阶段×关键子状态：胶囊文案/颜色/转圈、横幅、四 can、表格锁定、抽屉可用性逐格对表；`online:false` 叠加在各阶段（ReadyDirty 掉线、Validating 掉线、Submitting 掉线、Conflicted 掉线——提交中断面）；英文阶段名只许出现在 `title`/`data-phase`（grep DOM 全量断言）；文案只能来自 copy.ts（`copy.test.ts` BANNED 正则复核+界面抽查）。

### H. 并发与时序竞争

双标签页（同表/异表）编辑竞争；编辑中外部进程改文件；提交进行中切表/刷新；自动保存计时器与手动 Ctrl+S 竞争；掉线恢复瞬间快速操作；**dispose 竞态回归**（检查器开着快速连续切表 ×20——本批修过一次白屏，验证修复稳固）；打开面板瞬间杀 Host。

### I. 边界数据与环境矩阵

空表/单行表/单列表、全 null 列、列名超长（>240px 宽上限）、表名边界字符（守卫正则 `^[A-Za-z0-9_.-]+$` 的合法极值）；fixture 模式与 Host 模式行为一致性（验收项规定双跑的域）；1280×720 与 1440×900 两档布局（≥0.75 主区比、无横滚）；Chromium 之外（若本机有 Edge/Firefox/WebKit，Playwright 跑一编核心旅程）；Node 24/26 双版本 `pnpm vitest run`（26 的 4 个 skip 是否符合口径）。

### J. 工程门槛与文档漂移

全量门槛复跑一遍留输出：`corepack pnpm install --frozen-lockfile && corepack pnpm lint && corepack pnpm vitest run && corepack pnpm build`、`corepack pnpm e2e`、`python -m unittest discover -s tests`、`validate`、`format --check`、`git diff --check`、`spec-lint`、`build 后 git diff -- src/lumio_config/editor_static`（必须为空——可复现性）；**文档对账**：`docs/reference/editor.md` 每一节与实际行为/错误码逐一对照；设计稿 §12 文案表抽查；`editor/docs/screens/*.png` 与当前 UI 是否一致（截图陈旧即漂移）。

### K. 已知问题复核（§8 清单逐条给结论：仍在/已修/恶化）

---

## 4. 判级

| 级 | 定义 | 例 |
| --- | --- | --- |
| **P0** | 权威源可被破坏/数据丢失/安全边界被穿透/白屏且无恢复 | 任何途径写坏 `tables/`；读到仓外文件；提交后表损坏 |
| **P1** | 核心旅程不可用或错误误导用户 | 掉线后假在线；错误跳格失效；提交成功但 UI 报失败 |
| **P2** | 有绕法但用户会撞上/文案与状态错配/边界异常未兜 | 首连失败恢复后胶囊错配；413 前整读大文件 |
| **P3** | 体验/一致性/文档漂移 | 截图陈旧；title 缺失 |

## 5. 交回格式

写 `docs/reviews/2026-09-04-editor-v3-qa-report.md`（新建，不覆盖任何已有文件），结构：

1. **一页结论**：通过/有条件通过/不通过 + 缺陷计数（P0/P1/P2/P3）。
2. **缺陷清单**：每条含「编号/级别/域/复现步骤（可复制执行）/证据（命令+输出或请求+响应或截图路径）/期望 vs 实际/怀疑根因（可选，注明是猜测）」。
3. **覆盖矩阵**：12 张卡 × S01–S04 逐项「实测通过（证据）/复核通过（复引自动用例）/未覆盖（原因）」；§3 A–K 每域给覆盖结论。
4. **门槛输出**：§3-J 全部命令的实际输出（尾部）。
5. **已知问题复核表**：§8 每条 → 仍在/已修/恶化 + 证据。
6. **未覆盖声明**：诚实列出没测到的（比编造覆盖强一万倍）。

截图存 `docs/reviews/assets/qa-2026-09-04/`（新建目录）。

## 6. 红线（违反即测试无效）

- 不改 `editor/src/**`、`src/lumio_config/**`、`tables/`、`schemas/`、`registry/`、两份 dispatch/requirements 文档、任何 ADR；不 `git commit`、不 `git push`；Workflow 只读。
- 破坏性用例只在临时仓副本上做；收尾清理临时目录、杀掉自己起的 serve 进程、`git status` 必须与进场时一致。
- 每条 P0/P1 在报告前**再复现一次**确认稳定。

## 7. 环境事实速查

- `corepack pnpm`（无全局 pnpm）；Node 24.18.0；Python=3.12（`python`）。
- serve 起在 loopback，token 在 URL `#token=`；Host 每秒发 `:\n\n` SSE 心跳。
- E2E 基建抄 `editor/tests/e2e/host-drafts.spec.ts`（copyRepo/gitInit/startHost/stopHost/afterAll 清理）。
- benchmark E2E 会改写 `editor/docs/poc-benchmark.md`——跑完 `git checkout --` 还原。
- 本机数据行不渲染的限制见 §2；因它产生的「看不到行」不是缺陷，记环境限制。

## 8. 已知问题清单（复核，勿重复计数）

1. **P2-1** 首连失败→Host 恢复后 phase 卡 Failed、胶囊「提交失败」错配（深审预言，未修）。
2. **P2-2** 看门狗无 cancel/dispose 保护（潜伏）。
3. **P2-3** 黑洞连接（无 FIN/RST）只判死不重连，永不恢复。
4. **P2-4** `api()` 未包 `response.text()` 的 reject，半途断流落裸 TypeError。
5. **P2-5** `COPY.phase.reconnecting`/`banner.reconnecting` 冻结但无消费点——重连期间与彻底断线无文案区分。
6. **P2-6** 源文件端点 413 判定在 `read_bytes()` 整读之后（2MiB+ 文件会先被整读）。
7. **P2-7** 非 UTF-8 源文件 decode 抛未处理异常、连接断、无 JSON 错误体。
8. **E-3** J1/J3 键盘旅程并入 J2（口径合并，未拆）。
9. **E-5** 七种标记灰度可辨性从未人工走查（本提示词 §3-F 要求补做）。
10. **E-8** Univer canvas tabindex 豁免（合理，升版重评）。
11. 本机 Chromium 不渲染 Univer 数据行（环境限制，非缺陷）。
12. M7-G reveal 整卡未实现（Owner 未授权；验证「确实不存在」即可，不报缺陷）。

# 配表编辑器 GUI 实机验收报告（2026-09-02）

- 对象：`http://127.0.0.1:8765/`，LumioConfig Web 编辑器（Univer 内核 + Python Host）。
- 模式：serve 构建产物（`editor_static/`，零 Node）——即 R-00364 A2 所述部署形态。
- 方法：黑盒 GUI（浏览器自动化真实键盘/点击）+ DOM 快照 + Host 文件系统/API 三路交叉验证；每个结论附证据（截图 / curl 输出 / 只读 evaluate）。
- 环境：Host 由本次验收接管启动（`python tools/lumio_config.py serve --port 8765`，主仓 HEAD 8fc1a9e，工作树干净）；用户先前的 Host 实例（22:34 启动）疑似从含四态演示行的 worktree 起服务，已停机并由主仓实例替代（环境准备，已如实记录）。

## 结论一览

| # | 测试点 | 结果 |
| --- | --- | --- |
| T1 | 页面加载、表清单（skills/effects/drops/big 10k×50） | ✅ 通过 |
| T2 | 表格数据渲染、指纹/行数状态栏 | ✅ 通过（主仓 2 行与 `tables/skills.txt` 一致） |
| S1 | 安全边界：token/Origin/Host | ✅ 通过（curl：无 token 401、正确 token 200、伪 Origin 403；token 经 URL hash 下发） |
| T3 | **单元格编辑 → 草稿** | ❌ **P1 缺陷**：键盘编辑只改画布渲染层，数据层/草稿层不变（详见下文） |
| T4 | 预检/提交门 | ✅ 通过（未预检时「提交补丁」禁用；预检后解锁并显示结果；无修改时禁用） |
| T5a | 公式输入守护 | ✅ 通过（`=1+1` 被剥离，hint 提示；文案「粘贴含公式…」对键入场景不准，记 UX 附注） |
| T5b | id 列编辑守护 | ✅ 通过（hint「id 列不可编辑」，数据层不变，且拒绝后无视觉残留） |
| T6 | 插入行 draft: 键 | ⚠️ 未执行（自动化工具无右键能力，工具栏插入入口在无截图辅助下无法可靠定位；逻辑由 `interceptors.test.ts` 单测覆盖） |
| T7 | CSV 导出 | ✅ 通过（README.txt 含 NOT AUTHORITATIVE/revision/exportedAt/三表 sha256；skills.csv 带 BOM、数据与权威源一致） |
| T8 | 草稿恢复 | ⚠️ 间接验证（无草稿时刷新回到干净态正确；正向恢复因 T3 缺陷无法产生草稿） |

## P1 缺陷：键盘编辑不进数据层，画布视觉残留误导

**复现步骤**（serve 模式，主仓 2 行表）：

1. 打开 `http://127.0.0.1:8765/#token=<token>`，确认 `__lumioPoc.extractTokens()` 中 40001 的 `damage` 为 `120`（数据层基线）。
2. 双击 damage 列 40001 行单元格（约 x=772, y=212）。
3. 键入 `125`，回车。

**观察**（两轮复现一致）：

- 画布渲染层显示 `125` 且红框选中（三次独立视觉确认：`assets/2026-09-02-editor-gui/t3_after_edit_attempt.png`、`t3c_damage_column.png`）。
- 数据层 `extractTokens()` 仍为 `damage: 120`（两次只读 evaluate 复核）。
- 状态栏「脏格 0」「草稿 v0」；Host 侧 `.lumio/drafts/` 无文件。
- 键入 `=1+1`：hint 显示「粘贴含公式，已仅保留值」，数据层同样未变。
- 键入 id 列：hint「id 列不可编辑」，数据层不变（此路径拒绝后**无**视觉残留，可作对照定位）。

**影响**：用户以为修改成功，实际改动静默丢失；提交时补丁不含该改动。这是核心编辑流（R-00361 A1「编辑动作 extractTokens 逐格无损」）的破坏性缺陷。

**root cause 方向**（基于拦截器代码只读核对，未改动代码）：

- `editor/src/spreadsheet/interceptors.ts:490`：canEdit 守护拒绝时 `event.cancel = true` + hint「另一个标签页已保存，请刷新」——打开页面即挂此 hint（phase=ReadyClean 正常态却挂着冲突文案），提示拦截器在启动序列中曾拒绝过命令，且 hint 生命周期未清理。
- 普通值编辑提交被拒后，Univer 渲染层未回滚编辑器残留（渲染/模型脱节）；id 守卫路径无此问题。
- e2e（`pnpm dev` + `__lumioPoc`/set-range-values 命令路径）未覆盖「真实键盘编辑 × serve 构建产物」交叉路径，故 CI 绿但实机可复现。

**修复建议**（不在本次验收范围执行）：① 补 serve 构建产物的 Playwright 冒烟（真实键盘双击编辑→extractTokens 断言）；② 排查拦截器 canEdit 闭包/启动时序；③ 编辑被拒时显式回滚渲染层。

## 其他观察

- 裸 URL（无 `#token`）打开：页面显示数据快照 +「离线」，写操作静默无效（安全面正确——401），但缺少「缺少访问令牌，请从 serve 输出的链接进入」的明确指引。
- 打开即残留「另一个标签页已保存，请刷新」hint（与 T3 缺陷同源嫌疑）。
- 顶部操作按钮（预检/提交/导出区以外）均无 aria-label；导出/预检/提交主按钮有名称且状态语义清晰（禁用态正确）。
- Workflow 回写：验收记录已评论至 R-00360/00361/00362/00364（2026-09-02T15:24-15:25Z）；R-00361 相关验收项在缺陷修复前不应标通过。

## 证据清单

- 截图（仓内）：`docs/reviews/assets/2026-09-02-editor-gui/`（t3_after_edit_attempt / t3b_fresh_initial / t3c_damage_column）；全套 5 张在 `.lumio/gui-test-screenshots/`（不入库）。
- curl 安全边界：`401 / 200 / 403`（无 token / 正确 token / 伪 Origin）。
- 导出产物：`GET /api/exports/<id>/README.txt`、`skills.csv`（BOM `EF BB BF` 起始、damage=120）。
- 数据层复核：`window.__lumioPoc.extractTokens()`（只读）。

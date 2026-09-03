---
name: web-editor-ux
description: 网页编辑器 v3 界面设计（IA、状态映射、令牌、抽屉、检查器、快捷键、文案表）——改 editor/ 布局、面板或用户文案时查
metadata:
  type: doc
  status: 设计中
---

# 网页编辑器 UX 设计（v3）

本文只改「长什么样、怎么用」。数据归属、链路、状态机、四态语义以 `docs/decisions/0-7`、`0-8` 为准；本文与其冲突处以决议原文为准。取舍记 `.spec/decisions/0003`–`0007`（本文不重复决策理由）。可点原型与设计师尺寸说明在 `editor/docs/prototype/`（设计参考，非生产代码）。本文取代 `editor/src/app/App.tsx` 的 v1 POC 布局。

## 1. 一句话

Excel 手感的配置表 + 一块按需展开的检查器 + 一条按需展开的底部抽屉。表格永远是主角；其余一切只在有内容或用户主动打开时占空间。

## 2. 信息架构

```text
顶栏      表切换(Ctrl+K) · 修订 · 会话状态 · [导出] | [预检] [提交补丁] · ⋯ · 检查器开关
横幅      （仅阻断 / 提示态）Stale · Conflicted · Failed · SCHEMA_CHANGED · DRAFT_VERSION_CONFLICT · 自上次打开的改动
主体      左：表列表(200/44px) │ 中：工具栏 + 表格 │ 右：检查器(260px，默认收起)
抽屉      补丁 · 错误 · 冲突 · [改动] · 导出 —— 收起 30px 页签条（带计数），展开 240px
状态条    表 · 行数 · 草稿 vN · N 格未提交 · [未 commit 提示] · 指纹8位(点击复制) · 在线
弹层      右键菜单（Univer 原生 + 四态）· 命令面板(Ctrl+K) · 对话框（提交确认 / 设置 / 快捷键）· toast · 整页阻断（离线 / 会话结束）
```

实体清单（5）：顶栏、表列表、表格区、检查器、抽屉。状态条与横幅是顶栏 / 主体的组成部分，不算独立实体。「改动」页签随 Host 历史接口一起交付（§9），本轮抽屉只有四个页签。

### 2.1 布局线框（1440×900，默认态：检查器收起）

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ≡ LumioConfig / skills ⌄  main·a10eb3f      ● 3 格未提交      [导出]│[预检][提交补丁] ⋯ ▯│ 42
├────────┬─────────────────────────────────────────────────────────────────┤
│搜索表  │ ↶ ↷ │ 🔍 │ 筛 排 冻 │ +行 复制行 删行 │ 100%              9 列 │ 32
│skills 3│ #  id*   name*     display_name* effect_id*  damage*  cooldown… │
│effects │    u32   str SCV   str C         ref→effects S i32 S   i32 S    │
│drops   │ 1 40001 fireball   Fireball     burn        130▲ 150            │
│        │ 2 40002 frostbolt  Frostbolt    chill       90   90             │
│        │ 3 40090 four_st…   ""           ∅           0 默认  missing!    │
│        │ 新 合入时发号 ice_lance Ice Lance chill      40  missing!       │
│        │   在此输入名称新增一行…                                         │
├────────┴─────────────────────────────────────────────────────────────────┤
│ 补丁 3 · 错误 0 · 冲突 0 · 导出                                        ⌃ │ 30 收起
├──────────────────────────────────────────────────────────────────────────┤
│ skills  4 行  草稿 v2  3 格未提交                        47f6f165  ● 在线 │ 24
└──────────────────────────────────────────────────────────────────────────┘
```

高度预算：表格区 900 − 42 − 32 − 30 − 24 = 772 ≈ 主区（900 − 42 − 24 = 834）的 92.6%；1280×720 时 592 / 654 ≈ 90.5%。抽屉展开 240px 时仍 ≥ 63%（非默认态，允许）。

宽度预算：设计列宽（`id` 96、`name` 150、`display_name` 140、引用列 130、其余 110）× skills 7 列 = 846px，加行号列 44 = 890px，再加表列表 200 = 1090px。1280 宽下检查器展开后表格区只剩 820px（< 890），因此检查器**默认收起**；点击单元格或列头时展开，`Ctrl+M`（契约卡核对 Univer 0.25 快捷键表后定）或顶栏开关收起，开合状态记 `localStorage`。检查器展开时允许表格横向滚动，不允许挤压列宽。

## 3. Univer 表面裁剪

允许（白名单）：撤销 / 重做、查找 / 替换、筛选、排序、冻结、缩放、插入 / 删除 / 复制行、复制 / 剪切 / 粘贴、列宽拖拽、隐藏列。

不可见（非「点了被拦」）：字体、字号、加粗、斜体、下划线、删除线、字色、填充、边框、对齐、换行、数字格式、合并、公式栏、插列 / 删列、函数、图表、透视、超链接、批注、图片、条件格式、工作表页签。

落法（`0.25.1`，以契约卡的 `editor/docs/univer-surface.md` 核实结果为准）：

- 现状 `spreadsheet/univer.ts` 传 `header: true, toolbar: true, formulaBar: false, contextMenu: true, footer: { sheetBar: false, statisticBar: true, menus: true, zoomSlider: true }, menu: HIDDEN_MENUS`（`footer` 是对象不是布尔）。目标：`toolbar: false`，`footer` 全关或只留 `statisticBar`，白名单动作由自建 32px 工具栏经 `univerAPI.executeCommand` 触发，命令 id 从 `interceptors.ts` 的 `COMMAND` 抽到 `spreadsheet/commands.ts`。
- 右键：保留 Univer 原生 contextMenu，用 `menu` 配置把禁止项 `hidden: true`；用 `IMenuManagerService`（或 preset 暴露的菜单钩子，契约卡在 `node_modules` 类型定义里核实）在主区右键追加「单元格」分组：设为空字符串 / 设为 null / 恢复默认 / 设为缺列。`App.tsx` 里的 `four-state-menu` 与 `onContextMenu` 整体删除，不再与原生菜单并存。
- 若某禁止项在 0.25.1 无法经 `menu` 隐藏：兜底 CSS `[data-u-comp="…"]{display:none}` + 拦截器仍保留（拦截器是最后防线，不是 UI 手段），并在 `univer-surface.md` 记风险。
- 空行：`Math.max(40, rows + 20)` 改为 `rows + 3`；空行不写 `dataValidation`；首个空行 `name` 格的占位文案「在此输入名称新增一行…」只能由渲染层画，**不得写进 `v`**（否则会进 token 与补丁）。
- `window.__lumioPoc` 桥保留（全部 host-* E2E 依赖它驱动）。

## 4. 视觉系统（设计令牌）

字体：`system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`；等宽 `ui-monospace, Consolas, monospace`（`id`、数值、指纹、补丁值）；正文 13px，密集文本 12px，标签 10–11px；表格行高 26px，列头 36px（两行）。

令牌落 `editor/src/styles/tokens.css`，**沿用既有 `--color-*` 前缀**。`editor-ui-primitives.md` 已交付的 13 个变量**名称全部保留**；其中 7 个按本表**改值**（`--color-bg-surface --color-border --color-border-subtle --color-text --color-text-muted --color-accent-bg --color-accent-border`，既有 `Button / Panel / DataTable` 随之换到设计色，属预期），`--color-danger-text` 改值为 `#b3261e` 并继续作为唯一的危险前景色，`--color-bg-app --color-border-faint --color-warning-*` 值不动（`Panel` 警告态专用）；其余为新增。M6-G 令牌卡按此表落地，不得另起第二套命名。

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--color-bg-app` / `--color-bg-surface`（既有；后者改值） | `#f6f7f9` / `#ffffff` | 页面底 / 表格、面板 |
| `--color-border` / `--color-border-subtle`（既有，改值） | `#e3e6eb` / `#eef0f3` | 分隔线 / 网格线 |
| `--color-text` / `--color-text-muted`（既有，改值）/ `--color-text-faint`（新增） | `#1c2230` / `#6a7280` / `#9aa3b0` | 正文 / 次要 / 占位 |
| `--color-accent`（新增）/ `--color-accent-bg` / `--color-accent-border`（既有，改值） | `oklch(0.52 0.12 155)` / `oklch(0.96 0.03 155)` / `oklch(0.80 0.08 155)` | 主按钮、选中格、导出按钮 |
| `--color-dirty` / `--color-dirty-bg`（新增） | `#b7791f` / `#fff7e0` | 脏格底 + 右上角三角 |
| `--color-new` / `--color-new-bg`（新增） | `#1f5fb3` / `#eaf2ff` | 新行整行底 + 行号「新」 |
| `--color-danger-text`（既有，改值）/ `--color-danger-bg`（新增） | `#b3261e` / `#fdecec` | 删除行（删除线）、无效格（波浪线 + `!`）、错误；不再另设 `--color-danger` |
| `--color-conflict` / `--color-conflict-bg`（新增） | `#7a3fb0` / `#f3ecfb` | 冲突格（描边 + ⚑）、冲突卡 |
| `--color-ai` / `--color-ai-bg`（新增） | `#4a4cc7` / `#ecedff` | 「改动」视图里 AI 修订标记 |
| `--color-readonly-bg`（新增） | `#f6f7f9` | `id` 列底 + 列头锁图标 |
| 圆角 | 4px（按钮 / 面板）、12px（状态胶囊） | |
| 阴影 | 菜单 `0 8px 24px rgba(20,24,32,.12)`；对话框 `0 16px 48px rgba(20,24,32,.24)` | |

Univer 单元格样式（`projection.ts` 的 `STYLES`）是工作簿数据，不能引用 CSS 变量；其色值与上表保持一致，并在同一文件顶部注释指向本表。

第二通道（不靠颜色）：脏格＝三角角标；新行＝行号「新」+ `id` 格「合入时发号」；删除行＝删除线；无效＝波浪下划线 + `!` 圆标；冲突＝⚑；四态＝徽标（呈现方式待 ADR 0008，见 §6）；只读＝列头锁 + 检查器「只读」。对比度：所有前景色对其底色 ≥ 4.5:1。

深色主题：本轮不做（ADR 0006）。令牌全部以 CSS 变量落地，`data-theme` 切换点预留。

## 5. 会话状态 → 界面

| 阶段 | 顶栏状态文案 | 色 | 可用动作 | 横幅 / 弹层 | 表格 |
| --- | --- | --- | --- | --- | --- |
| Opening | 正在打开… | 灰·转圈 | 无 | — | 骨架 |
| ReadyClean | 与仓库一致 | 绿 | 编辑、导出；预检置灰（tooltip「没有改动可预检」） | — | 可编辑 |
| ReadyDirty | N 格未提交 | 琥珀 | 编辑、预检、导出；提交置灰（「先预检通过」） | — | 可编辑 |
| SavingDraft | 正在保存草稿… | 灰·转圈 | 同 ReadyDirty | — | 可编辑 |
| Validating | 正在预检… | 灰·转圈 | 无（导出可） | — | 锁定遮罩 |
| ReadyToSubmit | 预检通过，可提交 | 绿 | 提交（主）、预检、编辑 | 提交前：仅当会 commit / 导表时弹一句话确认 | 可编辑 |
| Submitting | 正在提交… | 灰·转圈 | 无 | — | 锁定遮罩 |
| Conflicted | N 处冲突待处理 | 紫 | 冲突卡动作、取消本次提交 | 横幅「合并遇到 N 处冲突…」[处理冲突][取消本次提交] | 锁定 + 冲突标记 |
| Stale | 仓库已更新，正在合并 | 蓝·转圈 | 无（自动合并） | 横幅「仓库已更新（main · sha）。正在把你的 N 处草稿改动合并到新底稿，草稿不会丢。」 | 锁定 |
| Failed · `failKind=VCS` | 提交失败 | 红 | 查看详情、重试 | 横幅「提交失败：改动已合入表文件，但 commit 未完成。请在终端手动提交。」 | 锁定 |
| Failed · `failKind=SCHEMA_CHANGED` | 表结构已变化 | 红 | 刷新 | 横幅「这张表的结构已变化…需要刷新后重放草稿；草稿已保存。」[刷新] | 锁定 |
| Failed · `failKind=DRAFT_VERSION_CONFLICT` | 草稿已在别处更新 | 红 | 刷新 | 横幅「另一个标签页保存了这张表的草稿…刷新后接着改。」[刷新] | 锁定 |
| Closed | 会话已结束 | 灰 | 无 | 整页阻断 + 重连指引 | 隐藏 |
| 派生态 `online=false`（任一阶段） | 无法连接本机服务 | 红 | 无 | 整页阻断 + 重连指引（重新 `serve`、打开新链接） | 隐藏 |

口径说明（ADR 0005）：`failKind` 是 `EditorState` 新字段，取代现状 `canRefreshOnly` 对 `hint` 的子串判断；SCHEMA_CHANGED 在 0-8 §8 归入 Conflicted 分支，代码与本文用 `Failed + failKind` 表达同一语义，属细化不属突破。离线不是第 12 个阶段，是 `online:false` 叠加在当前阶段上的派生态，由 `/api/session` 轮询失败或 SSE 断开触发。

英文阶段名只出现在状态胶囊的 `title` 与 `data-phase` 属性。提交成功：toast「已提交并 commit 到 main（sha）」+ 补丁页签顶部结果卡（新指纹、发号映射、版本库动作、导表）。`autoCommit=false`：状态条常显「1 次合入未 commit」。

修订显示：`/api/session` 的 `revision.{vcs, id, branch}`。git → `分支 · 短 sha`；svn 无分支 → `r<id>`；`vcs=none` → 不显示修订段。

## 6. 单元格语义

- 四态呈现：**待 ADR 0008**（修复卡 spike 决定走 Univer 渲染扩展还是仅样式）。硬约束：徽标不得写进 `v` 或 token（`projection.roundtrip.test.ts` 守着），四态与普通值互不坍缩（0-7 §5）。无论哪种方案，`默认` 态格内显示灰斜体幽灵默认值。
- 脏格：`--color-dirty-bg` 底 + 右上三角；悬停 title「已改：120 → 130」；检查器显示「基线 → 当前」+「还原」。
- 新行：整行 `--color-new-bg`，行号列「新」，`id` 格灰斜体「合入时发号」。
- 删除行：删除线 + 淡红底；检查器「撤销删除」；右键同项变「撤销删除」。
- 无效：红波浪下划线 + `!`；检查器「为什么无效」块给 `message` + `suggestion` + `code`。无效判定必须按列类型：数值列越界才标红，string 列不走数值守卫（现状 `editors.ts` `numberOutOfRange` 缺此守卫，是 `name / display_name / icon` 全红的根因）。
- 引用列：格内显示目标行 `name`，检查器显示 `id = name`；下拉走 Univer 数据校验（`editors.ts` 已有）。
- 列头两行：`name *`（必填星、只读锁）/ `类型 · 可见性`；`title` 给默认值、范围、描述全文；点击列头 → 检查器显示列约束。
- Delete 键规则原样（0-7 §5），检查器底部一行文字说明当前列按 Delete 会落到哪一态。
- 真实 schema 现状：`schemas/{skills,effects,drops}.json` 没有 `default` / `enum` / `bool` 列，这些形态只在 `editor/fixtures/*.json` 出现。验收在 fixture（Vite dev）与真仓（`serve` + `LUMIO_EDITOR_DIST`）上双跑；真仓上 `默认` 态与枚举下拉不可达属预期，不是缺陷。

## 7. 检查器（只读 + 动作）

默认收起。选中单元格或点击列头时展开，内容自上而下：面包屑（表 · 行名）→ 列名 + 必填 / 只读 → [无效原因块] → [冲突块 + 去冲突面板] → 当前值（只读展示 + 四态标签）→ [基线 → 当前 + 还原] → 四态四键（不可用项给 tooltip 原因）→ Delete 规则说明 → 列约束（类型 / 必填 / 默认 / 枚举 / 范围 / 可见性 / 描述）→ 行（已有 / 新行 / 已删；删除行 / 撤销删除）。

检查器不改值；改值一律格内（双击 / F2 / 直接输入）。

## 8. 抽屉页签

- **补丁**：人话摘要 + 目标（`→ main · sha · 自动 commit`）；按行分组，`更新 / 新增 / 改名 / 删除` 色标；`update` 逐列 `expect → set`；每项点击跳格。空态「还没有改动…」。提交后顶部结果卡：新指纹 8 位、`assignedIds` 映射、`result.vcs.{action,id,branch}`、`result.export.{outDir,files}`。
- **错误**：按行分组卡（红头），每项 `列 · message · 建议 · code`，点击跳格并选中；`onJump` 真正接线（现状 `App.tsx` 未传）。空态区分「没改动」「未预检」「预检通过」。
- **冲突**：进度「已解决 N / M」+ 进度条；每卡三列（打开时 / 仓库当前 / 我的草稿）+ 单选组（采仓库值 / 采我的值 / 手工输入（内联输入框）/ 恢复默认 / 设为 ∅）；`DELETED_ROW_CONFLICT` 只有「放弃我的改动」；底部「取消本次提交」「重新预检并提交」（全部解决后可用）。点卡跳格，格上 ⚑。不再使用 `window.prompt`。
- **导出**：表多选 / 格式 / 来源（仓库 · 含我的草稿）/ 目标列（全部 · S · C · V）→ [导出] → 文件列表（含 README.txt）+ 下载。顶栏「导出」按钮直达此页签。
- **改动**（随 §9 Host 卡交付，本轮不做）：对比基准下拉（上次打开 / 某修订之前 / 仅我的未提交改动）+「在表格中标记」开关；分组：我的（琥珀）/ AI（靛蓝，`rev · message · 时间`）；每行 `行 · 列 · from → to` 点击跳格。无 `capabilities.history` 时页签隐藏。

本轮 J3 只做「自上次打开以来这张表已变化」横幅：`localStorage` 键 `lumio-config-editor:seen:<repo>:<table>` 记上次看到的 `revision.id` 与 `sourceFingerprint`，打开时不同即出横幅 [知道了]。

## 9. 需要 Host（单独立卡 M6-K）

修订级差异：`GET /api/tables/{t}/history?since=<revisionId>&limit=20` → `{ items: [{ revision, message, time, author, cells: [{ row, rowId, column, from, to }], created: [rowId], deleted: [rowId], schemaChanged: boolean }] }`（Schema 在该修订变化时 `schemaChanged: true` 且 `cells` 为空，不伪造格级差异）。定位键用版本库修订 id 而不是底稿指纹（Host 没有指纹 → 修订的持久映射；0-8 §3 的指纹只是三方合并基线）；`since` 缺省取最近 `limit` 条。Host 内部用 `VcsAdapter` 白名单命令（`git log` / `git show`）取两修订快照，用 `load_sources` 解析后按稳定 id 逐格比对；`vcs=svn/none` 返回 `{ items: [] }` 且 `capabilities.history=false`。前端不调 git。

## 10. 表列表

搜索框；每项：表名、行数、脏格数徽标（琥珀）、冲突徽标（紫）；当前表白底描边；`Ctrl+B` 折叠为 44px 首字母栏（脏点保留）。「草稿自动保存，不写权威源」移到首次打开 toast（`localStorage` 键 `lumio-config-editor:onboarded`）。

## 11. 键盘

| 动作 | 键 |
| --- | --- |
| 保存本地草稿 | Ctrl+S |
| 预检 / 提交补丁 | Ctrl+Enter / Ctrl+Shift+Enter |
| 命令面板 · 切表 | Ctrl+K |
| 折叠表列表 | Ctrl+B |
| 收起 / 展开抽屉 | Ctrl+J |
| 收起 / 展开检查器 | Ctrl+M（契约卡核对 Univer 0.25 内置键后定；不得用浏览器已占用的 Ctrl+Shift+I / Ctrl+Shift+J） |
| 编辑格 / 右键菜单 | F2 / Shift+F10 |
| 清格（四态规则） | Delete · Backspace |
| 查找 / 替换 | Ctrl+F / Ctrl+H（Univer） |
| 撤销 / 重做 | Ctrl+Z / Ctrl+Y（Univer） |
| 关闭弹层 → 收起抽屉 | Esc |

命令面板条目：打开 <表>×N、预检、提交补丁、保存本地草稿、导出、新增行、查找 / 替换、折叠表列表、打开补丁预览、快捷键、设置。J1–J5 均可只用键盘完成（切表 Ctrl+K → 方向键 / 输入 → Ctrl+Enter → Ctrl+Shift+Enter → Enter；冲突卡为 radio 组，Tab 可达）。

## 12. 文案表（现有 → 新）

| 现有 | 新 |
| --- | --- |
| `LumioConfig Univer POC`（标题） | `LumioConfig · skills` |
| `ReadyClean` / `ReadyDirty` / `ReadyToSubmit` | 与仓库一致 / N 格未提交 / 预检通过，可提交 |
| `Stale` / `Conflicted` / `Failed` | 仓库已更新，正在合并 / N 处冲突待处理 / 提交失败 |
| `SCHEMA_CHANGED，请刷新重放` | 这张表的结构已变化，需要刷新后重放草稿；草稿已保存 |
| `另一个标签页已保存，请刷新` | 另一个标签页保存了这张表的草稿。此页已停止编辑，刷新后接着改 |
| `将提交到：main/<sha>，autoCommit=true，autoExport=false` | `→ main · a10eb3f · 自动 commit`；提交确认：「将把 N 处改动提交到 main（sha），并以「config(skills): …」自动 commit；不导表。」 |
| `尚未预检` | 有 N 处改动（尚未预检）/ 还没有改动 |
| `指纹 sha256:47f6…（全文）` | `47f6f165`（title 全文，点击复制） |
| `脏格 0` | 无未提交改动 / N 格未提交 |
| `autoCommit` ☑ `已写入 local.json` | 提交后自动 commit 到当前分支 ☑ · toast「已保存到本机设置」 |
| `required 列不能设为缺列` | 必填列不能设为缺列 |
| `required 列不能清空` | `<列名>` 是必填列且没有默认值，Delete 不改动它 |
| `设为 null` | 设为 null ∅ |
| `草稿自动保存，不写权威源`（常驻） | 首次打开 toast：草稿会自动保存在本机，提交前不会写进仓库 |
| `导出 CSV / TSV · 单向生成物，不能导回仓库` | 单向生成物，不会导回仓库；输出到 build/export |
| `未提交`（hint） | 状态条「1 次合入未 commit」 |

全部用户可见文案集中在 `app/copy.ts`，单测用正则守卫：不出现英文阶段名、`autoCommit` / `autoExport`、`local.json`、`sha256:` 全文。

## 13. 组件清单（对应 `editor/src/`）

| 组件 | 文件 | 替代 |
| --- | --- | --- |
| `TopBar` | `panels/TopBar.tsx` | `DiffPreview` 里的按钮 + `StatusBar` 的 phase |
| `Banner` | `panels/Banner.tsx` | `status-hint` 红字 + `draft-refresh` 按钮 |
| `TableList` | `panels/TableList.tsx`（重写） | 同名 |
| `GridToolbar` | `panels/GridToolbar.tsx` | Univer toolbar |
| `Inspector` | `panels/Inspector.tsx` | 新 |
| `Drawer` + `PatchTab / ErrorTab / ConflictTab / ExportTab`（`DiffTab` 随 M6-K） | `panels/drawer/*.tsx` | `DiffPreview` `ErrorPanel` `ConflictPanel` `ExportPanel` |
| `StatusBar` | `panels/StatusBar.tsx`（重写） | 同名 |
| `CommandPalette` / `SubmitConfirm` / `Blocked` / `ShortcutsDialog` | `panels/*.tsx` | 新 |
| `Tabs` / `Dialog` / `Toast` / `Menu` + `useHotkeys` | `components/ui/*.tsx`（在既有 `Button` / `Panel` / `DataTable` 旁扩展） | `window.prompt` |
| `SettingsDialog` | `panels/SettingsDialog.tsx` | `SettingsPanel` |
| 令牌 | `styles/tokens.css`（`--color-*` 扩展）+ `ui.css` + `app.css` | 现 `app.css` |
| 状态映射 / 文案 / `failKind` | `app/phaseView.ts`、`app/copy.ts`、`app/state.ts`、`api/types.ts` | `hint` 子串判断 |
| Univer 裁剪 / 菜单注入 / 命令表 | `spreadsheet/univer.ts`、`spreadsheet/menus.ts`、`spreadsheet/commands.ts`（从 `interceptors.ts` 抽出 `COMMAND`） | `HIDDEN_MENUS`、`four-state-menu` |
| 视图状态 `seen` | `spreadsheet/viewState.ts` | — |

`data-testid`：E2E 实际引用的只有 `univer-root` `table-<name>` `status-hint` `draft-refresh` `btn-export` `export-link` `conflict-panel` `conflict-mine`，这 8 个必须保留（`status-hint` 改为视觉隐藏的 live region，仍含关键词「标签页」「合并」「公式」「id」「已合入仓库」）。其余现有 testid（`btn-validate` `btn-submit` `status-*` `conflict-*` `four-state-*` `export-*` `setting-autocommit`）保留命名以便新 E2E 复用。新增：`banner` `inspector` `cell-baseline` `invalid-reason` `panel` `tab-*` `submit-result` `command-palette` `context-menu` `conflict-resubmit`。E2E 文本断言只有 6 个中文片段（`host-drafts` 「标签页」；`sheet-ops` 「合并」「id」「公式」；`host-rebase` 「已合入仓库」「打开时」），改文案时同卡改断言。

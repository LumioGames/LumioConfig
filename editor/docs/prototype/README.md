> 设计参考，非生产代码：本目录是 2026-09-03 重设计 v3 的可点原型与设计师说明，落仓供对照实现；设计稿正文以 `.spec/knowledge/features/web-editor-ux.md` 为准，取舍见 `.spec/decisions/0003`–`0007`。

# Handoff：LumioConfig 网页编辑器重设计（v3）

## 概述

把 `editor/` 里的 v1 POC 界面重做成可日常使用的配置表编辑器：Excel 手感的表格占满主区，一块常驻检查器，一条按需展开的底部抽屉；11 个会话阶段各有用户口径的状态与横幅；冲突逐格卡片化；导出升格为顶栏主按钮。**不改 Host 契约、不改权威边界（0-7 / 0-8）、不换技术栈。**

## 关于本包里的设计文件

`prototype/index.html` 与 `prototype-src/*.dc.html` 是**用 HTML 做的设计参考**：展示目标外观与交互，不是可直接搬进 `editor/src/` 的生产代码。任务是在现有环境（React + TypeScript strict + Vite + Univer OSS 0.25.x）里，按仓库既有模式**重新实现**这些设计。原型用的是自绘表格；真实实现里表格是 Univer，原型表格部分只表达「格子长什么样、标记怎么画」，不表达实现方式。

## 保真度

**高保真（hifi）**：颜色、字号、行高、间距、圆角、文案都是最终值，按 `spec/web-editor-ux.md` §4 令牌与 §12 文案表逐字实现。Univer 内部无法精确控制的部分（列头富文本、徽标排版）以「一眼可辨、不靠颜色」为准，允许 ±2px。

## 文件清单

| 路径 | 用途 |
| --- | --- |
| `README.md` | 本文：总览、屏幕、交互、状态、令牌 |
| `CLAUDE_CODE_PROMPT.md` | **给 Claude Code 的提示词**：开工提示词、每卡提示词模板、审查提示词、验收清单、迭代流程 |
| `spec/web-editor-ux.md` | 设计稿（IA、线框、状态映射表、令牌、组件清单、快捷键、文案表、需要 Host） → 落仓 `.spec/knowledge/features/` |
| `spec/2026-09-03-web-editor-redesign-plan.md` | 实现计划：Wave 0–3 共 16 张卡 + 2 张「需要 Host」卡，文件集互不重叠 → 落仓 `.spec/plans/` |
| `spec/2026-09-03-web-editor-redesign-decisions.md` | Owner 已拍板的 14 项决定 → 落仓 `.spec/decisions/` |
| `prototype/index.html` | 单文件可点原型（离线可开）→ 落仓 `editor/docs/prototype/index.html` |
| `prototype-src/` | 原型源码（仅供阅读交互逻辑，如冲突解决、四态规则、状态映射） |

打开原型：顶部深色条可切「布局 A / B / 并排」「旅程 J1–J5」「状态覆盖（14 态）」「视口 1440×900 / 1280×720」。Owner 已拍板 **A**，B 仅留作对照。

## 屏幕 / 视图

只有一个页面，按区域描述。所有尺寸为 CSS px。

### 顶栏（42px，`#fff`，底边 `1px #e3e6eb`）

左 → 右：折叠按钮（28×28，图标 16px）· `LumioConfig`（600，`#6a7280`）· `/` · 表名按钮（14px 600，带 ⌄，点击开命令面板）· 修订 `main · a10eb3f`（12px `#6a7280` tabular-nums，title 给完整 sha）· 弹性空白 · **状态胶囊**（高 24，圆角 12，12px 600，色见状态表；转圈态 10px 圆环 spinner，静态态 7px 圆点）· 弹性空白 · **导出**（高 28，`oklch(0.96 0.03 155)` 底，`oklch(0.80 0.08 155)` 边，字 `oklch(0.40 0.12 155)` 600，带下载图标）· 竖分隔线 · **预检**（白底 `#cfd4dc` 边 500）· **提交补丁**（`oklch(0.52 0.12 155)` 底白字 600）· ⋯（设置 / 快捷键 / 命令面板）· 检查器开关（激活时图标色 `oklch(0.45 0.12 155)`）。禁用按钮 `opacity .45` + `title` 写原因。

### 横幅（可选，min-height 36，padding 4px 14px，12px）

左 8px 圆点 + 文案 + 右侧 1–2 个按钮（高 26，主按钮实色 = 该色调前景色 + 白字；次按钮白底 + 色调描边）。色调：Stale 蓝 `#1f4f8f/#eaf2ff`，Conflicted 紫 `#4d2a70/#f3ecfb`，Failed / SCHEMA_CHANGED / DRAFT_VERSION_CONFLICT 红 `#8f1d16/#fdecec`，J3 提示蓝。文案见 spec §5。

### 表列表（200px，折叠 44px，`#f6f7f9`，右边 `1px #e3e6eb`）

搜索框（高 26，白底 `#e3e6eb` 边，12px）；项（高 28，圆角 4，当前项白底 + `0 0 0 1px #e3e6eb`）：表名 + `N 行`（11px `#9aa3b0`）+ 右侧徽标：脏格数（琥珀 `#b7791f/#fff7e0` 10px 600 圆角 8）、冲突（紫）。折叠态：32×32 首字母块，右上 6px 琥珀点表示有脏格。

### 表格区（白底）

- 工具栏 32px：撤销 · 重做 │ 查找 │ 筛选 · 排序 · 冻结 │ 新增行 · 复制行 · 删除行 │ 缩放 100%；按钮 24 高 12px 字，图标 14px，右侧灰字「9 列 · 排序 / 筛选只影响视图」。
- 列头 36px 两行：行 1 `name`（600）+ 必填 `*`（`#b3261e` 700）+ 只读锁（10px 灰）；行 2 类型缩写（10px 等宽 `#6a7280`：`u32 str ref→effects i32 enum bool`）+ 可见性 chip（9px，`#d9dde4` 描边，圆角 2，`SCV / S / C`）。`title` = 全部约束 + 描述。列宽：`id` 96、`name` 150、`display_name` 140、引用列 130、其余 110；行号列 44。
- 行 26px，网格线 `#eef0f3`，字 12px；数值 / `id` 列等宽右对齐 tabular-nums；`id` 列底 `#f6f7f9` 字 `#6a7280`。
- 选中格：底 `oklch(0.96 0.03 155)` + `inset 0 0 0 2px oklch(0.52 0.12 155)`。
- 表末 3 个空行，首空行 `name` 格斜体占位「在此输入名称新增一行…」（`#c3c8d1`），空行不渲染下拉。
- 锁定态（Validating / Submitting / Stale / Conflicted / Failed）：`rgba(255,255,255,.45)` 遮罩 + `cursor:not-allowed`。

### 检查器（260px，左边 `1px #e3e6eb`，padding 10px 12px，12px）

标题条 32px「检查器」。内容顺序与样式见 spec §7。关键块：无效原因块（`#fdecec` 底 `#f1c4c0` 边，字 `#8f1d16`）；冲突块（`#f3ecfb/#d9c6ee/#4d2a70`，含「去冲突面板处理」按钮）；当前值只读框（28 高，`#e3e6eb` 边；只读 / 已删行改虚线边 + `#f3f4f6` 底）；基线块（`#fff7e0` 底，`120 → 130`，右侧「还原」22 高按钮）；四态 2×2 按钮（26 高，等宽 11px，当前态绿描边 + 浅绿底，不可用 `opacity .45` + title 原因）；Delete 规则一行 11px 灰；列约束 `key value` 两列网格；行块（徽标：新行蓝 / 已删红 / 已有灰 + `id 40001` 或「合入时发号」+ 删除行 / 撤销删除）。检查器**不改值**。

### 抽屉（A 布局，收起 30px / 展开 240px，顶边 `1px #e3e6eb`）

页签条 30px `#f6f7f9`：`补丁 N` `错误 N` `冲突 N` `改动` `导出`（激活白底 + 1px 描边；错误计数红、冲突计数紫）+ 右侧 ⌃/⌄。各页签内容与样式见 spec §8。

### 状态条（24px，11px `#6a7280`）

`skills` · `4 行` · `草稿 v2` · `3 格未提交`（有改动时 `#b7791f` 600，点击开补丁页签）· [`1 次合入未 commit`] · 弹性 · `47f6f165`（等宽，title 全文，点击复制 + toast）· `● 在线`（6px 绿点 / 红点「离线」）。

### 弹层

右键菜单（min-width 200，padding 4，圆角 4，阴影 `0 8px 24px rgba(20,24,32,.12)`）：分组标题 10px 灰「单元格 / 行 / 列（视图）」+ 项（高 ≈26，右侧快捷键 11px 灰）。命令面板（宽 480，顶部 80px，输入框 42 高 14px，列表项 13px，第一项预选 `#f3f5f8`）。对话框（宽 460，padding 16 18，圆角 6，阴影 `0 16px 48px rgba(20,24,32,.24)`）。Toast（底部 36px 居中，`#1c2230` 底白字 12px，2.6s）。整页阻断（`rgba(246,247,249,.92)` 覆盖 + 420px 卡片，两步重连指引）。

## 交互与行为

- 选格：单击；方向键 / Enter / Tab 移动；双击 / F2 / 直接输入 → 格内编辑（Univer 原生）；Enter 提交并下移，Tab 右移，Esc 取消。
- Delete / Backspace：有默认 → `@default`；可选无默认 → `null`；必填无默认 → 不动 + toast。
- 右键：Univer 原生菜单 + 注入「单元格」组四态项；不可用项禁用 + title 原因（「必填列不能设为缺列」「这一列没有默认值」）。
- 预检：`Ctrl+Enter` / 顶栏按钮；无改动置灰；进入 Validating（锁表）→ 有错则打开「错误」页签并 toast「预检发现 N 个问题」，无错则「预检通过，可提交」并打开「补丁」页签。
- 提交：`Ctrl+Shift+Enter`；仅 `autoCommit || autoExport` 时弹一句话确认（Enter 确认）；Submitting 锁表 → 成功：toast + 补丁页签顶部结果卡（新指纹 8 位、发号映射、版本库动作、导表）、表重载、`draft:` 行换正式 `id`、脏格清零。
- 错误 / 补丁 / 冲突 / 改动 列表项点击 → 选中对应格并滚动到可见（Univer `setActiveRange` + `scrollToCell`），检查器同步。
- 冲突卡：单选即生效（写回草稿 token）；「手工输入」展开内联输入，Enter 确认；全部解决 → 「重新预检并提交」可用 → 重新生成补丁 → validate → apply；「取消本次提交」→ 回 ReadyDirty，草稿保留。
- 自动保存：编辑停顿 2s → SavingDraft（胶囊转圈 0.5s）→ 草稿版本 +1；`Ctrl+S` 立即保存 + toast「草稿已保存（vN）」。
- Stale：收到事件即锁表 + 横幅，自动合并，完成后 toast「已合入仓库 N 处改动」回 ReadyDirty；有冲突 → Conflicted。
- 抽屉：页签点击展开；`Ctrl+J` / ⌃ 收起；Esc 先关弹层再收抽屉。侧栏 `Ctrl+B`。
- 动效：只有 toast / 弹层淡入 `120–150ms ease-out` 与 spinner；抽屉高度**不做过渡**。
- 空态文案：补丁「还没有改动。改格子后这里会列出将要提交的内容。」；错误分三种（没改动 / 未预检 / 预检通过）；冲突「没有冲突。」；导出未导出时不显示文件列表。

## 状态管理

沿用 `app/state.ts` reducer，新增 `failKind`；派生层 `phaseView(state)` 输出胶囊 / 横幅 / 锁表 / 按钮可用性（spec §5 表）。UI 状态（侧栏折叠、抽屉开合与页签、检查器开合、上次看到的指纹）进 `localStorage`（键前缀 `lumio-config-editor:view:`），不进补丁。数据请求形状不变：`/api/session` `/api/tables/{t}` `/api/drafts/{t}(/rebase)` `/api/patch/validate|apply` `/api/export` `/api/events` `/api/settings/local`。修订级差异需要新接口，见 spec §9（本轮不做）。

## 设计令牌

见 `spec/web-editor-ux.md` §4（颜色 14 组、字体栈、字号 10/11/12/13/14、行高 26、列头 36、圆角 4/12、两档阴影）。全部落为 CSS 变量，`data-theme="light"`；深色主题后续卡。

## 资源

无图片。图标全部内联 SVG（16 viewBox，1.5px 描边，`currentColor`）：菜单、搜索、撤销、重做、筛选、排序、冻结、加号、垃圾桶、复制、缩放、下载、面板、锁。可从 Iconify（如 `lucide`）取同名图标内联，**不引外链**（CSP `default-src 'self'`）。

## 已知边界与不做

- 深色主题、修订级差异接口、`invalid` 误判核实：分别是后续卡 / 「需要 Host」卡，见计划。
- 不引 UI 组件库；按钮 / 页签 / 抽屉 / 对话框 / toast 自写（`ui/`）。
- 原型里的格内编辑、复制粘贴、筛选排序是模拟；真实实现全部走 Univer 命令。

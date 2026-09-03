# 可访问性检查与设计验收清单(Task 18 · F2 · R-00382 S03)

自动化部分是 `tests/e2e/a11y.spec.ts`(axe,默认态 / 抽屉展开态 / 冲突态三态扫描,
serious 以上零容忍);本清单收纳它管不到的人工条目——焦点、ARIA、对比度、灰度——
以及 `editor/docs/prototype/README.md` 未涵盖的设计验收项(重设计 handoff §4.3
十一条),待 Task 20(F3 docs-and-static 收口)逐条勾选。

勾选口径:给出自动用例 ID 或截图 / 走查证据才打勾;修复时在条目后追加卡号。

## 1. 自动化扫描现状(tests/e2e/a11y.spec.ts)

| 段落 | 状态 | 说明 |
| --- | --- | --- |
| 默认态(fixture,ReadyClean) | 已实跑 | serious / critical = 0(下方两处豁免除外) |
| 抽屉展开态 | `test.skip` | E 阵列 `panels/drawer/**` 未合入接线;主 loop 接线后删除 skip 行即跑 |
| 冲突态 | `test.skip` | M6-I 冲突页签未接线;接线后删除 skip 行即跑(bridge 注入 Conflicted) |

### 1.1 豁免(serious+,已带修复出路,修完删 exclude 并勾选)

- [ ] `.grid-toolbar__hint` 对比度:`app.css` 用 `--color-text-faint`(浅灰)做 11px
      提示字,白底对比 ≈ 2.4:1 < 4.5:1。样式在 `app.css`(主 loop 文件集,F2 不越界),
      修复 = 换 `--color-text-muted`(≈ 4.7:1)后删 `a11y.spec.ts` 的 KNOWN_EXCLUSIONS 对应行。
- [ ] `#univer-doc-main-canvas` tabindex:Univer 0.25.1 画布宿主自带 tabindex 而无对应
      role,第三方 DOM,本项目源码改不了;升级或换渲染层前保持豁免。

### 1.2 门槛内残留(2026-09-03 默认态实跑,moderate,非阻断)

- [ ] `landmark-one-main`:页面缺 `<main>` landmark(App.tsx 结构,主 loop 收口时定夺)。
- [ ] `page-has-heading-one`:页面缺一级标题(顶栏「LumioConfig · 表名」现为装饰性文本)。
- [ ] `region` ×2:表列表 / 状态条等区块不在 landmark 内。

## 2. 可访问性人工条目

- [ ] **焦点环**:键盘(Tab / 方向键)走查全部可交互元素——顶栏按钮、表列表、工具栏、
      表格、检查器、抽屉页签、菜单、对话框、命令面板、整页阻断页——焦点始终可见
      (token 色 `--color-accent` 描边,不得 `outline: none` 后不补)。注:`ui.css` /
      `app.css` 目前没有显式 focus-visible 规则,依赖 UA 默认;统一焦点环待样式收口。
- [ ] **菜单 ARIA 与焦点管理**:表名 ⌄ 菜单、⋯ 菜单、Univer 右键菜单应有 `role=menu` /
      `menuitem`(或原生等价),方向键可移、Esc 关闭并把焦点还原到触发元素。
- [ ] **抽屉 ARIA 与焦点管理**:页签条 `role=tabs` / `tab` / `tabpanel` + 方向键切页签;
      抽屉展开后焦点可进入、收起后还原;`Ctrl+J` 开合对读屏可感知。
- [ ] **对话框 ARIA 与焦点管理**:提交确认 / 设置 / 快捷键 / 命令面板 `role=dialog` +
      `aria-modal` + 可达名称;挂载移焦、Tab 圈焦、卸载还原焦点(`ui/Dialog` 已实现,
      接线后逐个走查);整页阻断页 `role=alertdialog`(`panels/Blocked.tsx`,已有
      `tests/Blocked.test.tsx` 单测:移焦 / 圈焦 / 还原 / aria-labelledby)。
- [ ] **对比度 ≥ 4.5:1**:全部前景 / 底色组合过对比尺(重点:11–12px 小字、徽标
      10px、状态胶囊白字、横幅次按钮、阻断页 13px 灰字);工具类:
      axe 的 color-contrast 规则已开,豁免清单见 §1.1。
- [ ] **灰度下七种标记可辨**:四态(徽标)、脏格(右上三角)、新行(行号「新」)、
      删除行(删除线)、无效(波浪线 + `!`)、冲突(`⚑`)、只读(列头锁)——
      浏览器灰度 / 截图转灰后逐格可辨,不靠颜色单独区分(spec §4 第二通道)。

## 3. 原型 README 未涵盖的设计验收(handoff §4.3 十一条,待 Task 20 勾选)

- [ ] **表格 ≥ 75%**:1440×900 与 1280×720 下默认状态表格区域 ≥ 主区高度 75%,
      无常驻空面板(自动用例:`tests/e2e/layout.spec.ts` univer-root 占比断言)。
- [ ] **三处不可见禁止项**:禁止项(字体 / 字号 / 加粗 / 颜色 / 合并 / 公式栏 /
      插列删列等)在工具栏 / 右键 / 快捷键三处都不可见(ADR 0004 口径,非「点了被拦」)。
- [ ] **14 态胶囊与横幅**:Opening、ReadyClean、ReadyDirty、SavingDraft、Validating、
      ReadyToSubmit、Submitting、Conflicted、Stale、Failed·VCS、Failed·SCHEMA_CHANGED、
      Failed·DRAFT_VERSION_CONFLICT、Closed、offline 派生态——各有可辨识的顶栏状态
      文案 / 色调与正确的动作可用性;阻断态全部横幅级,不弹模态(自动用例:
      `tests/e2e/layout.spec.ts`「every phase shows its capsule copy…」)。
- [ ] **J1–J5 键盘**:看表 / 微调几格 / 核对改动 / 处理冲突 / 导出五条旅程均可只用
      键盘完成(切表 `Ctrl+K` → 方向键 → `Ctrl+Enter` → `Ctrl+Shift+Enter` → `Enter`;
      冲突卡 radio 组 Tab 可达)(自动用例:`tests/e2e/keyboard-journeys.spec.ts`,F1 卡)。
- [ ] **冲突无 prompt**:冲突解决全流程不出现 `window.prompt`(radio 单选 + 内联输入,
      spec §8「冲突」)。
- [ ] **错误跳格**:错误页签条目点击真正定位并选中对应格(`onJump` 接线后验证,
      现状 App 未传)。
- [ ] **七种标记灰度可辨**:同 §2 末条,作为独立验收项在灰度截图下勾一次。
- [ ] **界面无英文阶段名**:所有用户可见文案无 JSON 键名 / 英文阶段名
      (守卫:`tests/copy.test.ts` BANNED 正则;英文阶段名只允许出现在胶囊 `title` /
      `data-phase` 属性)。
- [ ] **确认只在副作用时**:提交确认对话框仅当会 commit 或导表
      (`autoCommit || autoExport`)时弹出,两者皆否时不弹(spec §5 / §12)。
- [ ] **导出在顶栏**:导出是顶栏主按钮,点击直达抽屉「导出」页签;无常驻导出卡片。
- [ ] **指纹 8 位**:状态条指纹显示 8 位等宽字符,`title` 给全文,点击复制 + toast
      (`COPY.tooltip.fingerprintCopy`)。

## 4. 整页阻断页(panels/Blocked.tsx,本卡交付)自验

- [x] `role=alertdialog` + `aria-modal` + `aria-labelledby` / `aria-describedby`,
      挂载移焦、Tab / Shift+Tab 圈焦、卸载还原焦点(`tests/Blocked.test.tsx` 9 用例)。
- [x] 覆盖层与卡片颜色全部走 tokens(`--color-bg-app` 92% color-mix、`--color-bg-surface`
      卡片、`--color-danger-text` / `--color-text` 主按钮),守卫:
      `tests/no-hardcoded-colors.test.ts`。
- [x] 两步重连指引(回终端重新 `serve`、打开终端打印的新链接)全部取自
      `COPY.banner.offline` / `COPY.banner.closed`;重试按钮文案 `COPY.bannerActions.retry`。
- [ ] 接线后(App 挂载 `Blocked`)在真浏览器补一次视觉走查:420px 卡片居中、
      覆盖层透出底层界面 8%。

# 可访问性检查与设计验收清单(Task 18 · F2 · R-00382 S03)

自动化部分是 `tests/e2e/a11y.spec.ts`(axe,默认态 / 抽屉展开态 / 冲突态三态扫描,
serious 以上零容忍);本清单收纳它管不到的人工条目——焦点、ARIA、对比度、灰度——
以及 `editor/docs/prototype/README.md` 未涵盖的设计验收项(重设计 handoff §4.3
十一条),由 Task 20(F3 docs-and-static 收口,2026-09-03)逐条勾选。

勾选口径:给出自动用例 ID 或截图 / 走查证据才打勾;修复时在条目后追加卡号。

## 1. 自动化扫描现状(tests/e2e/a11y.spec.ts)

| 段落 | 状态 | 说明 |
| --- | --- | --- |
| 默认态(fixture,ReadyClean) | 已实跑 | violations = [](serious / critical = 0,moderate 也已清零,见 §1.2) |
| 抽屉展开态 | 已实跑 | M6-J 接线后 skip 已删;Task 20 复跑 violations = [] |
| 冲突态 | 已实跑 | M6-I 冲突页签接线后 skip 已删;Task 20 复跑 violations = [] |

### 1.1 豁免(serious+,已带修复出路,修完删 exclude 并勾选)

- [x] `.grid-toolbar__hint` 对比度:app.css 已换 `--color-text-muted`(M6-J 接线期),
      Task 20 删除 `a11y.spec.ts` KNOWN_EXCLUSIONS 对应行并复跑三态 serious=0 —— 项关。
- [x] `#univer-doc-main-canvas` tabindex:Univer 0.25.1 画布宿主自带 tabindex 而无对应
      role,第三方 DOM,本项目源码改不了;维持豁免,升级或换渲染层时重评。

### 1.2 门槛内残留(F2 首跑曾报 moderate;Task 20 已全部修复清零)

- [x] `landmark-one-main`:页面缺 `<main>` landmark —— Task 20 给 `app-grid-body`
      加 `role="main"`(App.tsx),复跑清零。
- [x] `page-has-heading-one`:顶栏品牌「LumioConfig」装饰性 span —— Task 20 改为
      `<h1>`(TopBar.tsx,margin 0 不破 42px 顶栏),复跑清零。
- [x] `region` ×2–3:`.grid-toolbar`(有 aria-label 但 role=toolbar 非 landmark)与
      抽屉 tablist / tabpanel(外层 section 无标签)—— Task 20 把 GridToolbar 根改
      `role="region"`(保留 aria-label;本工具栏未实现 roving tabindex,region 更诚实)、
      Drawer 根 section 加 `aria-label="工具面板"`,复跑 violations = []。

## 2. 可访问性人工条目

- [x] **焦点环**:Task 20 在 `ui.css` 顶部加全局 `:focus-visible` 规则
     (`--color-accent` 2px 描边 + 1px 偏移),全部可交互元素键盘焦点统一可见,
      不再依赖 UA 默认。
- [x] **菜单 ARIA 与焦点管理**:表名 ⌄ / ⋯ 菜单走 `ui/Menu`(`role=menu` /
      `menuitem` / `aria-disabled`,关闭即卸载);`tests/Menu.test.tsx` 覆盖角色、
      禁用项、打开 / 关闭。Univer 原生右键菜单为第三方 DOM(同 §1.1 canvas 口径),
      可见性由 `sheet-ops.spec.ts` 断言条目集合。
- [x] **抽屉 ARIA 与焦点管理**:页签条 `role=tablist`(aria-label「抽屉」)/ `tab`
      (aria-selected)/ `tabpanel`;方向键切页签、`tests/Drawer.test.tsx:76,162`
      断言角色与 ArrowLeft / ArrowRight;M6-J 修复后 tablist 只含页签钮;
      Ctrl+J 开合有快捷键表与 keyboard.spec 覆盖。
- [x] **对话框 ARIA 与焦点管理**:提交确认 / 设置 / 快捷键 / 命令面板统一走
      `ui/Dialog`(挂载移焦、Tab 圈焦、卸载还原;`tests/Dialog.test.tsx`);
      命令面板另有 aria-activedescendant 同步用例(`tests/CommandPalette.test.tsx:113`);
      整页阻断页 `role=alertdialog` 见 §4。
- [x] **对比度 ≥ 4.5:1**:axe color-contrast 规则全开,三态 serious=0
      (含 11–12px 小字、徽标 10px、状态胶囊、横幅次按钮、阻断页);
      唯一历史命中 `.grid-toolbar__hint` 已修(§1.1)。颜色全部走 tokens,
      `tests/no-hardcoded-colors.test.ts` 守卫。
- [ ] **灰度下七种标记可辨**:第二通道已实现并有单测——脏格右上三角、四态徽标、
      新行「新」、删除行删除线、无效 `!`、冲突 ⚑、只读锁(`spreadsheet/badges.ts`
      纯装饰步骤可单测;无效红像素断言 `keyboard.spec.ts` T0)——但「灰度截图下
      逐格人工走查」未执行,记为 Task 20 残留(见 m6-k 交回物 known gaps)。

## 3. 原型 README 未涵盖的设计验收(handoff §4.3 十一条,Task 20 勾选)

- [x] **表格 ≥ 75%**:1440×900 与 1280×720 两档断言 univer-root 高 / 主区高 ≥ 0.75
      (`tests/e2e/layout.spec.ts:60`),无常驻空面板。
- [x] **三处不可见禁止项**:`tests/e2e/sheet-ops.spec.ts:102`「v3 surface trim」
      describe 三测——工具栏与公式栏不渲染、右键菜单无合并 / 插删列 / 字体项、
      B / I / U 快捷键无可撤销效果且 token 无漂移(ADR 0004 口径)。
- [x] **14 态胶囊与横幅**:`tests/e2e/layout.spec.ts:98` 注入全相位断言胶囊文案,
      阻断态(Conflicted / Stale / Failed×3 / Closed / offline 派生)横幅级呈现,
      无模态弹出。
- [x] **J1–J5 键盘**:J2 / J4 / J5 全程自动化(`tests/e2e/keyboard-journeys.spec.ts`);
      J1 看表(切表)段并入 J2 首段,J3 核对改动(预检)段并入 J2 预检步,
      J1 / J3 无独立旅程用例,记为残留。
- [x] **冲突无 prompt**:`src/` 全仓无 `window.prompt`(grep 零命中);冲突走
      radio 单选 + 内联输入(J4 断言 radio 组 Tab 可达)。
- [x] **错误跳格**:错误页签 onJump 已接线(App.tsx ErrorTab onJump → jumpToCell,
      与检查器 / 冲突卡同一跳格路径);无独立 e2e 用例,记为残留。
- [ ] **七种标记灰度可辨**:同 §2 末条,第二通道已实现 + 单测,
      灰度视觉走查未做(Task 20 残留)。
- [x] **界面无英文阶段名**:`tests/copy.test.ts` BANNED 正则
      (Ready* / Submitting / Validating / Stale / Conflicted / autoCommit / autoExport /
      local.json / sha256:)守卫用户可见文案;英文阶段名只出现在胶囊 `title` /
      `data-phase` 属性。
- [x] **确认只在副作用时**:提交确认仅 `autoCommit || autoExport` 时弹出,
      两者皆否不弹(`tests/e2e/keyboard-journeys.spec.ts:306` 反向用例)。
- [x] **导出在顶栏**:顶栏 `btn-export-top` 主按钮点击直达抽屉「导出」页签
      (App.tsx onExport → setDrawerTab("export") + setDrawerOpen(true));
      J5 断言导出可纯键盘完成;无常驻导出卡片。
- [x] **指纹 8 位**:状态条 `status-fingerprint` 显示去前缀后 8 位等宽字符,
      `title` 全文,点击复制 + toast(StatusBar.tsx)。

## 4. 整页阻断页(panels/Blocked.tsx,F2 交付)自验

- [x] `role=alertdialog` + `aria-modal` + `aria-labelledby` / `aria-describedby`,
      挂载移焦、Tab / Shift+Tab 圈焦、卸载还原焦点(`tests/Blocked.test.tsx` 9 用例)。
- [x] 覆盖层与卡片颜色全部走 tokens(`--color-bg-app` 92% color-mix、`--color-bg-surface`
      卡片、`--color-danger-text` / `--color-text` 主按钮),守卫:
      `tests/no-hardcoded-colors.test.ts`。
- [x] 两步重连指引(回终端重新 `serve`、打开终端打印的新链接)全部取自
      `COPY.banner.offline` / `COPY.banner.closed`;重试按钮文案 `COPY.bannerActions.retry`。
- [ ] 接线后(App 挂载 `Blocked`)在真浏览器补一次视觉走查:420px 卡片居中、
      覆盖层透出底层界面 8%(阻断态需 hostMode + offline,截图脚本未覆盖,
      记为 Task 20 残留)。

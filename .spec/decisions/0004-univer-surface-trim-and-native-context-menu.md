# 0004 · Univer 自带工具栏整体关闭、白名单动作走自建工具栏、四态注入原生右键

- 日期:2026-09-03
- 状态:生效

## 背景

0-7 §4 禁止公式持久化、合并单元格、颜色当数据等操作，但 v1 只在 `univer.ts` 的 `HIDDEN_MENUS` 里藏了 8 个菜单 id，其余字体 / 填充 / 边框 / 数字格式 / 插列等入口全部露出，点了才被拦截器拒绝。右键菜单被自定义的 `four-state-menu` 整体替换，而 `contextMenu: true` 仍开着，两个菜单在同一表面竞争，原生的插行 / 删行 / 复制粘贴不可达。逐项隐藏 Univer 工具栏按钮在 0.25.x 需要枚举几十个菜单 id，升版易漏。

## 决策

- `UniverSheetsCorePreset` 的 `toolbar` 关闭，底部工作表页签栏关闭（现状 `footer` 是对象，具体形状由契约卡在 `node_modules` 类型定义中核实并写入 `editor/docs/univer-surface.md`）。白名单动作（撤销 / 重做、查找 / 替换、筛选、排序、冻结、缩放、插入 / 删除 / 复制行、复制 / 剪切 / 粘贴、列宽、隐藏列）由自建 32px 工具栏经 `univerAPI.executeCommand` 触发，命令 id 从 `interceptors.ts` 的 `COMMAND` 抽到 `spreadsheet/commands.ts`。
- 右键保留 Univer 原生 contextMenu，禁止项经 `menu` 配置 `hidden: true`，四态四项以「单元格」分组**注入**原生菜单；`App.tsx` 的 `four-state-menu` 与 `onContextMenu` 删除。
- 无法经配置隐藏的项用 CSS 兜底，并在 `univer-surface.md` 记录风险；命令拦截器保留为最后防线，不再作为 UI 手段。
- 空行策略：`Math.max(40, rows + 20)` 改为 `rows + 3`，空行不写 `dataValidation`。

## 后果

- 自建工具栏是新组件；Univer 升版时白名单命令 id 需回归（`commands.ts` 集中登记，每个 id 注释来源文件）。
- 菜单注入依赖 `IMenuManagerService` 或 preset 暴露的钩子，若 0.25.1 不支持追加则改用 `mergeMenu`，契约卡先核实再写码。
- 验收改为「工具栏 / 右键 / 快捷键三处都找不到禁止项」，而不是「点了被拦」。

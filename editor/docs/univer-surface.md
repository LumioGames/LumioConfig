# Univer 表面裁剪核实结论(univer-surface)

- 日期:2026-09-03 · 卡:B4 contract-univer-surface(R-00379 M6-G S04)
- 锁版:`@univerjs/*` 0.25.1(锁死,禁止 @univerjs-pro/*,见 `tests/check-deps.test.ts`)
- 本文所有结论以本仓 `editor/node_modules` 内 `.d.ts` / lib 产物实核为准,d.ts 路径
  以 `editor/node_modules/` 为根;pnpm 实际落点在 `.pnpm/<pkg>@0.25.1_*/node_modules/<pkg>`。

## 1. `UniverSheetsCorePreset` 配置真实签名

来源:`@univerjs/preset-sheets-core/lib/types/umd.d.ts:30-51`

```ts
export interface IUniverSheetsCorePresetConfig extends
  Pick<IUniverUIConfig, 'container' | 'header' | 'toolbar' | 'ribbonType' | 'menu'
        | 'contextMenu' | 'disableAutoFocus' | 'customFontFamily'>,
  Pick<IUniverSheetsUIConfig, 'formulaBar' | 'statusBarStatistic' | 'footer'>,
  IUniverSheetsNumfmtConfig { docs?; sheets?; formula?; workerURL }
export declare function UniverSheetsCorePreset(config?: Partial<IUniverSheetsCorePresetConfig>): IPreset;
```

各项实核:

| 项 | 真实类型 | 声明位置(d.ts) | 本仓取值 |
| --- | --- | --- | --- |
| `toolbar` | `boolean`(IWorkbenchOptions) | `@univerjs/ui/lib/types/controllers/ui/ui.controller.d.ts:27` | `false`(ADR 0004) |
| `header` | `boolean` | 同上 :23 | `true`(未动) |
| `contextMenu` | `boolean` | 同上 :46 | `true`(保留原生右键) |
| `formulaBar` | `boolean` | `@univerjs/sheets-ui/lib/types/config/config.d.ts:34` | `false` |
| `footer` | `false \| { sheetBar?: boolean; statisticBar?: boolean; menus?: boolean; zoomSlider?: boolean; addSheetButtonConfig?: {...} }`(对象,**不是布尔**;UI 层 IWorkbenchOptions 另有一个不相关的 `footer?: boolean`) | `@univerjs/sheets-ui/lib/types/config/config.d.ts:39-81` | `{ sheetBar:false, statisticBar:true, menus:false, zoomSlider:false }`(只留 statisticBar) |
| `statusBarStatistic` | `boolean`,**已废弃**(注释:@deprecated Use `footer.statisticBar`) | 同上 :85 | 不用 |
| `menu` | `MenuConfig = Record<string, MenuItemConfig>`;`MenuItemConfig = Partial<Omit<IMenuItem,…>> & { hidden?: boolean; disabled?: boolean; activated?: boolean }` | `@univerjs/ui/lib/types/services/menu/menu.d.ts`(MenuConfig / MenuItemConfig) | 隐藏表,见 §3 |

`menu` 的生效机制(runtime 实核 `@univerjs/ui` `MenuManagerService._buildMenuSchema`):
菜单树每次构建(菜单每次打开)都会 `mergeMenuConfigs(item, menuConfig[item.id])`——按**菜单项 id**
(内置项 id = 命令 id)把 `hidden/disabled` 静态布尔转成 `disabled$/hidden$` Observable 注入。
因此隐藏表只对「菜单里出现的项」有效,对工具栏按钮、快捷键无效。

## 2. 工具栏 / 公式栏 / 页签的消失路径

- 工具栏(字体 / 字号 / 加粗 / 斜体 / 下划线 / 删除线 / 字色 / 填充 / 边框 / 对齐 / 换行 /
  数字格式 / 合并 / 插列 / 函数 等全部按钮)随 `toolbar: false` 整体不渲染,无需逐项隐藏
  (ADR 0004 正是为此弃用逐项枚举)。DOM 兜底 `[data-u-comp="ribbon-toolbar"]{display:none}`
  由 `univer.ts trimForbiddenSurface()` 注入 `<style data-lumio-surface="trim">`,防升版配置失效。
- 公式栏:`formulaBar: false`(v1 已关),CSS 兜底 `[data-u-comp="formula-bar"]` 同上。
- 工作表页签 / 缩放滑杆 / footer 菜单:`footer.{sheetBar,zoomSlider,menus}: false`。
- 图表 / 透视 / 超链接 / 批注 / 图片 / 条件格式:对应 preset **未安装**(依赖里只有 core /
  data-validation / filter / find-replace / sort),表面与命令都不存在,无需处理。

## 3. 右键(contextMenu)隐藏表(univer.ts `HIDDEN_MENUS`)

右键主区实际菜单项(0.25.1 实测,e2e `sheet-ops.spec.ts`「native context menu…」锁定):
剪切 / 复制 / 粘贴(quick 磁贴)、选择性复制 / 选择性粘贴、清除、「插入」子菜单(仅行)、
「删除」子菜单(删行 + **删除选中列**)、冻结、保护行列、排序。

隐藏表覆盖(键 = 菜单项/命令 id,来源见 `spreadsheet/commands.ts` 注释):

- 合并族:`add-worksheet-merge{,-all,-vertical,-horizontal}` + `remove-worksheet-merge`(取消合并)。
- 插列 / 删列族:`insert-col-before / insert-col-after / insert-col-by-range / insert-col /
  remove-col-confirm / remove-col-by-range / remove-col / confirm.remove-col`。
- 公式族:`formula-ui.operation.insert-function / more-functions / sheet.command.paste-formula`
  (粘贴公式藏在「选择性粘贴」子菜单里,拦截器仍兜底剥公式)。

无法经 `menu` 隐藏的残留项:**无**(实测右键菜单再无 §3 禁止项);若升版后出现新入口,
先补 `HIDDEN_MENUS`,不行再进 §4 的 CSS 兜底清单。

## 4. CSS 兜底与风险记录(ADR 0004)

`univer.ts` 注入的内联 `<style data-lumio-surface="trim">`(CSP 安全,无外链):

```css
[data-u-comp="ribbon-toolbar"]{display:none !important}
[data-u-comp="formula-bar"]{display:none !important}
```

风险:`data-u-comp` 属性名是 Univer 内部约定(d.ts 无契约),升版改名即失效——所以只作
兜底,主路径仍是 §1 的配置开关;`sheet-ops.spec.ts` e2e 直接断言两处 `toHaveCount(0)`,
兜底失效会在验收被发现。

## 5. 快捷键面的禁止项中和(「快捷键处找不到」)

sheets-ui 注册的样式快捷键(runtime 实核 `@univerjs/sheets-ui` `_initShortCut`):
Ctrl+B/I/U(`sheet.command.set-range-bold/italic/underline`)、Ctrl+Shift+X(删除线)、
Ctrl+Shift+7/8(数字格式)。

中和方式:Univer 官方冲突处理惯例——同绑定注册**高优先级** `NilCommand`
(`@univerjs/core` runtime:`NilCommand = { id:"nil", type:COMMAND, handler:()=>true }`,
zoom 快捷键即用此法压制)。`univer.ts trimForbiddenSurface()` 经
`univer.__getInjector()`(`@univerjs/core/lib/types/univer.d.ts:81`,公开方法)取
`IShortcutService`(`@univerjs/ui/lib/types/services/shortcut/shortcut.service.d.ts:85`,
`registerShortcut(IShortcutItem): IDisposable`,priority 高者先匹配)逐绑定注册
`{ id: NilCommand.id, priority: 999, preconditions: () => true }`。
验收:`sheet-ops.spec.ts` 断言 Ctrl+B/I/U 后 `extractTokens` 不变且 `undo()` 无事可撤销。

已知残留:快捷键帮助面板(Ctrl+F1 族)仍会列出这些绑定(注册表层面 NilCommand 只抢占
派发优先级,不注销原项);它不是 §3 的三个表面之一,记录不动。

## 6. 四态注入原生右键(`spreadsheet/menus.ts`)

- 注入通道:`IMenuManagerService.mergeMenu(source)`(`@univerjs/ui/lib/types/services/menu/
  menu-manager.service.d.ts:31-37`,runtime 导出于 preset umd)。源用「完整定位串做键」的
  单层结构 `{ "contextMenu.mainArea": { "lumio.cell": { order:4, title:"单元格", …items } } }`,
  服务递归下降后在既有 mainArea 节点上深合并(与 facade `appendTo('contextMenu.others')`
  同机制,runtime 实核 `MenuManagerService.mergeMenu`)。
- 分组标题:group schema 的 `title` 由面板渲染为 `<strong>`(runtime 实核);「单元格」即此路径。
- 取 service 的接缝:`FUniver` 未公开 injector(`@univerjs/core/lib/types/facade/f-univer.d.ts:38`
  `_injector` 为 protected),`Univer.__getInjector()` 又只在 Univer 实例上;`menus.ts` 经
  `(univerAPI as { _injector })._injector` 取——**升版回归点**,已在此记录。
  官方替代 facade `univerAPI.createMenu({action}).appendTo(...)`(`@univerjs/ui/lib/types/
  facade/f-menu-builder.d.ts:110`)不支持 `disabled$/tooltip`,不满足「禁用并给 title」,
  故按 ADR 0004 走 IMenuManagerService。
- 菜单项:BUTTON 型 `{ id:"four-state-<kind>", title:<FOUR_STATE_MENU 标签>, commandId:"lumio.four-state.<kind>" }`;
  命令经 `ICommandService.registerCommand` 指到 handlers(点击链路 runtime 实核:面板
  `onOptionSelect → executeCommand(item.commandId)`)。`mergeMenu` 无撤销 API,条目随
  `univer.dispose()` 消亡(切表重建实例)。
- 禁用 + title:`disabled$: of(true)`(factory 在每次菜单打开时重算,`availability()` 由
  接线方提供 required/default 语义);title 文案「必填列不能设为缺列」「这一列没有默认值」。
  **注意**:0.25.1 非 compact 菜单不把 `tooltip` 渲染成 `title` 属性(runtime 实核面板项
  渲染 `title: m && typeof c.tooltip==='string' ? t(c.tooltip) : void 0`,m=compact 才生效),
  由 `menus.ts` 的 DOM 补盖过程在禁用项上补 `title`。
- `data-testid`:Univer 菜单渲染(IMenuItem→ContextMenuPanel,radix 族原语)不透传任意
  DOM 属性——菜单打开后按按钮精确文本轮询补盖 `data-testid="four-state-<kind>"`(≤1.5s,
  120ms 步进),E2E 与接线验收依赖此属性。
- 接线:`createSheetsUniver(container, { fourState })`(App.tsx 传参由主 loop 卡接线;
  接线后删除 `four-state.spec.ts` 里 menu 用例的 `test.skip` 行)。禁用态依赖可选的
  `availability()` 探测;未提供时四项全可用,点击由 handler 侧兜底提示(现行为)。

## 7. 白名单命令 id(spreadsheet/commands.ts)

自建 32px 工具栏将经 `univerAPI.executeCommand(id)` 触发的白名单 id,含来源注释:
undo/redo(`undoredo.service.d.ts:75-76` 字面量)、cut/copy/paste(`clipboard.command.d.ts:17-19`,
字面量 runtime)、find/replace(preset-sheets-find-replace runtime)、filter 三件套
(preset-sheets-filter runtime)、sort asc/desc(preset-sheets-sort runtime)、
freeze(`set-frozen.command.d.ts:25`)、zoom(sheets-ui runtime)、行操作族与
copyRow(复合操作,无独立 Univer id)。拦截器既有 id 一并迁入此表,`interceptors.ts`
仅 re-export(既有导入方不动)。

## 8. 验收测试对照

`tests/e2e/sheet-ops.spec.ts`「v3 surface trim (R-00379 S04)」:

1. 工具栏 / 公式栏不渲染(`data-u-comp` 计数 0)。
2. 原生右键:插入/删除子菜单里行操作在、插列/删列/合并/字体族/公式不可见
   (以「剪切」可见防空菜单假绿)。
3. Ctrl+B/I/U 后 token 不变且 `undo()` 返回 false(无样式命令入撤销栈)。

`tests/e2e/four-state.spec.ts` 末尾 menu 用例在主 loop 接线前 `test.skip`(页面内注明)。

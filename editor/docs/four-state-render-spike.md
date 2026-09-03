# 四态徽标渲染 spike(A4 · M6-F · R-00378 S04)

- 日期:2026-09-03
- 结论:**渲染扩展可行**。Univer OSS 0.25.1 可以在「不改单元格 `v`」的前提下,经 `CELL_CONTENT` 拦截器把四态徽标画在格子右下角。ADR:`.spec/decisions/0008-four-state-rendering.md`。

回答的问题(ADR 0006 移交):Univer 0.25.1 能否在不改 `v` 的前提下画四态徽标?——**能**,且是 data-validation 下拉图标同款的官方主路径,不是边缘 API。

## 1. 机制

数据层保持现状:`custom.lumio.badge` 已由 `editor/src/spreadsheet/cellMeta.ts` 写入(徽标文案),`v` 不写。渲染层新增一段装配代码:

1. 经 `univer.__getInjector().get(SheetInterceptorService)` 拿到拦截器服务;
2. 在 `INTERCEPTOR_POINT.CELL_CONTENT` 上注册一个 `effect: Style` 的拦截器:读到 `custom.lumio.badge` 时,给视图格追加 `customRender`(canvas 绘制对象)与可选 `markers`(角标三角);
3. engine-render 的内建 `Custom` 扩展在每帧脏区遍历时对每个带 `customRender` 的格子调用 `drawWith(ctx, info, skeleton, parent)`,`info.primaryWithCoord` 提供格子坐标(`startX/endX/startY/endY`),在 `endX - 4, endY - 3` 处右对齐画徽标文本。

拦截器只改「视图组合结果」(`worksheet.getCell`),模型层(`getCellRaw`)不动;`effect: Style` 声明让取值方(`getCellValueOnly`)整体绕过本拦截器。

## 2. 证据 API 清单(全部出自本仓 lockfile 安装的 node_modules,Univer 0.25.1)

路径约定:相对 `editor/`。`.pnpm/<pkg>` 是 pnpm 的传递依赖目录,括号内为完整 peer 后缀,后文用 `…` 缩写。

### 2.1 注册入口

| API | 出处 |
| --- | --- |
| `INTERCEPTOR_POINT.CELL_CONTENT: ICellInterceptor<ICellDataForSheetInterceptor, ISheetLocation & { rawData }>` | `node_modules/.pnpm/@univerjs+sheets@0.25.1_react@18.3.1_rxjs@7.8.2/node_modules/@univerjs/sheets/lib/types/services/sheet-interceptor/interceptor-const.d.ts:18-23` |
| `InterceptCellContentPriority { DATA_VALIDATION=9, NUMFMT=10, CELL_IMAGE=11 }`(选优先级用,我们取小于 9 的自定义值即可) | 同上 `:24-28` |
| `SheetInterceptorService.intercept<T>(name, interceptor): IDisposable` | `node_modules/.pnpm/@univerjs+sheets@0.25.1(同上)/…/sheet-interceptor.service.d.ts:121` |
| `IInterceptor { id?, priority?, handler }`、`InterceptorHandler(value, context, next)` | `node_modules/@univerjs/core/lib/types/common/interceptor.d.ts:17-26` |
| `ICellInterceptor.effect: InterceptorEffectEnum`(`Style=1` / `Value=2`;Style 使 `getCellValueOnly` 绕过) | 同上 `:27-34`、`:18-21` |
| `Univer.__getInjector(): Injector` | `node_modules/@univerjs/core/lib/types/univer.d.ts:81` |
| `Injector.get<T>(id): T` | `node_modules/.pnpm/@wendellhu+redi@1.1.1_react@18.3.1/node_modules/@wendellhu/redi/dist/esm/index.d.ts:963` |
| preset 已 re-export `@univerjs/sheets` 全部导出(无需新增依赖) | `node_modules/@univerjs/preset-sheets-core/lib/types/index.d.ts:2-15` |

### 2.2 视图格可挂的渲染字段(`ICellDataForSheetInterceptor`)

| 字段 | 用途 | 出处 |
| --- | --- | --- |
| `customRender?: ICellCustomRender[]` | canvas 自绘(徽标文本走这里) | `node_modules/@univerjs/core/lib/types/sheets/typedef.d.ts:258` |
| `markers?: ICellMarks`(tl/tr/bl/br 角标三角,`{color,size}`) | 备用角标 | 同上 `:240-246`、`:257` |
| `interceptorStyle?: IStyleData` | 视图期样式覆盖 | 同上 `:255` |
| `fontRenderExtension?: IFontRenderExtension`(offsets/isSkip) | 让默认文本渲染让位(徽标场景不需要) | 同上 `:247-253`、`:267` |

`ICellCustomRender`(`drawWith(ctx, info, skeleton, spreadsheets)` / `zIndex` / `isHit` / `onPointerDown|Enter|Leave`):
`node_modules/@univerjs/core/lib/types/types/interfaces/i-cell-custom-render.d.ts:38-48`;上下文 `ICellRenderContext`(`data/style/primaryWithCoord/unitId/subUnitId/row/col/worksheet/workbook`)同文件 `:21-31`;格子坐标 `ICellWithCoord.startX/endX/startY/endY/mergeInfo`:`node_modules/@univerjs/core/lib/types/sheets/typedef.d.ts:510-544`。

> ⚠ 该接口在 `:32-37` 标注 `@deprecated This interface is subject to change in the future`。风险评估见 §5。

### 2.3 渲染消费(谁真正把 `customRender` 画出来)

| 环节 | 出处 |
| --- | --- |
| engine-render 内建 `Custom` 扩展(`DefaultCustomExtension`,Z_INDEX 55):遍历脏区/可视区,对带 `customRender` 的格子逐个 `ctx.save() → item.drawWith(ctx, renderInfo, skeleton, this.parent) → ctx.restore()` | `node_modules/.pnpm/@univerjs+engine-render@0.25.1_react@18.3.1_rxjs@7.8.2/node_modules/@univerjs/engine-render/lib/es/index.js:5509-5533`(源码区 `src/components/sheets/extensions/custom.ts`) |
| 内建 `Marker` 扩展(Z_INDEX 60):画 tl/tr/bl/br 角标三角 | 同文件 `:18963-19060` |
| 指针交互:`CellCustomRenderController` 支持 `isHit`/`onPointerDown`(带编辑权限校验),徽标纯展示可不用 | `node_modules/.pnpm/@univerjs+sheets-ui@0.25.1(@types+react-dom@18.3.5…tltvk2asufxmj5wnkjpqb5h23e)/node_modules/@univerjs/sheets-ui/lib/es/index.js:8929-9055` |
| 备选路线 B:继承 `SheetExtension` 自注册全量绘制扩展(`SpreadsheetExtensionRegistry`) | `node_modules/.pnpm/@univerjs+engine-render@0.25.1…/…/engine-render/lib/types/components/sheets/extensions/sheet-extension.d.ts:26-38`、`…/components/extension.d.ts:49`。**不采用**:要自己处理脏区/合并/缩放,`customRender` 已内建这些 |

### 2.4 官方同款用法(0.25.1 内的真实先例)

| 先例 | 用法 | 出处 |
| --- | --- | --- |
| data-validation(下拉图标/校验角标) | 注册 `CELL_CONTENT`,`effect: Style`,`priority: DATA_VALIDATION`;克隆后追加 `cell.customRender = [...已有, validator.canvasRender]`、`cell.markers`、`cell.fontRenderExtension`、`cell.interceptorStyle`;最后 `return next(cell)`;防御:`if (!cell \|\| cell === pos.rawData) cell = { ...pos.rawData }` | `node_modules/.pnpm/@univerjs+sheets-data-validation-ui@0.25.1(@types+react-dom@18.3.5…adhm5pdx2o6bge3nsdfywhmipm)/node_modules/@univerjs/sheets-data-validation-ui/lib/es/index.js:1222-1301` |
| numfmt(显示值改写) | 同一拦截点,`effect: Value \| Style` | `node_modules/.pnpm/@univerjs+sheets-numfmt@0.25.1_react@18.3.1_rxjs@7.8.2/node_modules/@univerjs/sheets-numfmt/lib/es/index.js:697-701` |

先例说明:徽标渲染与 data-validation、numfmt 在同一管线组合,多拦截器共存是常态。

### 2.5 对复制 / 查找 / 排序 / 导出的影响(逐项核到消费代码)

| 消费方 | 读法 | 影响 | 出处 |
| --- | --- | --- | --- |
| 复制 | `_generateCopyContent` 用 `getMatrixWithMergedCells(…, CellModeEnum.Both)` 取格,再经 `cloneCellDataWithSpanAndDisplay` 白名单克隆:`p,s,v,t,f,ref,xf,si,custom,rowSpan,colSpan,displayV` | **无影响**:`customRender/markers/interceptorStyle` 不在白名单,进不了剪贴板与内部复制缓存(`custom.lumio` 会随复制走,这是现状语义,与徽标无关) | `…/sheets-ui/lib/es/index.js:4175-4207` + `node_modules/.pnpm/@univerjs+core@0.25.1_react@18.3.1_rxjs@7.8.2/node_modules/@univerjs/core/lib/es/index.js:15296-15310` |
| 查找替换 | `worksheet.getCellRaw` | **无影响**:徽标搜不到 | `node_modules/.pnpm/@univerjs+sheets-find-replace@0.25.1(…lxfamnhewz5usn5hopwjaz4psm)/node_modules/@univerjs/sheets-find-replace/lib/es/index.js:721、811` |
| 排序 | `worksheet.getCellRaw`(排序比较取原始格) | **无影响**:四态格 `v` 为 null 的排序语义不变 | `node_modules/.pnpm/@univerjs+sheets-sort@0.25.1_react@18.3.1_rxjs@7.8.2/node_modules/@univerjs/sheets-sort/lib/es/index.js:144、258` |
| 导出 | 走 Host 投影(`src/lumio_config/editor/`),不经 Univer 渲染 | **无影响**(构造性) | `docs/decisions/0-7-web-editor-boundary-and-stack.md` §1 |
| 模型读取 | `getCell`(组合)/ `getCellRaw`(原始)分离;`getCell` 文档警告「跑全部 CELL_CONTENT 拦截器,有性能代价」 | 提取器(`extract.ts`)走 `getCellRaw` 语义的既有路径,不受污染 | `node_modules/@univerjs/core/lib/types/sheets/worksheet.d.ts:252-278` |

**未找到**:
- facade(`FUniver`/`FWorksheet`)层没有任何徽标/单元格装饰 API(`node_modules/@univerjs/core/lib/types/facade/` 与 `…/@univerjs/sheets/lib/types/facade/f-worksheet.d.ts` 均无 `customRender`/`getCell` 相关出口)。生产接线必须走 `__getInjector()`,这不是 hack,是 DV 同款内部路径。
- 没有「纯样式」能画右下角文本徽标的途径(`IStyleData` 只有 bg/边框/字体属性)——即退路 B 只能丢徽标,不能换个样式 API 保住徽标。

## 3. 最小 demo

- 位置:`editor/docs/spike/`(不被 `editor/src` 引用、不进 build、不进 `editor_static`;`.gitignore` 排除 `dist-spike/`)。
- 启动(在 `editor/` 目录):

  ```bash
  corepack pnpm exec vite --config docs/spike/vite.config.mjs   # http://127.0.0.1:5199
  ```

- 截图:`corepack pnpm exec playwright screenshot --viewport-size=1360,860 --full-page --wait-for-timeout=5000 http://127.0.0.1:5199 docs/spike/badge-null.png`
- 产物:`badge-null.png`(整页:四态徽标 + 对照格 + 复核面板)、`panel-dump.png`(面板特写)。
- 页面内容:「impact」列五行——missing / `""` / **null(∅,必答题)** / default(幽灵值 25 + `默认` 徽标)/ 普通值对照;「note」列首行演示 `markers.br` 角标三角。数据层四态格 `v` 全部不写。
- 自检面板逐行输出「模型层 `v` vs 渲染层 `customRender`/`markers`」并断言三态 `v === null`,运行结果 **PASS**(见截图);`getCellRaw` 序列化样例可见 `v`/`t` 均不存在、只有 `s` + `custom.lumio`。

## 4. 成本

| 项 | 量 |
| --- | --- |
| demo 徽标渲染对象 `badgeRender`(`drawWith` 实现) | ~25 行 |
| demo 拦截器注册(effect/克隆/追加 customRender/markers) | ~25 行 |
| 装配(`__getInjector` → `get(SheetInterceptorService)` → `intercept`) | ~3 行 |
| **生产接线预估**(新增 `editor/src/spreadsheet/badges.ts`,四态颜色/字号常量 + 上述三段) | **~60-80 行 + 安装点 3-5 行**;`projection.ts`/`cellMeta.ts` 零改动(`custom.lumio.badge` 现成) |

## 5. 风险与升版

1. **`ICellCustomRender` 带 `@deprecated`(标注 subject to change)**。缓解:(a) 它是 0.25.1 data-validation 下拉图标的主渲染路径,官方自身深度依赖;(b) 降级梯度明确——先退 `markers`(角标三角,非 deprecated 字段,信息量低但仍可区分四色),再退「样式 + 检查器文字」;(c) 0-7 §2 已锁 `0.25.x` 并要求升版前跑四态/拦截回归,本 demo 可直接复用为升版核对工具(升版后徽标不出现即 API 变动)。
2. **`getCell` 组合管线性能**(`worksheet.d.ts:255` 自带警告):每个可视/脏格每帧过一遍拦截器。DV 同规模在跑;本拦截器是 O(1) 字段读取 + 数组追加,不新增遍历。
3. **拦截器内不可写模型**:demo 遵循 DV 的克隆防御(`cell === rawData` 时浅拷贝),直接改 rawData 会污染 undo 栈。
4. **合并单元格被禁**(0-7 §4),`customRender` 对合并格的边界行为不会遇到。
5. CSP:`default-src 'self'` 下 canvas 自绘无网络请求;preset CSS 无 `url()` 外链(已核 `lib/index.css`),demo 页面自带同款 CSP 头验证通过。

## 6. 二选一的裁决依据(ADR 0008 详述)

| | A 渲染扩展(本 spike 验证) | B 仅样式 + 检查器与悬停文字 |
| --- | --- | --- |
| 徽标视觉 | 与 0-7 §5「灰斜体徽标」一致,`∅`/`""`/`missing`/`默认` 可并排区分 | 徽标消失;现状 `empty` 与 `nullState` 两态同色(`#80868B`,见 `projection.ts` STYLES),仅差字号 10/11,纯样式下实际不可区分,必须悬停或开检查器 |
| 数据层 | `v` 不动(硬约束保持) | `v` 不动 |
| 代码量 | ~60-80 行 | 0 行(样式已有) |
| 风险 | deprecated 标注 + 升版复核成本 | 无技术风险;交互成本转嫁给用户,四态作为「一等公民」的可用性受损 |

**选 A**:技术可行已被 demo 证明、成本低、官方先例充分;风险有明确降级梯度与升版门。B 保留为升版受阻时的退路,不入本轮实现。

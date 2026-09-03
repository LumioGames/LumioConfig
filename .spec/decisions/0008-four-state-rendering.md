# 0008 · 四态徽标走 Univer 渲染扩展(CELL_CONTENT 拦截器 + customRender),徽标仍不进 `v` / token;升版受阻时降级「样式 + 检查器」

- 日期:2026-09-03
- 状态:生效

## 背景

ADR 0006 把四态呈现的决定权移交给 M6-F 内的半天 spike:核实 Univer 0.25.1 能否在不改单元格 `v` 的前提下用自定义单元格渲染画徽标,能则走渲染扩展,不能则退回「底色 / 边框 / 斜体 + 检查器文字说明」。备选的两个前提:徽标写进 `v` 会污染复制 / 查找 / 排序 / 导出并撞上投影回环单测(既有硬约束);纯样式方案里 `empty` 与 `null` 两态现状同色(`editor/src/spreadsheet/projection.ts` 的 STYLES),仅靠样式不可区分。

## 决策

- **四态徽标采用渲染扩展**:经 `SheetInterceptorService.intercept(INTERCEPTOR_POINT.CELL_CONTENT, { effect: Style })` 在视图格追加 `customRender`(canvas 绘制徽标文本于右下角),模型层 `v` 保持 null,徽标继续只存于 `custom.lumio.badge`。**硬约束不变:徽标不进 `v` / token,四态与普通值互不坍缩。**
- 依据(`editor/docs/four-state-render-spike.md`,证据均出自 `editor/node_modules` 类型与实现):官方 data-validation 下拉图标走同一拦截点同一批字段;复制(clone 白名单不含 `customRender`)、查找与排序(走 `getCellRaw`)、导出(走 Host 投影)逐项核到消费代码确认不受影响;最小 demo(五格四态 + 对照)在浏览器跑通并截图,模型层断言 PASS。
- 生产接线预估 ~60-80 行(新增 `badges.ts` + 安装点数行),`projection.ts` / `cellMeta.ts` 零改动;重设计投影视觉卡(M6-H)按此消费。
- 升版风险显式接受:`ICellCustomRender` 在 0.25.1 类型上带 `@deprecated`(subject to change)。降级梯度:`markers` 角标三角(非 deprecated 字段)→ 样式 + 检查器文字;spike demo 保留为升版核对工具,升大版本跑四态回归为既有门(docs/decisions/0-7 §2)。

## 后果

- M6-H 的四态视觉按「灰斜体徽标」设计稿执行,不再需要「仅样式」的弱化版;`∅` / `""` / `missing` / `默认` 并排可区分。
- 编辑器代码新增一处对 Univer 内部服务(`__getInjector`)的依赖:facade 层无徽标 API,这是官方功能同款路径;封装在单一安装点,升版时只有一处要动。
- 升级 Univer 大版本时,若 `customRender` 变动,徽标渲染是显式回归项;两次降级都保住「徽标不进 `v`」的硬约束,只损失视觉信息量。
- 本 ADR 的证据行号基于 lockfile 锁定的 0.25.1;升版后行号会漂移,以包内符号名为准复核。

# 0006 · 四态呈现由 spike 决定而非直接采用文本徽标；J3 本轮只做指纹变化横幅；`invalid` 红字为前端守卫缺失；深色主题后续

- 日期:2026-09-03
- 状态:生效

## 背景

设计师的决策清单把四态呈现定为「文本徽标 + 样式，零新实体」，把 `name / display_name / icon` 全红定为「需要 Host 核实」，把 J3「核对 AI 改了什么」定为「本地差异页签 + Host 历史接口」。本会话复核发现三个前提都不成立：

1. 现状 `projection.ts` 对 missing / `""` / null 三态返回 `v: undefined`，`projection.roundtrip.test.ts` 有两条单测断言徽标**不得**进 `v` 与 token；今天的对抗审查（`docs/reviews/2026-09-03-editor-core-edit-path-adversarial-review.md` P1-1 / P2-1）证实 `custom.lumio.badge` 没有任何渲染代码，且键盘覆写会让 `v` 与 token 分叉。把徽标写进 `v` 会与 P1-1 正面相撞，并污染复制、查找、排序、导出。
2. `editors.ts` 的 `numberOutOfRange` 不按列类型守卫，string 列 `Number("fireball")` 为 NaN 即标红。这是一行前端修，与 Host 无关。
3. Host 现有 API 没有历史数据；在历史接口落地前，「仅我的未提交改动」页签与补丁页签内容重叠，是重复实体。设计稿提议的 `since=<sourceFingerprint>` 也不可行：Host 没有指纹到修订的持久映射（`session.py` 的 `_history` 是进程内缓存），git 里按指纹找 commit 要遍历 log 逐个算指纹。

## 决策

- 四态呈现**不在本 ADR 定案**。修复卡（M6-F）内做一个半天量级的 spike：核实 Univer 0.25.1 能否在不改 `v` 的前提下用自定义单元格渲染画徽标（API 出处写 `node_modules` 类型定义路径，附最小 demo 截图）。能则走渲染扩展，不能则退回「底色 / 边框 / 斜体 + 检查器文字说明」。结论记 ADR 0008。硬约束不变：徽标不进 `v` / token，四态与普通值互不坍缩。
- `invalid` 红字归入修复卡：`numberOutOfRange` 按 `NUMBER_TYPES` 守卫，string 列不走数值校验；不立「需要 Host」卡。
- J3 本轮只做「自上次打开以来这张表已变化」横幅（`localStorage` 记上次看到的 `revision.id` 与指纹）。「改动」页签整体随 Host 历史接口卡（M6-K）交付，接口定位键改为 `since=<revisionId>`，`vcs=svn/none` 返回空并暴露 `capabilities.history=false`。
- 深色主题不在本轮；令牌走 CSS 变量，`data-theme` 切换点预留。

## 后果

- 修复卡多一个 spike 产出（`editor/docs/four-state-render-spike.md` + ADR 0008），重设计的投影视觉卡（M6-H）依赖其结论。
- 本轮 J3 的可见收益只有一条横幅；修订级核对要等 M6-K。
- 真实 `schemas/*.json` 没有 `default` / `enum` / `bool` 列，`默认` 态与枚举下拉只在 `editor/fixtures/` 可达；验收在 fixture 与真仓上双跑，真仓上这些形态不可达属预期。不向架构仓提 Schema 加字段的契约需求。

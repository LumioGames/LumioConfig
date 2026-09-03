# 0007 · 重设计叠在已交付的 UI 原语与令牌上、修复卡先行、`App.tsx` 由主 loop 每 wave 接线，不采用一卡一会话流程

- 日期:2026-09-03
- 状态:生效

## 背景

设计师的实现计划（16 张卡 + 2 张「需要 Host」）假设 `editor/src/` 里没有共享组件，要另起 `editor/styles/tokens.css`（`--bg` 命名）与 `ui/{Button,…}`；把 `App.tsx` 留到最后一张卡才改、前两个 wave 的组件通过 props 契约「盲对接」；文件集里没有 `interceptors.ts` 与 `api/types.ts`。随附的 `CLAUDE_CODE_PROMPT.md` 要求一卡一会话、每卡另开审查会话、共 16 次。而本仓在 2026-09-03 已交付 `editor/src/components/ui/{Button,Panel,DataTable}` + `styles/tokens.css`（`--color-*`）+ `ui.css`（`.spec/knowledge/features/editor-ui-primitives.md` 状态 `已交付`）；本仓规程是 wave 并行 worktree 扇出、统一合入后 reviewer 审一次；R-00361 当天被对抗审查退回，两条 P1 都在 `interceptors.ts`。

## 决策

- 在既有 `components/ui/` 旁扩展 `Tabs / Dialog / Toast / Menu / useHotkeys`，令牌沿用 `--color-*` 前缀扩展；不另起第二套。
- **修复卡（M6-F）先于重设计**：R-00361 退回项、`invalid` 守卫、四态呈现 spike、真实键盘 E2E 先合入 main，重设计契约卡以它为前置。
- 卡序：M6-F 修复 → M6-G 契约层 → M6-H 壳与表格区 → M6-I 抽屉 → M6-J 键盘与收口；M6-K（Host 历史接口 + 改动页签）文件集与前端卡不重叠，可与 M6-H 并行。仓内每张 Workflow 卡再按 `writing-plans` 拆成文件集互斥的任务卡并行扇出。
- `App.tsx` 不进任何 worker 卡；每个 wave 合入时由主 loop 接线，保证每 wave 结束都有可运行、可 E2E 的整体。
- `interceptors.ts`、`api/types.ts`、`__lumioPoc` 桥纳入文件集与验收；E2E 只覆盖 8 个 testid 的现状写进设计稿，新验收项一律写明是新增测试。
- 不采用 `CLAUDE_CODE_PROMPT.md` 的一卡一会话、每卡审查流程；审查按本仓规程在统一合入后做一次（触碰红线面的卡例外）。该文件不入库。

## 后果

- 重设计整体延后一张修复卡的时间；换来不在坏地基上盖楼。
- 主 loop 每 wave 多一次接线合入，集成风险前移。
- 设计师 handoff 中的计划与决策文件被改写后归档（本 ADR 与 0003–0006、`.spec/plans/2026-09-03-web-editor-redesign-plan.md`），原件保留在原型目录的 README 中作设计参考。

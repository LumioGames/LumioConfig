# 0005 · 会话阶段以用户口径呈现：预检无改动置灰、提交只在有副作用时确认、阻断态横幅化、`failKind` 取代 hint 子串判断

- 日期:2026-09-03
- 状态:生效

## 背景

v1 状态栏是一行原始字段（完整 sha256、英文阶段名 `ReadyClean`、「脏格 0」），最重要的阻断信息（「另一个标签页已保存」、仓库已变化）是最右侧一小段红字。`state.ts` 的 `canRefreshOnly` 靠 `hint.includes("标签页")` / `hint.includes("SCHEMA_CHANGED")` 做控制流；`hint` 同时承担显示文案、错误透传与控制流三种职责，产生点横跨 `App.tsx` / `state.ts` / `interceptors.ts` 20 余处。0-8 §8 只规定了必须禁用的态（`Submitting` 全禁、`Stale` 只允许合并、`Conflicted` 只允许冲突面板与取消），未规定 `ReadyClean` 必须可预检；0-8 §8 把 SCHEMA_CHANGED 归入 Conflicted 分支，代码实际归入 Failed。

## 决策

- 阶段名全部翻译成用户口径（映射表见 `.spec/knowledge/features/web-editor-ux.md` §5），英文阶段名只出现在 `title` / `data-phase`。
- `ReadyClean` 且无改动时「预检」置灰并给 tooltip；`canValidate` 增加 `dirtyCount > 0`。这是对 0-8 §8 的**收紧细化**，不是突破。
- 提交前确认只在会 commit 或导表（`autoCommit || autoExport`）时弹一句话；否则直接提交。
- `Stale`、`Conflicted`、`Failed`（三种）、离线 一律页面顶部横幅级或整页阻断级，带唯一允许的动作按钮。
- `EditorState` 新增 `failKind: 'VCS' | 'SCHEMA_CHANGED' | 'DRAFT_VERSION_CONFLICT' | ''`，`canRefreshOnly` 与横幅按 `failKind` 分派，不再对 `hint` 做子串判断。SCHEMA_CHANGED 以 `Failed + failKind` 表达 0-8 §8 的同一语义。
- 离线 / token 失效不是新阶段，是 `online:false` 叠加在当前阶段上的派生态。
- `status-hint` 改为视觉隐藏的 live region，保留既有 E2E 的关键词断言；所有阻断 / 提示走横幅或 toast，状态条不再承载 `hint`。
- 指纹缩到 8 位、点击复制全文；修订显示 `分支 · 短 sha`（svn 无分支显示 `r<id>`，`vcs=none` 不显示）。
- 「草稿自动保存，不写权威源」改为首次打开 toast，不常驻。

## 后果

- 需要 `phaseView(state)` 派生层与 `copy.ts` 文案集中管理，并用正则单测守住「无英文阶段名 / JSON 键名 / 文件名」。
- `hint` 的 20 余处产生点要逐一归类为 `failKind` 或 toast；改动面横跨 `state.ts`、`api/types.ts`、`App.tsx`、`interceptors.ts`，必须写进实现卡文件集。
- 为 E2E 保留一个视觉隐藏的 DOM 节点是妥协；后续新 E2E 应直接断言横幅 / toast。

# 0-8 草稿、提交与合并生命周期

> **并行期声明。** 本决议暂落本仓、不占架构仓 ADR 号。原因是并行期避免与 RM-00011 抢号：架构仓 `.spec/decisions/` 由 RM-00011 编排会话唯一写入，ADR 编号在合并时现查当时最高号再占。后人不得把本文件的存在理解成架构仓流程遗漏。

对应设计概要 §4「M6 网页编辑器 · 能干什么 ②③④」与架构仓落地方案 §3；裁决依据为板 A.1b / A.1c / E.1，以及 Owner 2026-09-02 裁决「提交到版本库做成设置项，版本库支持 Git / SVN / 无」。本决议同时约束 AI 补丁通道：`base` / `expect` 与三方合并是 M2 的能力，不是编辑器私有。

## 决定

### 1. 动作命名

- `Ctrl+S` = **保存本地草稿**，不碰 `tables/`，不进 M2。
- 正式动作四个，名称固定：**预检**（`patch validate`）、**预览补丁**（展示将提交的 ops 与人话摘要）、**提交补丁**（`patch apply`）、**导出**。界面上没有「保存到仓库」「上线」「激活」。

### 2. 草稿

- 位置 `.lumio/drafts/<table>.json`（仓内，`.gitignore` 忽略 `.lumio/drafts/` 与 `.lumio/local.json`）。
- 格式：

```json
{
  "table": "skills",
  "baseFingerprint": "sha256:…",
  "draftVersion": 7,
  "savedAt": "2026-09-02T10:00:00Z",
  "rows": {
    "40001": {"damage": {"state": "value", "raw": "130"}},
    "draft:3f9a1c2e": {"name": "ice_lance", "display_name": {"state": "value", "raw": "Ice Lance"}, "damage": {"state": "value", "raw": "40"}}
  },
  "renamed": {"40003": "frost_bolt"},
  "deleted": ["40002"]
}
```

  `rows` 的键是终身编号或 `draftRowKey`；已有行只记改过的格，新行记全部格。
- 保存用乐观并发：请求带 `expectedDraftVersion`，不等于当前值 → `409 DRAFT_VERSION_CONFLICT`，前端提示「另一个标签页已保存」并只允许刷新。
- 前端在编辑停顿 2 秒后自动保存，`Ctrl+S` 立即保存。
- 打开表时若存在草稿：`baseFingerprint` 等于当前底稿指纹 → 直接套用；不等 → 先按 §4 做三方合并，结果与冲突一并呈现，草稿不丢。

### 3. 基线与补丁扩展

- 基线 = 打开时该表的 **底稿指纹** `fingerprint.source_fingerprint(tables/<t>.txt, schemas/<t>.json)`，不是版本库修订号——Git / SVN / 无版本库行为一致。
- 补丁在 0-6 格式上增加两个可选字段：

```json
{
  "table": "skills",
  "base": {"sourceFingerprint": "sha256:…"},
  "ops": [
    {"op": "update", "name": "fireball", "set": {"damage": 130}, "expect": {"damage": "120"}},
    {"op": "rename", "name": "frostbolt", "to": "frost_bolt", "expect": {"name": "frostbolt"}},
    {"op": "delete", "name": "unused_skill", "expect": {"id": "40009"}},
    {"op": "create", "name": "ice_lance", "set": {"display_name": "Ice Lance", "effect_id": "chill", "damage": 40, "cooldown_frames": 60, "icon": "fx_ice_lance"}}
  ]
}
```

  `expect` 记录基线时被改各格的**源 token**（`@missing` / `""` / `null` / `@default` / 原始文本）；`create` 无 `expect`。没有 `base` 的补丁（AI 直提）按 0-6 原语义处理，不做三方。

### 4. M2 单元格级三方合并

输入：`base`（`expect`）、`current`（提交瞬间仓库该格 token）、`draft`（`set` 值转成的 token）。

| base | current | draft | 结果 |
| --- | --- | --- | --- |
| A | A | B | 采 draft B |
| A | B | B | 已一致，无操作 |
| A | B | A | 保留 current B，无操作 |
| A | B | C | **冲突** `STALE_BASELINE` |
| 任意 | 行已删除 | 改该行 | **冲突** `DELETED_ROW_CONFLICT` |
| 任意 | 行已改名 | 按旧名定位 | 按 `registry/row-ids.json` 的终身编号重新定位，继续按上表判 |

- 补丁 `base.sourceFingerprint` 等于当前底稿指纹 → 跳过三方直接 apply。
- 比较对象是四态 token，不是显示串：`""`、`null`、`@default`、`0` 互为不同值。
- 同一表内任一格冲突 → 整个补丁不落盘，返回全部冲突；错误对象在 0-6 报错格式上加 `base` / `current` / `draft` 三个字段与 `row` 的终身编号。
- 冲突解决后前端重新生成完整补丁并**重跑 validate + apply**，不得只在 UI 标「已解决」。
- Schema 底稿变化（`schemas/<t>.json` 指纹不等于打开时）→ 错误 `SCHEMA_CHANGED`，禁止自动提交，只允许刷新重放。

### 5. 提交成功后的返回

`apply` 成功返回：合入后新的底稿指纹、`create` 操作分配到的终身编号映射（`draftRowKey → id`）、人话摘要、版本库动作结果（见 §6）。编辑器据此重载表并把 `draftRowKey` 替换成正式 `id`，清空该表草稿。

### 6. 提交到版本库 = 设置项

`.lumio/editor.json`（仓级，入库）与 `.lumio/local.json`（个人，不入库）按键深合并，`local` 覆盖 `editor` 覆盖默认：

```json
{
  "vcs": "git",
  "submit": {"autoCommit": true, "autoExport": false},
  "export": {"outDir": "build/export"},
  "openPolicy": {"allowDirtyWorkingTree": false}
}
```

- `vcs` ∈ `git` / `svn` / `none`。默认按仓根探测：有 `.git` → `git`，有 `.svn` → `svn`，否则 `none`。
- `VcsAdapter` 三个方法，命令全部白名单，前端拼不到任何命令：
  - `status(paths)`：`git status --porcelain -- <paths>` / `svn status <paths>`；`none` 恒为干净。
  - `revision()`：`git rev-parse HEAD` + `git rev-parse --abbrev-ref HEAD` / `svn info --show-item revision`；`none` 返回 `null`。
  - `commit(paths, message)`：`git add -- <paths> && git commit -m <message>`（只 add 白名单路径：`tables/<t>.txt`、`registry/row-ids.json`、`registry/tombstones.json`）/ `svn commit <paths> -m <message>`（新文件先 `svn add`）；`none` 返回 `null`。
- `autoCommit=true`：apply 成功后立即 `commit`，message 首行 `config(<table>): <人话摘要>`，正文附补丁 JSON 与合入前后底稿指纹；界面提交前显示目标分支 / 工作副本修订与变更摘要。commit 失败不回滚已合入的 TXT，返回 `VCS_COMMIT_FAILED` 并提示手动提交。
- `autoCommit=false`：只写工作树，状态栏常显「N 处未提交」。
- `autoExport=true`：commit（或 apply）成功后跑 `export_repository(root, outDir)`；导出物是只读生成物，不等于上线。
- 设置只在 Host 侧生效；界面「设置」面板写 `local.json`，不写 `editor.json`。

### 7. 打开策略

- 启动 `serve` 时 `VcsAdapter.status(["tables", "registry", "schemas"])` 非空且 `allowDirtyWorkingTree=false` → 拒绝打开，错误 `working_tree_policy_violation` 并列出脏文件。
- `allowDirtyWorkingTree=true` → 允许打开，但 `autoCommit` 强制视为 `false`（避免把无关改动一起提交）。
- `vcs=none` 不检查。

### 8. 会话状态机

```text
Opening → ReadyClean | Failed
ReadyClean → ReadyDirty（用户编辑）
ReadyDirty → SavingDraft → ReadyDirty
ReadyDirty → Validating → ReadyDirty（预检失败）| ReadyToSubmit
ReadyToSubmit → Submitting → ReadyClean（合入并重载）| Conflicted（三方冲突 / SCHEMA_CHANGED）| ReadyDirty（M2 拒绝）
Conflicted → ReadyDirty（解决后重生成补丁）
ReadyClean | ReadyDirty → Stale（Host 确认仓库底稿指纹变化）→ ReadyDirty（合并完成）
```

按钮可用性由状态决定：`Submitting` 期间全部禁用；`Stale` 只允许「合并仓库改动」；`Conflicted` 只允许冲突面板动作与「取消」。

### 9. SSE 事件

`GET /api/events` 推送：`repo_revision_changed`（Host 复核底稿指纹后才发，watcher 只触发复核）、`schema_changed`、`draft_saved`、`submit_started`、`submit_succeeded`、`submit_failed`、`session_expiring`。首版轮询兜底：前端每 5 秒 `GET /api/session` 比对指纹。

## 明确不做

- 不做「强制覆盖」按钮；冲突只能逐格选择或取消。
- 不做每次按键即 commit；不做自动 push / 自动 PR。
- 不把版本库修订号当合并基线。
- 不在本决议占用架构仓 ADR 号。

## 将来搬入架构仓

- 对应 ADR 候选主题：**配表草稿、提交与三方合并生命周期**（架构仓落地方案 §3）；其中 `base` / `expect` / 三方规则属工具面契约，搬入时与 0-6 合并考虑。
- 编号不在此预占。搬入时由 Owner 在架构仓按当时最高 ADR 现查现占；本文不得写成 `ADR-NNN`。

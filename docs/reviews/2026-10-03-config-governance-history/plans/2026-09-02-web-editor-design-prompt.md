---
status: in_progress
---

# LumioConfig 网页编辑器设计与实现指引（v2，2026-09-02）

> 用途：本文是 M6 网页编辑器全部任务卡（R-00322 扩、R-00330 收窄、M6-A ~ M6-E = Workflow R-00360 ~ R-00364，蓝图 `lumioconfig-m6-editor-20260902/r1`）的**实现指引单一来源**。派活时把 §4 对应卡的整节原样粘进 Workflow 卡正文「实现指引」，再附 §0 与 §3。执行 Agent 不依赖本对话、不依赖调研稿即可开工。
> v1（零依赖单文件 HTML + 标准库服务）已被 Owner 2026-09-02 裁决替换：表格内核改 Univer OSS + React + Vite，Host 仍是 Python 标准库；裁决与理由见 `docs/decisions/0-7`、`0-8` 与架构仓 `.spec/plans/2026-09-02-config-web-editor-landing.md`。v1 的源格式结论（TXT + 行间空行，不改 `.md`）已并入 `0-1` 决议，本文不再重复。

---

## 0. 怎么读本文：上下文来源与合并规则

执行任何一张卡之前，按下面顺序加载上下文，**冲突时序号小的赢**；发现两处口径不一致，停下，交回物标 `BLOCKED` 并引用两处原文，不得自行取舍。

| 序 | 来源 | 读什么 | 读到什么深度 |
| --- | --- | --- | --- |
| 1 | 架构仓 `~/LumioGames/LumioGameEngine/.spec/knowledge/features/config-table.md` | §1 四条底线、§4 M1–M6 模块、§6 明确不做 | 全文读；M6 节逐条对照本文 |
| 2 | 架构仓 `.spec/plans/2026-09-02-config-web-editor-landing.md` | 四项裁决、架构、提交合并机制、分卡、验收硬指标 | 全文读 |
| 3 | 本仓 `docs/decisions/0-1` ~ `0-8` | 0-1 权威源与补丁通道、0-2 发号、0-3 指纹与数值、0-6 补丁 / 报错格式、**0-7 编辑器边界与选型、0-8 草稿 / 提交 / 合并** | 0-1、0-6、0-7、0-8 全文；0-2、0-3 读「决定」节 |
| 4 | 本仓 `docs/reference/source-format.md`、`error-format.md`、`cli.md` | 源方言、四态 token、报错字段、CLI 子命令 | 全文读 |
| 5 | 本文 §3 公共契约 + §4 本卡节 | 接口形状、模块清单、步骤、验收 | 全文读；邻卡节读「接口」小节 |
| 6 | Workflow 卡面验收项 | 本卡四条验收 | 逐条对照 §4 本卡「验收」 |
| 7 | 本仓 `src/lumio_config/*.py` 与 `tests/*.py` | 被本卡 Consumes 的函数签名与既有测试写法 | 只读本卡「接口 · Consumes」列出的符号所在文件 |
| 8 | 调研稿 `LumioConfig_Web_Spreadsheet_Editor_Technical_Guide_v1.0.md`（若在 `~/Downloads`） | 背景 | 可不读；与 1–7 冲突一律以 1–7 为准 |

**前置卡的产物怎么拿**：只通过 `origin/main` 的代码、`docs/reference/` 与测试读，不通过对话转述。本卡「接口 · Consumes」写的是精确符号（模块路径 + 函数名 + 签名），开工先 `grep` 确认存在；不存在 = 前置未合入，停下报 `BLOCKED`。

**前置卡没合入怎么办**：不得在本卡分支里顺手补前置卡的内容。文件集互不重叠是并行的前提，越界 = 核验不过。

**本仓规范**：`AGENTS.md` 指向的 `.spec/` 三件套全程生效——TDD、不夹带、收口门槛、交回物格式、`.spec/tasks/` 在途卡。

---

## 1. 一句话与用户

在浏览器里用飞书表格的手感打开、浏览、编辑本仓的配置表；`Ctrl+S` 存本地草稿；「提交补丁」时把改过的格子打成带基线指纹的补丁送进机器门，机器门做单元格级三方合并；提交成功后按设置自动 commit 到 Git / SVN、自动导表。编辑器不是权威源，没有上线按钮。

用户是一个人：策划或 TD。日常 80% 的改动由 AI 提补丁，人用编辑器做三件事：看表、微调几格、核对 AI 改了什么。不是多人协同产品，不做账号，不做公网。

---

## 2. 架构与目录

```text
LumioConfig/
├── src/lumio_config/
│   ├── patch.py                 M2 补丁门（既有）+ 三方合并（R-00322）
│   ├── fingerprint.py           source_fingerprint / content_fingerprint（既有）
│   ├── validate.py              load_sources / validate_repository / effective_value（既有）
│   ├── export.py                export_repository（既有）
│   ├── cli.py                   加 serve 子命令（M6-A）
│   ├── editor/                  新包（M6-A 起）
│   │   ├── __init__.py
│   │   ├── server.py            ThreadingHTTPServer、路由、token / Origin 校验、静态文件
│   │   ├── session.py           会话、表投影 JSON、底稿指纹缓存、修订复核、SSE 队列
│   │   ├── settings.py          .lumio/editor.json + local.json 合并
│   │   ├── vcs.py               VcsAdapter：GitAdapter / SvnAdapter / NoneAdapter
│   │   ├── drafts.py            .lumio/drafts/<table>.json 读写与 draftVersion（M6-B）
│   │   ├── submit.py            补丁提交编排：apply → commit → export（M6-C）
│   │   └── export_csv.py        CSV / TSV 导出 + README.txt（M6-E）
│   └── editor_static/           pnpm build 产物，随源提交（M6-E 起；之前各卡不提交产物）
├── editor/                      前端源（R-00330 起）
│   ├── package.json  pnpm-lock.yaml  vite.config.ts  tsconfig.json  playwright.config.ts
│   ├── THIRD_PARTY_NOTICES.md
│   ├── scripts/check-deps.mjs   扫描 lockfile 拒 @univerjs-pro
│   ├── fixtures/                静态投影 JSON（R-00330 用，之后作测试 fixture）
│   ├── docs/                    poc-benchmark.md、e2e-report.md
│   ├── src/
│   │   ├── main.tsx  app/App.tsx  app/state.ts（会话状态机）
│   │   ├── api/client.ts        fetch 封装（token、错误码）
│   │   ├── api/draftSession.ts  DraftSessionProvider 接口 + LocalDraftSessionProvider
│   │   ├── api/types.ts         与 §3 一一对应的 TS 类型
│   │   ├── spreadsheet/univer.ts         Univer 初始化、预设加载
│   │   ├── spreadsheet/projection.ts     表 JSON → IWorkbookData + ProjectionMap
│   │   ├── spreadsheet/interceptors.ts   命令拦截
│   │   ├── spreadsheet/fourState.ts      四态渲染与右键菜单
│   │   ├── spreadsheet/editors.ts        类型编辑器（枚举 / 引用 / 数值）
│   │   ├── spreadsheet/extract.ts        工作簿 → 语义 diff → 补丁
│   │   ├── spreadsheet/viewState.ts      localStorage 视图状态
│   │   ├── panels/TableList.tsx  StatusBar.tsx  ErrorPanel.tsx  DiffPreview.tsx  ConflictPanel.tsx  SettingsPanel.tsx
│   │   └── styles/
│   └── tests/                   Vitest 单测 + Playwright E2E
├── .lumio/
│   ├── editor.json              仓级设置（入库）
│   ├── local.json               个人设置（gitignored）
│   └── drafts/                  草稿（gitignored）
└── docs/reference/editor.md     用户文档（M6-E）
```

所有权见 `0-7` §1。一句话：**语义只在 Python；Univer 只管交互；身份只在 ProjectionMap；视图状态只在浏览器。**

---

## 3. 公共契约（每张卡都消费；改动契约 = 改本节 + 改 0-7/0-8，并通知总调度）

### 3.1 启动与鉴权

```bash
python tools/lumio_config.py serve [--port 0] [--no-open] [--root <repo>]
```

- 只绑 `127.0.0.1`；`--port 0` 取随机高位端口；启动打印并默认自动打开 `http://127.0.0.1:<port>/#token=<32 字节 urlsafe base64>`。
- token 在 URL fragment（不发给服务器）；前端读取后存 `sessionStorage`，之后所有 `/api/*` 请求带 `Authorization: Bearer <token>`；缺失或不等 → `401 {"code":"UNAUTHORIZED"}`。
- 校验 `Host` 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`；`Origin` 若存在必须同源；否则 `403 {"code":"FORBIDDEN_ORIGIN"}`。不设任何 CORS 头。
- 静态资源从 `src/lumio_config/editor_static/` 提供（`/` → `index.html`）；`Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`。
- 进程退出即 token 失效；`DELETE /api/session` 关闭会话并停止服务。

### 3.2 错误对象

所有 4xx/5xx 响应体是 `{"code": "...", "message": "...", "errors": [<0-6 报错对象>...]}`。`errors` 内对象在 0-6 五字段（`table` `row` `column` `code` `message` `suggestion`）基础上，三方冲突时多 `base` / `current` / `draft` / `rowId`。

新增错误码（与 0-8 一致）：`UNAUTHORIZED` `FORBIDDEN_ORIGIN` `WORKING_TREE_DIRTY` `DRAFT_VERSION_CONFLICT` `STALE_BASELINE` `DELETED_ROW_CONFLICT` `SCHEMA_CHANGED` `VCS_COMMIT_FAILED` `EXPORT_FAILED`。

### 3.3 端点与 JSON 形状

`GET /api/session`

```json
{
  "repoName": "LumioConfig",
  "revision": {"vcs": "git", "id": "ee10aaa…", "branch": "main", "dirty": false},
  "tables": [
    {"name": "skills", "schemaPath": "schemas/skills.json", "rowCount": 2,
     "sourceFingerprint": "sha256:…", "schemaFingerprint": "sha256:…"}
  ],
  "schemas": {"skills": { "...": "schemas/skills.json 原文对象" }},
  "settings": {"vcs": "git", "submit": {"autoCommit": true, "autoExport": false},
               "export": {"outDir": "build/export"}, "openPolicy": {"allowDirtyWorkingTree": false}},
  "capabilities": {"submit": true, "commit": true, "export": ["csv", "tsv"], "events": true}
}
```

`GET /api/tables/{table}`

```json
{
  "table": "skills",
  "sourceFingerprint": "sha256:…",
  "columns": [{"name": "id", "type": "u32", "required": true, "visibility": "SCV", "readOnly": true},
              {"name": "damage", "type": "i32", "required": true, "minimum": 0, "visibility": "S"}],
  "rows": [
    {"id": 40001, "name": "fireball",
     "cells": {"display_name": {"state": "value", "raw": "Fireball", "effective": "Fireball"},
               "damage":       {"state": "value", "raw": "120", "effective": 120},
               "icon":         {"state": "default", "raw": "@default", "effective": "fx_none"}}}
  ]
}
```

`cells` 的 `state` ∈ `value | empty | null | default | missing`（即 `model.Cell.state`），`raw` 是源 token（`Cell.token()`），`effective` 来自 `validate.effective_value`。`id` / `name` 提到行顶层，不在 `cells` 里重复。

`GET /api/drafts/{table}` → 0-8 §2 草稿对象或 `404`；`PUT /api/drafts/{table}`（体 = 草稿对象含 `expectedDraftVersion`）→ `{"draftVersion": n}`；`DELETE /api/drafts/{table}` → `204`。

`POST /api/patch/validate` 与 `POST /api/patch/apply`：体 = 0-8 §3 补丁对象。响应：

```json
{
  "ok": true,
  "summary": "skills: fireball.damage 120 → 130; 新增 ice_lance",
  "errors": [],
  "result": {
    "sourceFingerprint": "sha256:…新",
    "assignedIds": {"draft:3f9a1c2e": 40003},
    "vcs": {"action": "commit", "id": "abc123…", "branch": "main"},
    "export": {"outDir": "build/export", "files": 9}
  }
}
```

`validate` 只回 `ok` / `summary` / `errors`，不回 `result`；`apply` 失败时 `ok=false`、`errors` 非空、文件不落盘。

`POST /api/export`：体 `{"format": "csv"|"tsv", "tables": ["skills"], "source": "repo"|"draft", "targets": ["S","C","V"]?}` → `{"exportId": "…", "files": [{"table": "skills", "href": "/api/exports/<id>/skills.csv"}, {"href": "/api/exports/<id>/README.txt"}]}`；`GET /api/exports/{id}/{file}` 下载。导出目录 = `settings.export.outDir/editor/<exportId>/`，Host 拒绝任何客户端给的路径。

`GET /api/events`：`text/event-stream`，事件名与 0-8 §9 一致，`data` 为 JSON（至少含 `table` 与相关指纹）。

`DELETE /api/session` → `204` 并在响应后关闭服务器。

### 3.4 ProjectionMap（前端内存结构，`editor/src/spreadsheet/projection.ts`）

```ts
interface ProjectionMap {
  table: string;
  baseFingerprint: string;
  columns: string[];                 // colIndex → columnName（含 id、name）
  rowKeys: string[];                 // rowIndex → "40001" | "draft:3f9a1c2e"；表头行不计
  baseCells: Record<string, Record<string, CellToken>>; // rowKey → column → 打开时 raw token
  deleted: Set<string>;              // 标记删除的 rowKey
}
```

插行 / 删行 / 排序时必须同步 `rowKeys`；`extract.ts` 只读 `ProjectionMap`，不读 Univer 行号。

### 3.5 设置、草稿、补丁扩展、三方规则、VCS 行为、状态机、SSE

全部以 `docs/decisions/0-8` 为准，本文不复述；本节只补前端约定：设置面板只写 `local.json`，`editor.json` 由人手改。

### 3.6 前端工程约定

- pnpm；Node 22+；`pnpm lint`（eslint + tsc --noEmit）、`pnpm test`（Vitest）、`pnpm e2e`（Playwright，需 Host 在跑）、`pnpm build`。
- 不引入状态管理库；`app/state.ts` 用 `useReducer` 实现 0-8 §8 状态机。
- Univer 版本精确锁 `0.25.x`；`package.json` 不得出现 `@univerjs-pro`；`editor/scripts/check-deps.mjs` 扫描 lockfile 并在 CI 失败。
- 所有与 Host 交换的类型在 `api/types.ts`，与 §3.3 字段名一字不差。

---

## 4. 任务卡实现指引

每张卡的格式固定：目标 / 上下文加载 / 模块清单 / 步骤 / 接口 / 验收 / 不做。「上下文加载」列在 §0 表之外**额外**要读的东西。交回格式统一见 §7。

### 4.1 R-00322（扩）机器门 + 单元格级三方合并

**目标**：M2 接受带 `base` / `expect` 的补丁，做 0-8 §4 的单元格级三方合并；`STALE_BASELINE` / `DELETED_ROW_CONFLICT` / `SCHEMA_CHANGED` 结构化报错；`ALREADY_APPLIED` 幂等；审计输出。原卡「基线冲突 STALE_BASELINE」由表级升级为格级——**这是 AI 补丁通道与编辑器共用的能力，不是编辑器私有**。

**上下文加载**：`src/lumio_config/patch.py` 全文（`validate_patch` / `_validate_patch_errors` / `_apply_ops` / `apply_patch`）；`fingerprint.py` 的 `source_fingerprint`、`content_fingerprint`；`validate.py` 的 `load_sources`、`effective_value`；`ids.py` 的 `issue_lock`；`tests/test_patch_and_ids.py` 全部用例（照其 fixture 写法写新用例）。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `src/lumio_config/patch.py` | 新增 `merge_cell(base, current, draft) -> MergeDecision`（`take_draft` / `noop` / `conflict`）与 `merge_patch(root, patch) -> MergeResult`：读 `base.sourceFingerprint`，等于当前 → 原样返回；否则逐 op 逐格调 `merge_cell` 按 0-8 §4 表判定，产出「有效 ops」与「冲突列表」。`validate_patch` / `apply_patch` 先调它；冲突非空 → 只返回错误。 |
| `src/lumio_config/patch.py` | `apply_patch` 返回值改为 `ApplyResult`（`errors`、`source_fingerprint`、`assigned_ids: dict[str,int]`、`summary: str`），保持 `list[dict]` 形式的兼容包装给 CLI。 |
| `src/lumio_config/summary.py`（新） | `summarize_ops(schema, before_rows, ops) -> str`：人话摘要，格式 `<table>: <name>.<column> <old> → <new>; 新增 <name>; 删除 <name>; <old> 改名 <new>`，按 op 顺序，中文分号分隔。 |
| `src/lumio_config/cli.py` | `patch apply` 输出 JSON（`ok` / `summary` / `errors` / `sourceFingerprint` / `assignedIds`）；`--audit <path>` 追加一行 JSON 审计（时间、表、摘要、前后指纹）。 |
| `docs/reference/error-format.md` | 补三方冲突字段 `base` / `current` / `draft` / `rowId` 与新错误码。 |
| `docs/reference/cli.md` | 补 `apply` 输出与 `--audit`。 |
| `tests/test_patch_merge.py`（新） | 见验收。 |

**步骤**：① 先写失败测试：0-8 §4 表六行各一用例 + 行改名后按旧名定位 + Schema 变化 + 无 `base` 补丁行为不变 + 幂等重放 `ALREADY_APPLIED`；② 实现 `merge_cell` / `merge_patch`；③ 改 `apply_patch` 返回 `ApplyResult` 并保留旧调用方兼容；④ 写 `summary.py` 并测；⑤ CLI 与文档；⑥ 全量收口命令。

**接口**：
- Consumes：`fingerprint.source_fingerprint(table_path: Path, schema_path: Path) -> str`；`validate.load_sources(root) -> (schemas, tables, errors)`；`model.Cell.from_token / token`；`ids.issue_lock(root)`。
- Produces：`patch.merge_cell(base: str, current: str | None, draft: str) -> MergeDecision`；`patch.merge_patch(root: Path, patch: dict) -> MergeResult(effective_ops: list[dict], conflicts: list[dict], skipped: bool)`；`patch.apply_patch(root, patch) -> ApplyResult(errors: list[dict], source_fingerprint: str | None, assigned_ids: dict[str,int], summary: str)`；`summary.summarize_ops(schema, before_rows, ops) -> str`。M6-A/C/D 直接调这些符号。

**验收**：
- [ ] 0-8 §4 表六种组合各有测试并通过；比较对象是 token（`""` / `null` / `@default` / `0` 互异）。
- [ ] 冲突时 `tables/` `registry/` 字节不变；错误对象含 `base` / `current` / `draft` / `rowId`。
- [ ] 无 `base` 的补丁行为与 R-00322 之前完全一致（既有测试全绿）。
- [ ] `apply` 返回新指纹、`assignedIds`、人话摘要；同一补丁重放报 `ALREADY_APPLIED` 不改文件。

**不做**：不改源方言；不碰 `export.py`；不写任何 HTTP。

### 4.2 R-00330（收窄）Univer POC + 只读投影

**目标**：证明 Univer OSS 能承载本仓的投影与拦截要求：用静态 fixture 把表渲染成工作簿，四态显示，禁止操作被拦截，10k×50 可用，无修改往返提取得到空 diff。**不碰 Python，不依赖 Host**——文件集只有 `editor/`，与 Python 主线并行。

**上下文加载**：Univer 文档（workbook-data / worksheet-data / cell-data / data-validation / filter / sort / find-replace / custom components，`https://docs.univer.ai/guides/sheets`）；本仓 `schemas/*.json` 与 `tables/*.txt`（做 fixture 的样本）。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `editor/package.json` 等脚手架 | Vite + React + TS strict + Vitest + Playwright + eslint；Univer 0.25.x 精确锁；`scripts/check-deps.mjs` 拒 pro 包；`THIRD_PARTY_NOTICES.md`。 |
| `editor/fixtures/*.json` | 用 §3.3 `GET /api/tables/{t}` 形状手写 skills / effects / drops 三份，另生成 `big-10k-50.json`（脚本生成，含四态混合与中文 / Emoji）。 |
| `spreadsheet/univer.ts` | 创建 Univer 实例，只加载 preset-sheets-core + filter + sort + data-validation + find-replace。 |
| `spreadsheet/projection.ts` | `buildWorkbook(table: TableResponse): {workbook: IWorkbookData, map: ProjectionMap}`：sheet 名 = 表名；第 0 行表头；`id` 列只读样式；四态按 0-7 §5 渲染（徽标用 cell 自定义渲染或样式 + 文本前缀，不得把徽标写进值）；冻结首行与 `id` / `name` 两列。 |
| `spreadsheet/interceptors.ts` | 用 Univer 命令服务 `beforeCommandExecute` 拦截：`f` 字段（公式）→ 拒；合并单元格 → 拒；插 / 删列 → 拒；编辑 `id` 列 → 拒；粘贴含公式 → 只取值；插行 → 分配 `draft:<8hex>` 并写入 `map.rowKeys`；删行 → 加入 `map.deleted`。 |
| `spreadsheet/extract.ts` | `extractTokens(univer, map): Record<rowKey, Record<column, CellToken>>`：按 `map` 读单元格，把显示值反解成四态 token（依赖单元格上挂的 state 元数据，不靠样式猜）。 |
| `spreadsheet/viewState.ts` | 列宽 / 冻结 / 筛选 / 隐藏列存 `localStorage`。 |
| `app/App.tsx` | 左栏表列表（fixture）+ 主区工作簿 + 底部状态栏（行数 / 指纹）；无 Host 调用。 |
| `tests/` | Vitest：projection 往返、interceptors；Playwright：中文输入、Excel 风格粘贴（剪贴板文本 TSV）、拖拽填充、撤销重做、筛选排序、查找替换；基准脚本记录首屏与滚动耗时。 |

**步骤**：① 脚手架 + 依赖扫描 CI 脚本；② fixture；③ projection + 单测「buildWorkbook → extractTokens === fixture tokens」；④ interceptors + 单测；⑤ App 壳与视图状态；⑥ E2E 与 10k×50 基准（记录到 `editor/docs/poc-benchmark.md`：机器、Univer 版本、首屏 / 滚动 / 10 万格粘贴耗时）；⑦ 无法满足项如实记录，不用样式伪装语义。

**接口**：
- Consumes：无（静态 fixture）。
- Produces：`projection.buildWorkbook`、`extract.extractTokens`、`interceptors.installInterceptors(univer, map)`、`viewState.load/save`、`api/types.ts`（与 §3.3 对齐的 `TableResponse` / `CellToken` / `ProjectionMap`）。M6-B 在此之上接 Host。

**验收**：
- [ ] `buildWorkbook → extractTokens` 对三份 fixture 与 10k×50 全部逐格相等（空 diff）。
- [ ] 公式 / 合并 / 插删列 / 改 id 四类操作被拒且有提示；粘贴含 `=SUM(...)` 只落值。
- [ ] Playwright 覆盖中文输入、TSV 粘贴、拖拽填充、撤销重做、筛选、排序、查找替换。
- [ ] `poc-benchmark.md` 有 10k×50 首屏、滚动、10 万格粘贴实测；lockfile 无 `@univerjs-pro`。

**不做**：不写 Host、不接 HTTP、不做保存 / 提交、不提交 `editor_static/`。

### 4.3 M6-A（R-00360）Host 会话、安全、设置、VcsAdapter（status / revision）

**目标**：`serve` 子命令跑起来，提供 §3.1 鉴权与 §3.3 的 `GET /api/session`、`GET /api/tables/{t}`、`GET /api/events`、`DELETE /api/session`；设置合并；VCS 探测、脏工作树检查、修订读取；修订监视（轮询复核指纹 → SSE）。**本卡不提供草稿、补丁、导出端点。**

**上下文加载**：`validate.load_sources` / `effective_value`；`fingerprint.source_fingerprint`；`cli.build_parser` 的子命令写法；`tests/test_toolchain.py` 的 CLI 测试写法；0-8 §6 §7 §9。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `editor/settings.py` | `load_settings(root) -> Settings`：默认值 → `.lumio/editor.json` → `.lumio/local.json` 深合并；`vcs` 缺省按 `.git` / `.svn` 探测；非法值报错并指出键名。 |
| `editor/vcs.py` | `VcsAdapter` 协议：`status(paths) -> list[str]`、`revision() -> Revision | None`、`commit(paths, message) -> str | None`（本卡 `commit` 只定义签名并 `NotImplementedError`，M6-C 实现）；`GitAdapter` / `SvnAdapter` / `NoneAdapter`；命令白名单常量，`subprocess.run(..., cwd=root, check=False, capture_output=True, text=True)`，绝不接受调用方拼的命令串。 |
| `editor/session.py` | `Session`：启动时 `load_sources`，拒绝有解析错误的仓（错误 `source_parse_failed` 列出文件）；`table_projection(name) -> dict`（§3.3 形状，`effective` 用 `effective_value`）；`fingerprints()`；`check_revision()` 每 2 秒重算各表底稿指纹与 schema 指纹，变化则推 `repo_revision_changed` / `schema_changed`；SSE 订阅者队列。 |
| `editor/server.py` | `ThreadingHTTPServer` + `BaseHTTPRequestHandler`；token / Host / Origin 校验；路由表 `register(method, path_pattern, handler)`；静态文件（目录不存在时 `/` 返回一页纯文本「前端未构建」，不阻塞 API）；CSP 头；`DELETE /api/session` 后 `shutdown`。 |
| `cli.py` | `serve` 子命令（`--port` `--no-open` `--root`）；打开前先 `settings.openPolicy` + `vcs.status(["tables","registry","schemas"])` 判脏，脏且不允许 → 退出码 3 并打印 `WORKING_TREE_DIRTY` 与文件列表。 |
| `.gitignore` | 加 `.lumio/drafts/`、`.lumio/local.json`。 |
| `.lumio/editor.json` | 提交一份仓级默认（`vcs` 留空表示探测）。 |
| `tests/test_editor_server.py`（新） | 用 `threading` 起服务于随机端口，`urllib` 请求。 |

**步骤**：① 失败测试：无 token 401、错 Origin 403、非 loopback 绑定不存在（断言 `server_address[0] == "127.0.0.1"`）、`/api/session` 字段、`/api/tables/skills` 四态 `raw` 与 `effective`、脏工作树拒开、`vcs=none` 不检查、SSE 收到 `repo_revision_changed`（测试里改一格 `tables/skills.txt` 触发）；② settings；③ vcs；④ session；⑤ server；⑥ cli；⑦ 文档 `docs/reference/cli.md` 补 `serve`。

**接口**：
- Consumes：`validate.load_sources`、`validate.effective_value(cell, column) -> (bool, Any)`、`fingerprint.source_fingerprint`。
- Produces：`editor.settings.load_settings(root) -> Settings`；`editor.vcs.make_adapter(root, settings) -> VcsAdapter`；`editor.session.Session(root, settings)` 及 `table_projection(name)`、`fingerprints()`、`subscribe() -> Queue`；`editor.server.serve(root, port, open_browser) -> None`；`editor.server.register(method, path_pattern, handler)` 供 M6-B/C/E 挂新端点。

**验收**：
- [ ] 非 loopback / 无 token / 错误 Origin 一律拒绝；`DELETE /api/session` 后 token 失效。
- [ ] `/api/tables/{t}` 四态 `raw` 与源 token 逐格一致，`effective` 与 `export` 结果一致。
- [ ] 脏工作树按设置拒开或放行（放行时 `capabilities.commit=false`）；`git` / `svn` / `none` 三种探测各有测试（svn 用假 `.svn` 目录 + 假命令桩）。
- [ ] 改动源文件 2 秒内收到 `repo_revision_changed`，事件在指纹复核后才发。

**不做**：不写草稿 / 补丁 / 导出端点；不实现 `commit`；不改前端。

### 4.4 M6-B（R-00361）编辑与草稿

**目标**：前端接上真实 Host；四态操作、类型编辑器、新行 `draftRowKey`；草稿自动保存与恢复；多标签 `draftVersion` 冲突；视图状态与数据分离。**本卡不做提交。**

**上下文加载**：R-00330 的 `projection.ts` / `interceptors.ts` / `extract.ts`；M6-A 的 `server.register` 与 `Session`；0-8 §2 §8；0-7 §5。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `editor/drafts.py` | `DraftStore(root)`：`load(table)`、`save(table, draft, expected_version) -> int`（版本不等 → `DraftVersionConflict`）、`delete(table)`；写临时文件后 `os.replace` 原子落盘。 |
| `editor/server.py` | 挂 `GET/PUT/DELETE /api/drafts/{t}`、`PUT /api/settings/local`；PUT 草稿成功后推 `draft_saved`。 |
| `editor/src/api/client.ts` | token、错误码到异常的映射、SSE 订阅。 |
| `editor/src/api/draftSession.ts` | `DraftSessionProvider` 接口 + `LocalDraftSessionProvider`（HTTP + SSE）。 |
| `editor/src/app/state.ts` | 0-8 §8 状态机 reducer；按钮可用性只看状态。 |
| `spreadsheet/fourState.ts` | 右键菜单四项 + `Delete` 键语义（0-7 §5），写 Cell 元数据而不是文本。 |
| `spreadsheet/editors.ts` | `enum` → 下拉（Schema `enum` 列表）；`ref` → 搜索选择器（从 `/api/tables/<refTarget>` 取 `name`，显示名保存名）；`i32`/`u32`/`fixed` → 数值校验提示（`minimum` / `maximum`），非法值标红但允许暂存；`bool` → 勾选。 |
| `spreadsheet/projection.ts` | 打开表时若有草稿且 `baseFingerprint` 等于当前指纹 → 套用草稿；不等 → 标 `Stale`，交 M6-D 处理（本卡只提示「仓库已变化，草稿保留」）。 |
| `app/App.tsx` + `panels/` | 左栏表列表（脏格数）、状态栏（指纹、脏格数、草稿版本、服务在线）、设置面板（只写 `local.json`）。 |
| `tests/` | Vitest：状态机、fourState、草稿套用；Playwright：编辑 → 刷新 → 草稿恢复；两个标签页互斥保存。 |

**步骤**：① Python 侧失败测试（DraftStore 版本冲突、原子写）→ 实现；② 端点；③ 前端 client + provider + 状态机（单测先行）；④ 四态与编辑器；⑤ 草稿自动保存（2 秒防抖）与恢复；⑥ E2E。

**接口**：
- Consumes：`editor.server.register`、`Session.table_projection`、`projection.buildWorkbook`、`extract.extractTokens`、`interceptors.installInterceptors`。
- Produces：`editor.drafts.DraftStore`；端点 `/api/drafts/{t}`、`PUT /api/settings/local`；前端 `DraftSessionProvider` 接口（`load(table)`, `saveDraft(table, draft, expectedVersion)`, `submit(patch)`——本卡 `submit` 抛「未实现」, `subscribe(handler)`）；`state.ts` 的 `EditorState` / `EditorAction`。

**验收**：
- [ ] 四态在打开、编辑、复制、粘贴、填充、删除、撤销、重做、草稿恢复九个动作下 token 无损（Playwright 逐项断言 `extractTokens`）。
- [ ] 浏览器刷新 / Host 重启后草稿恢复，`draftVersion` 递增；第二标签页保存报 `DRAFT_VERSION_CONFLICT`。
- [ ] 只做视图操作（排序 / 筛选 / 冻结 / 列宽 / 隐藏列 / 缩放）后 `extractTokens` 与基线完全相等。
- [ ] 新行 `id` 显示「合入时发号」且不可编辑；复制行得到新 `draftRowKey`。

**不做**：不生成补丁、不调 `patch/*`、不做冲突面板。

### 4.5 M6-C（R-00362）语义提取、补丁提交、自动 commit / 导表

**目标**：「预检」「预览补丁」「提交补丁」三个正式动作跑通：前端从工作簿提取语义 diff → 带 `base` / `expect` 的补丁 → Host `validate` / `apply` → 按设置 commit（git / svn / none）与导表 → 前端重载并把 `draftRowKey` 换成正式 id。

**上下文加载**：R-00322 的 `merge_patch` / `apply_patch` / `summarize_ops`；M6-A 的 `VcsAdapter`；`export.export_repository`；0-8 §3 §5 §6。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `spreadsheet/extract.ts` | 新增 `buildPatch(map, tokens): Patch`：逐 rowKey 比 `baseCells` 与当前 token；已有行有差异 → `update`（`set` 用 token 转成补丁值：`""`→`""`、`null`→`null`、`@default`→`"@default"`、`@missing`→省略该键；`expect` = 基线 token）；`name` 变化 → `rename`；`deleted` 内的已有行 → `delete`（`expect.id`）；`draft:` 行 → `create`（全部非缺列格）；新增后又删除的 `draft:` 行折叠为无操作；`ref` 列保存目标行 `name`。 |
| `editor/submit.py` | `submit(session, patch, settings, vcs) -> SubmitResult`：`apply_patch` → 失败直接返回；成功后 `autoCommit` 且 `capabilities.commit` → `vcs.commit(paths, message)`，`paths` 只含 `tables/<t>.txt`、`registry/row-ids.json`、`registry/tombstones.json`；`autoExport` → `export_repository(root, outDir)`；每步失败映射 `VCS_COMMIT_FAILED` / `EXPORT_FAILED` 但不回滚已合入文件；推 `submit_started` / `submit_succeeded` / `submit_failed`。 |
| `editor/vcs.py` | 实现 `GitAdapter.commit`（`git add -- <paths>` → `git commit -m <首行> -m <正文>`）、`SvnAdapter.commit`（对 `svn status` 显示 `?` 的路径先 `svn add`，再 `svn commit -m`），`NoneAdapter.commit` 返回 `None`。 |
| `editor/server.py` | 挂 `POST /api/patch/validate`、`POST /api/patch/apply`。 |
| `panels/DiffPreview.tsx` | 展示 ops 表（表 / 行 name(id) / 列 / 基线 → 草稿）+ Host 返回的人话摘要 + 「将提交到：<branch>/<revision>，autoCommit=<bool>」。 |
| `app/state.ts` | `Validating` / `ReadyToSubmit` / `Submitting` 流转；成功后重载表、清草稿、替换 `draftRowKey`。 |
| `tests/` | Python：submit 编排（git 用临时仓真跑；svn 用命令桩）；前端：`buildPatch` 单测覆盖 0-8 §3 四种 op 与折叠规则；E2E：改一格 → 提交 → `git log -1` 含摘要，`tables/` 已更新，`registry` 发号。 |

**步骤**：① `buildPatch` 失败单测 → 实现；② `submit.py` 失败测试 → 实现（先 `none` 再 `git` 再 `svn`）；③ 端点；④ DiffPreview 与状态流转；⑤ E2E；⑥ `docs/reference/cli.md` 与 `editor.md` 草稿补「提交」段。

**接口**：
- Consumes：`patch.apply_patch -> ApplyResult`、`patch.validate_patch`、`summary.summarize_ops`、`export.export_repository(root, output) -> dict`、`editor.vcs.VcsAdapter`、`DraftStore.delete`。
- Produces：`extract.buildPatch(map, tokens) -> Patch`；`editor.submit.submit(...) -> SubmitResult(ok, summary, errors, source_fingerprint, assigned_ids, vcs, export)`；端点 `/api/patch/validate` `/api/patch/apply`；`VcsAdapter.commit` 三实现。

**验收**：
- [ ] 无修改打开直接提交 → 补丁 `ops` 为空，Host 返回 `ok` 且文件、指纹、版本库均不变。
- [ ] 改一格 / 新增行 / 改名 / 删行四种各一次提交，`tables/` 与 `registry/` 结果与手写补丁 `patch apply` 逐字节一致；新行拿到 M3 编号并在界面替换。
- [ ] `autoCommit=true` 时 `git log -1` 首行为 `config(<table>): <摘要>`，只包含三个白名单路径；`autoCommit=false` 时工作树脏、状态栏提示；`vcs=svn` 用桩验证命令序列；`allowDirtyWorkingTree=true` 时不 commit。
- [ ] `autoExport=true` 时 `build/export` 更新；导表失败返回 `EXPORT_FAILED` 但 TXT 已合入。

**不做**：不处理冲突（Host 返回 `STALE_BASELINE` 时本卡只把错误列到 ErrorPanel）；不做 push / PR。

### 4.6 M6-D（R-00363）三方合并冲突面板与修订监视

**目标**：编辑期间仓库变化（AI 合入）时，编辑器进入 `Stale` 并把仓库改动合进当前草稿；提交遇 `STALE_BASELINE` / `DELETED_ROW_CONFLICT` / `SCHEMA_CHANGED` 时冲突面板结构化呈现并引导解决；解决后重跑完整 validate + apply。

**上下文加载**：R-00322 的 `merge_cell` 与冲突错误对象；M6-A 的 SSE；M6-C 的 `buildPatch` 与提交流转；0-8 §4 §8。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `editor/session.py` | `rebase_draft(table, draft) -> RebaseResult`：对草稿逐格调 `patch.merge_cell`（**不复制判定逻辑**），返回「可自动合并的新基线草稿」+「冲突格」；把 `baseFingerprint` 推进到当前。 |
| `editor/server.py` | 挂 `POST /api/drafts/{t}/rebase`。 |
| `spreadsheet/projection.ts` | `applyRebase(result)`：更新 `baseCells` / `baseFingerprint`，非冲突格套新值，冲突格标记。 |
| `panels/ConflictPanel.tsx` | 每条冲突显示「表 / 行 name (id) / 列 / 打开时 / 仓库当前 / 你的草稿」；动作：采仓库值、采我的值、手工输入、恢复默认、设为 null、取消本次提交；全部解决前禁用提交。 |
| `app/state.ts` | `Stale` / `Conflicted` 流转；`repo_revision_changed` 到达 → 自动调 rebase（无冲突则静默更新并提示「已合入仓库 N 处改动」）。 |
| `tests/` | Python：rebase 六种组合 + 改名行；E2E：编辑器开着 → 用 CLI `patch apply` 改另一格 → 自动合并；改同一格 → 冲突面板 → 采我的值 → 提交成功且仓库其他改动保留。 |

**步骤**：① `rebase_draft` 失败测试 → 实现；② 端点；③ 前端 applyRebase 与状态；④ ConflictPanel；⑤ E2E 三条（不同格 / 同格 / AI 删行）。

**接口**：
- Consumes：`patch.merge_cell(base, current, draft) -> MergeDecision`；`Session.subscribe`；`extract.buildPatch`。
- Produces：`Session.rebase_draft`；端点 `/api/drafts/{t}/rebase`；`projection.applyRebase`；`ConflictPanel`。

**验收**：
- [ ] AI 改不同表 / 同表不同格 → 自动合并，草稿不丢，用户提交不覆盖 AI 改动。
- [ ] AI 改同格 → 冲突面板显示三值，任一动作后重跑完整提交；没有「强制覆盖」。
- [ ] AI 删除用户正在改的行 → `DELETED_ROW_CONFLICT`，可选「放弃我的改动」或「取消提交」。
- [ ] AI 改名 → 稳定 id 仍定位该行；AI 改 Schema → `SCHEMA_CHANGED`，只允许刷新重放。

**不做**：不做自动解决策略；不做行序补丁。

### 4.7 M6-E（R-00364）导出、内嵌产物、CI、E2E 矩阵、文档

**目标**：CSV / TSV 单向导出；前端构建产物内嵌进 Python 包并随源提交；CI 校验产物可复现与依赖合规；Playwright 全矩阵；用户文档。

**上下文加载**：0-7 §2 §6；`.github/workflows/repository-policy.yml`；`export.export_repository`。

**模块清单**：

| 文件 | 做什么 |
| --- | --- |
| `editor/export_csv.py` | `export_tables(root, tables, fmt, source, targets, out_dir) -> list[Path]`：`csv` 模块，`source=draft` 时套用草稿；公式注入前缀 `'`；`README.txt`（0-7 §6）。 |
| `editor/server.py` | 挂 `POST /api/export`、`GET /api/exports/{id}/{file}`；`exportId` 随机、目录固定在 `settings.export.outDir/editor/`。 |
| `panels/` | 导出按钮（格式、来源、目标）。 |
| `src/lumio_config/editor_static/` | `pnpm build` 产物首次提交；`vite.config.ts` 的 `build.outDir` 指向它，`emptyOutDir: true`。 |
| `.github/workflows/repository-policy.yml` | 新 job：`pnpm install --frozen-lockfile`、`node editor/scripts/check-deps.mjs`、`pnpm lint`、`pnpm test`、`pnpm build`、`git diff --exit-code -- src/lumio_config/editor_static`；Playwright job 起 `serve` 后跑 `pnpm e2e`。 |
| `docs/reference/editor.md` | 启动、界面、四态、草稿、提交、设置项、冲突处理、导出、常见错误码。 |
| `docs/operations/validation-evidence.md` | 补编辑器证据项。 |
| `editor/tests/e2e/` | 验收矩阵（§5）全量。 |

**步骤**：① 导出失败测试 → 实现；② 端点与按钮；③ 构建产物与 CI；④ E2E 矩阵补齐；⑤ 文档。

**接口**：
- Consumes：`DraftStore.load`、`Session.table_projection`、`export.export_repository`（`autoExport` 已由 M6-C 接）。
- Produces：`editor.export_csv.export_tables`；端点 `/api/export`、`/api/exports/{id}/{file}`；CI job；`editor_static/`。

**验收**：
- [ ] Excel 与 LibreOffice 打开 CSV 正常；`=1+1` 字段以 `'=1+1` 落盘；README.txt 含非权威声明、修订、指纹。
- [ ] `serve` 在无 Node 的环境能提供页面（只依赖 `editor_static/`）；CI 重建产物 `git diff` 为空。
- [ ] lockfile 出现 `@univerjs-pro` 时 CI 失败（用临时改动验证后还原）。
- [ ] §5 验收矩阵全部 E2E 通过并把报告落 `editor/docs/e2e-report.md`。

**不做**：XLSX、技能卡、领域插件、多人协作。

---

## 5. 验收矩阵（M6-E 收口时全量跑；前面各卡跑与自己相关的行）

| 类别 | 用例 |
| --- | --- |
| 往返 | 打开不改直接提交 → 空 ops；打开 → 存草稿 → 刷新 → 提交 → 空 ops |
| 四态 | `""` / `null` / `@default` / `@missing` / 普通值 × 打开 / 编辑 / 复制 / 粘贴 / 填充 / 删除 / 撤销 / 重做 / 草稿恢复 / 提交 |
| 视图 | 排序 / 筛选 / 冻结 / 列宽 / 隐藏列 / 缩放 / 主题 → 空 ops |
| 并行修改 | AI 改不同表；同表不同格；同格；删用户正在改的行；改名；改 Schema；AI 新增行不被用户提交覆盖 |
| 行身份 | 新行先 `draftRowKey` 后正式 id；改名不换 id；复制行不复制 id；删正式行登记墓碑；删草稿行不登记；排序后身份不变 |
| 表格操作 | 中文输入法；从 Excel / 飞书粘贴（TSV）；多行多列填充；10 万格粘贴；撤销重做；查找替换；枚举下拉；跨表引用；非法类型定位；公式粘贴只取值 |
| 草稿 | 浏览器崩溃；Host 重启；多标签；基线已变；Schema 指纹过期 |
| 提交 | autoCommit git / svn(桩) / none；autoCommit=false；autoExport；脏工作树拒开 / 放行不 commit |
| 导出 | CSV / TSV 可打开；公式注入防护；README 完整；无导入入口 |
| 安全 | 非 loopback、无 token、错误 Origin、路径穿越、会话关闭后一律拒绝；前端无版本库命令 |

---

## 6. 不做（全部卡共同）

登录、多人实时协同、WebSocket / OT / CRDT、公网、生产签名或激活、Excel / XLSX 导入导出、表内公式或脚本、合并单元格、Schema 编辑模式、行序补丁、桌面壳、push / PR 自动化、`@univerjs-pro/*`、pyproject 第三方依赖、技能卡视图（推迟到 M6-E 后另立卡）。

---

## 7. 交回格式（每卡一份）

改动清单（文件级）；分支名与提交号（已推 origin）；下列命令的实际输出：

```text
/usr/local/bin/python3.11 -m unittest discover -s tests -v
python3.11 tools/lumio_config.py validate
python3.11 tools/lumio_config.py format --check
python3.11 tools/lumio_config.py export --out build/export
node .spec/tools/spec-lint.mjs
git diff --check
（前端卡另加）pnpm lint && pnpm test && pnpm build
（有 E2E 的卡另加）pnpm e2e 报告摘要 + 截图
```

对照卡面验收项逐条说明覆盖情况；known gaps（不得含 P0 / P1）；知识沉淀落点（`.spec/knowledge/` 或「无需沉淀」声明）；`.spec/tasks/` 在途卡已删除。

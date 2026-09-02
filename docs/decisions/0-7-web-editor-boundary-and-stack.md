# 0-7 网页编辑器权威边界与技术选型

> **并行期声明。** 本决议暂落本仓、不占架构仓 ADR 号。原因是并行期避免与 RM-00011 抢号：架构仓 `.spec/decisions/` 由 RM-00011 编排会话唯一写入，ADR 编号在合并时现查当时最高号再占。后人不得把本文件的存在理解成架构仓流程遗漏。

对应设计概要 §4「M6 网页编辑器」与架构仓落地方案 `.spec/plans/2026-09-02-config-web-editor-landing.md`；裁决依据为裁决流水板 A.1b / A.2c / E.4，以及 Owner 2026-09-02 对调研稿《LumioConfig 网页在线表格编辑器最终技术方案 v1.0》的四项裁决（Python Host、Univer OSS、提交为设置项、分卡）。调研稿只作背景，与本决议冲突以本决议为准。

## 决定

### 1. 所有权与单向关系

| 数据 / 状态 | 唯一所有者 |
| --- | --- |
| TXT 语法、Schema、墓碑、四态、默认值、指纹、补丁合法性 | `src/lumio_config/` Python Canonical Core（M1–M4 既有代码） |
| 工作簿交互、选区、Undo / Redo | Univer（浏览器内存） |
| 会话、打开基线指纹、草稿、冲突状态、版本库动作 | Python Editor Host（`src/lumio_config/editor/`） |
| 列宽、冻结、筛选、视图排序、隐藏列、缩放 | 浏览器 `localStorage`，永不进补丁 |
| 新行终身编号 | M3 发号台 |
| CSV / TSV 导出文件 | 导出服务；非权威生成物 |

链路只有一个方向：

```text
TXT + Schema + 墓碑 → Canonical（Python）→ 投影 JSON → Univer 工作簿 → 语义提取 → 带基线的逐格补丁 → M2 → TXT
```

禁止：Univer `IWorkbookData` 回写 TXT；浏览器解析或写 `tables/` `registry/` `schemas/`；前端自判 M2 合法性；导出物导回。

### 2. 技术选型

- **表格内核 Univer OSS**：`@univerjs/preset-sheets-core` 起步，按需加 `preset-sheets-filter` / `preset-sheets-sort` / `preset-sheets-data-validation` / `preset-sheets-find-replace`；版本锁 `0.25.x`（lockfile 精确锁，升大版本前跑投影 / 四态 / 拦截 / E2E 回归）；**禁止任何 `@univerjs-pro/*` 依赖**，CI 以 lockfile 扫描拒绝。许可证 Apache-2.0，`editor/THIRD_PARTY_NOTICES.md` 记录锁定版本的 LICENSE / NOTICE。
- **前端** React + TypeScript（strict）+ Vite，单元测试 Vitest，E2E Playwright；源码在 `editor/`，包管理 pnpm；`editor/` 是本仓唯一允许 Node 工具链的目录。
- **Host** Python 3.11 标准库（`http.server.ThreadingHTTPServer` + `json` + `subprocess`），`pyproject.toml` 仍只允许标准库；入口 `python tools/lumio_config.py serve`。
- **构建产物** `pnpm build` 输出到 `src/lumio_config/editor_static/`，**随源提交**；CI 以 `pnpm install --frozen-lockfile && pnpm build && git diff --exit-code -- src/lumio_config/editor_static` 校验可复现。`serve` 只读该目录，用户机器不需要 Node。
- **不做桌面壳**（Tauri 等）；出现「必须独立窗口 / 安装器」需求时另立卡，且只能包装同一前端与 Host。

### 3. 稳定身份

- Host 每次投影生成 `ProjectionMap`：`sheetId → table`、`rowIndex → stableRowId | draftRowKey`、`colIndex → columnName`；前端只在内存持有该映射，随插行 / 删行同步维护，**保存时按映射提取，不按 A1 坐标**。Univer 行号与 `cell.custom` 不是身份。
- 已有行身份 = 源表 `id` 列（终身编号）+ `name`；表面显示只读 `id` 列。
- 新行身份 = `draftRowKey`，格式 `draft:` + 8 位小写十六进制随机串；`id` 单元格显示「合入时发号」，不可编辑；提交后由 M3 发号，编辑器重载正式 `id`。
- 复制已有行 → 新行取新 `draftRowKey`，不复制 `id`；改名不换 `id`；删除已有行 → `delete` 操作 → 合入后登记墓碑；删除未提交新行 → 只删草稿，不产生操作。
- 排序、筛选后身份不变；`orderingPolicy` 一律视为视图排序，本仓 Schema 当前无语义行序，不产生行序补丁。

### 4. 功能三分

| 类别 | 内容 | 落点 |
| --- | --- | --- |
| 权威数据编辑（必须支持） | 单格 / 区域编辑、中文输入法、键盘导航、多选、复制 / 剪切 / 粘贴（含从 Excel / 飞书 / CSV 粘贴）、拖拽填充、撤销 / 重做、插入 / 删除 / 复制行、查找 / 替换、Schema 类型校验提示、枚举下拉、引用选择、四态切换、错误定位、补丁预览、冲突解决、草稿 / 预检 / 提交 / 导出 | 进补丁 |
| 只属于视图（允许） | 列宽、行高、冻结、缩放、筛选、视图排序、隐藏列、主题、选区 | `localStorage`，键 `lumio-config-editor:view:<repoName>:<table>` |
| 禁止 | 公式持久化、合并单元格、宏 / 脚本、图表、透视表、外部链接、插 / 删 Schema 列、把颜色当数据、把筛选隐藏行当删除、把排序后物理行序写回 | 命令拦截器拒绝 |

### 5. 四态与 Delete 键

| 四态 | 源写法 | 工作簿表现 | 用户操作 |
| --- | --- | --- | --- |
| 缺列 | `@missing` | 空格 + 灰色斜体 `missing` 徽标 | 右键「设为缺列」（仅非 required 列） |
| 空字符串 | `""` | `""` 徽标 | 右键「设为空字符串」 |
| 明确空值 | `null` | `∅` 徽标 | 右键「设为 null」 |
| 吃默认 | `@default` | 灰色幽灵默认值 + `默认` 徽标 | 右键「恢复默认」 |

`Delete` / `Backspace` 清格：列有 `default` → `@default`；无默认且非 required → `null`；required 且无默认 → 保持原值并提示；字符串列不自动猜 `""`。四态与普通值互不坍缩，进补丁时按 Cell 的 `state` 写源 token。

### 6. 导出单向

- 首版只做 CSV / TSV（标准库 `csv`）；一表一文件，含 `id`、`name` 与全部 Schema 列；可选按 S / C / V 目标过滤列。
- 以 `= + - @ \t \r` 开头的字符串字段前加单引号 `'`，防公式注入。
- 同目录附 `README.txt`：仓名、版本库修订、各表底稿指纹、导出时间、来源（`repo` / `draft`）、醒目声明 `GENERATED / NOT AUTHORITATIVE — do not import back`。
- XLSX 推迟；触发条件 = 出现真实 Excel 交换需求，且届时只做「受控导入器」另立卡，仍经 M2。

### 7. 多人协作扩展点

前端只依赖 `editor/src/api/draftSession.ts` 的 `DraftSessionProvider` 接口（`load / saveDraft / submit / subscribe`），首版唯一实现 `LocalDraftSessionProvider`（走 Host HTTP + SSE）。UI 不得直接依赖 WebSocket / OT / CRDT / Univer Server。多人实时协作不进本批，触发条件 = 出现两人以上同时改同表的真实需求，届时先复核 Univer Pro 成本再决定自研。

## 明确不做

- 不做 Excel / XLSX 导入，不做 XLSX 导出（推迟，见 §6）。
- 不做技能卡视图（推迟到 M6-E 之后另立卡；届时必须与表格共享同一草稿模型）。
- 不做领域插件 API（触发条件 = 第二个领域视图出现）。
- 不做登录、公网、多人协作、桌面壳。
- 不在本决议占用架构仓 ADR 号。

## 将来搬入架构仓

- 对应 ADR 候选主题：**配表编辑器权威边界与选型**（架构仓落地方案 §1–§2）。
- 编号不在此预占。搬入时由 Owner 在架构仓按当时最高 ADR 现查现占；本文不得写成 `ADR-NNN`。

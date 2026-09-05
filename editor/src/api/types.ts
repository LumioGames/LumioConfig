/** Host JSON shapes from design prompt §3.3. Field names are byte-stable. */

export type CellState = "value" | "empty" | "null" | "default" | "missing";

export interface CellToken {
  state: CellState;
  raw: string;
  effective: unknown;
}

export interface TableColumn {
  name: string;
  type: string;
  required?: boolean;
  visibility?: string;
  readOnly?: boolean;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enumValues?: string[];
  refTarget?: string;
}

export interface TableRow {
  id: number | string;
  name: string;
  cells: Record<string, CellToken>;
}

export interface TableResponse {
  table: string;
  sourceFingerprint: string;
  columns: TableColumn[];
  rows: TableRow[];
}

export interface RebaseConflict {
  table: string;
  row: string;
  column: string;
  code: string;
  message: string;
  suggestion: string;
  base?: string;
  current?: string;
  draft?: string;
  rowId?: string;
}

export interface RebaseResponse {
  ok: boolean;
  draft: Draft;
  conflicts: RebaseConflict[];
  baseFingerprint: string;
  merged: number;
  code?: string | null;
  draftVersion: number;
}

export interface ProjectionMap {
  table: string;
  baseFingerprint: string;
  columns: string[];
  rowKeys: string[];
  baseCells: Record<string, Record<string, CellToken>>;
  currentCells: Record<string, Record<string, CellToken>>;
  deleted: Set<string>;
  conflicts?: RebaseConflict[];
}

export interface SessionRevision {
  vcs: string;
  id: string;
  branch: string;
  dirty: boolean;
}

export interface SessionTableSummary {
  name: string;
  schemaPath: string;
  rowCount: number;
  sourceFingerprint: string;
  schemaFingerprint: string;
  /** M7-D:仓库相对源文件路径,Host 下发 `tables/<name>.txt`(POSIX 分隔符,不含绝对路径)。 */
  sourcePath: string;
}

export interface SessionSettings {
  vcs: string;
  submit: { autoCommit: boolean; autoExport: boolean };
  export: { outDir: string };
  openPolicy: { allowDirtyWorkingTree: boolean };
}

export interface SessionCapabilities {
  submit: boolean;
  commit: boolean;
  export: string[];
  events: boolean;
  /** §9:修订历史能力;Host 端 `vcs == "git"` 才为 true,svn / none 为 false(页签不渲染)。 */
  history: boolean;
  /** M7-G:在资源管理器中显示(reveal)。未实现——Host 恒下发 false,CLI 也没有对应开关
   *  (QA 2026-09-04 指出的注释漂移:不要照旧注释去找不存在的 `serve --allow-reveal`)。 */
  reveal: boolean;
}

export interface SessionResponse {
  repoName: string;
  revision: SessionRevision;
  tables: SessionTableSummary[];
  schemas: Record<string, unknown>;
  settings: SessionSettings;
  capabilities: SessionCapabilities;
}

/**
 * M7-E:`GET /api/tables/{table}/source?kind=table|schema` 的响应,只读源文件快照。
 * `path` 为仓库相对路径(`tables/<t>.txt` / `schemas/<t>.json`),`text` 为文件全文,`bytes` 为字节数。
 */
export interface SourceFileResponse {
  table: string;
  kind: "table" | "schema";
  path: string;
  text: string;
  bytes: number;
}

export interface PatchOp {
  op: "update" | "rename" | "delete" | "create";
  name: string;
  set?: Record<string, string | number | boolean | null>;
  expect?: Record<string, string>;
  to?: string;
  draftRowKey?: string;
}

export interface PatchObject {
  table: string;
  base?: { sourceFingerprint: string };
  ops: PatchOp[];
}

export interface PatchValidateResponse {
  ok: boolean;
  summary: string;
  errors: ApiErrorItem[];
}

export interface PatchApplyResponse {
  ok: boolean;
  summary: string;
  errors: ApiErrorItem[];
  result?: {
    sourceFingerprint: string;
    assignedIds: Record<string, number>;
    vcs: { action: string; id: string; branch: string | null } | null;
    export: { outDir: string; files: number } | null;
  };
}

export interface ApiErrorItem {
  table: string;
  row: string;
  column: string;
  code: string;
  message: string;
  suggestion: string;
  base?: unknown;
  current?: unknown;
  draft?: unknown;
  rowId?: string;
}

export interface ApiError {
  code: string;
  message: string;
  errors: ApiErrorItem[];
}

export interface CellDiff {
  rowKey: string;
  column: string;
  expected: CellToken | undefined;
  actual: CellToken | undefined;
}

export interface DraftCell {
  state: CellState;
  raw: string;
  effective?: unknown;
}

export interface Draft {
  table: string;
  baseFingerprint: string;
  draftVersion: number;
  savedAt?: string;
  rows: Record<string, Record<string, DraftCell | string>>;
  renamed?: Record<string, string>;
  deleted?: string[];
}

/** §9 Host 修订级差异:`GET /api/tables/{t}/history?since=&limit=20` 的 items 元素。 */
export interface HistoryEntry {
  revision: string;
  message: string;
  time: string;
  author: string;
  /** row 是行名字符串(运行时),跳格请用同域的 rowId;「我的改动」行号在 MyChange 自有类型。 */
  cells: Array<{ row: string; rowId: string; column: string; from: string; to: string }>;
  created: string[];
  deleted: string[];
  schemaChanged: boolean;
}

export type EditorPhase =
  | "Opening"
  | "ReadyClean"
  | "ReadyDirty"
  | "SavingDraft"
  | "Validating"
  | "ReadyToSubmit"
  | "Submitting"
  | "Conflicted"
  | "Stale"
  | "Failed"
  | "Closed";

/**
 * ADR 0005:Failed 阶段的失败归类,取代对 hint 的子串判断。
 * 空串 = 未归类(产生点接线完成前由 hint 兜底显示)。
 */
export type FailKind = "VCS" | "SCHEMA_CHANGED" | "DRAFT_VERSION_CONFLICT" | "";

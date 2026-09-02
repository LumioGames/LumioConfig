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

export interface ProjectionMap {
  table: string;
  baseFingerprint: string;
  columns: string[];
  rowKeys: string[];
  baseCells: Record<string, Record<string, CellToken>>;
  currentCells: Record<string, Record<string, CellToken>>;
  deleted: Set<string>;
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
}

export interface SessionResponse {
  repoName: string;
  revision: SessionRevision;
  tables: SessionTableSummary[];
  schemas: Record<string, unknown>;
  settings: SessionSettings;
  capabilities: SessionCapabilities;
}

export interface PatchObject {
  table: string;
  base?: { sourceFingerprint: string };
  ops: unknown[];
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
    vcs: { action: string; id: string; branch: string };
    export: { outDir: string; files: number };
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

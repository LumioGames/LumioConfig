import type { EditorPhase, FailKind } from "../api/types";

export interface EditorState {
  phase: EditorPhase;
  table: string;
  fingerprint: string;
  rowCount: number;
  hint: string;
  draftVersion: number;
  dirtyCount: number;
  online: boolean;
  failKind: FailKind;
}

export type EditorAction =
  | { type: "open"; table: string; fingerprint: string; rowCount: number; draftVersion?: number }
  | { type: "hint"; hint: string }
  | { type: "dirty"; dirtyCount: number }
  | { type: "saving" }
  | { type: "saved"; draftVersion: number }
  | { type: "stale"; hint: string }
  | { type: "failed"; hint: string; failKind?: FailKind }
  | { type: "online"; online: boolean }
  | { type: "validate" }
  | { type: "validated"; ok: boolean; hint: string }
  | { type: "submit" }
  | { type: "submitted"; fingerprint: string }
  | { type: "conflicted"; hint: string }
  | { type: "conflictsResolved" }
  | { type: "rebased"; merged: number; draftVersion: number }
  | { type: "schemaChanged" };

export const INITIAL_EDITOR_STATE: EditorState = {
  phase: "Opening",
  table: "skills",
  fingerprint: "",
  rowCount: 0,
  hint: "",
  draftVersion: 0,
  dirtyCount: 0,
  online: false,
  failKind: "",
};

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "open":
      return {
        ...state,
        phase: "ReadyClean",
        table: action.table,
        fingerprint: action.fingerprint,
        rowCount: action.rowCount,
        hint: "",
        dirtyCount: 0,
        draftVersion: action.draftVersion ?? 0,
        failKind: "",
      };
    case "hint":
      return { ...state, hint: action.hint };
    case "dirty":
      if (
        state.phase === "Conflicted" ||
        state.phase === "Stale" ||
        state.phase === "Failed" ||
        state.phase === "Submitting" ||
        state.phase === "Validating"
      ) {
        return { ...state, dirtyCount: action.dirtyCount };
      }
      return {
        ...state,
        dirtyCount: action.dirtyCount,
        phase: action.dirtyCount > 0 ? "ReadyDirty" : "ReadyClean",
      };
    case "saving":
      return { ...state, phase: "SavingDraft", failKind: "" };
    case "saved":
      return {
        ...state,
        phase: state.dirtyCount > 0 ? "ReadyDirty" : "ReadyClean",
        draftVersion: action.draftVersion,
        failKind: "",
      };
    case "stale":
      return { ...state, phase: "Stale", hint: action.hint, failKind: "" };
    case "failed":
      return { ...state, phase: "Failed", hint: action.hint, failKind: action.failKind ?? "" };
    case "online":
      return { ...state, online: action.online };
    case "validate":
      return { ...state, phase: "Validating", failKind: "" };
    case "validated":
      return { ...state, phase: action.ok ? "ReadyToSubmit" : "ReadyDirty", hint: action.hint, failKind: "" };
    case "submit":
      return { ...state, phase: "Submitting", failKind: "" };
    case "submitted":
      return {
        ...state,
        phase: "ReadyClean",
        dirtyCount: 0,
        draftVersion: 0,
        fingerprint: action.fingerprint,
        hint: "已提交",
        failKind: "",
      };
    case "conflicted":
      return { ...state, phase: "Conflicted", hint: action.hint, failKind: "" };
    case "conflictsResolved":
      return { ...state, phase: "ReadyDirty", dirtyCount: Math.max(state.dirtyCount, 1), hint: "", failKind: "" };
    case "rebased":
      return {
        ...state,
        phase: "ReadyDirty",
        dirtyCount: Math.max(state.dirtyCount, 1),
        draftVersion: action.draftVersion,
        hint: `已合入仓库 ${action.merged} 处改动`,
        failKind: "",
      };
    case "schemaChanged":
      return { ...state, phase: "Failed", hint: "SCHEMA_CHANGED，请刷新重放", failKind: "SCHEMA_CHANGED" };
    default:
      return state;
  }
}

/**
 * ADR 0005:Host 错误码到 failKind 的归类。
 * VCS_COMMIT_FAILED / EXPORT_FAILED → VCS;SCHEMA_CHANGED;
 * 409 响应携带的 DRAFT_VERSION_CONFLICT → DRAFT_VERSION_CONFLICT。
 */
export function failKindFromCode(code: string | null | undefined): FailKind {
  switch (code) {
    case "VCS_COMMIT_FAILED":
    case "EXPORT_FAILED":
      return "VCS";
    case "SCHEMA_CHANGED":
      return "SCHEMA_CHANGED";
    case "DRAFT_VERSION_CONFLICT":
      return "DRAFT_VERSION_CONFLICT";
    default:
      return "";
  }
}

export function canEdit(state: EditorState): boolean {
  return (
    state.phase === "ReadyClean" ||
    state.phase === "ReadyDirty" ||
    state.phase === "SavingDraft" ||
    state.phase === "ReadyToSubmit"
  );
}

export function canSave(state: EditorState): boolean {
  return state.phase === "ReadyDirty";
}

/** 按 failKind 分派,不再对 hint 做子串判断(ADR 0005)。 */
export function canRefreshOnly(state: EditorState): boolean {
  return (
    state.phase === "Failed" &&
    (state.failKind === "SCHEMA_CHANGED" || state.failKind === "DRAFT_VERSION_CONFLICT")
  );
}

/** ADR 0005:无改动可预检时置灰,需要 dirtyCount > 0。 */
export function canValidate(state: EditorState): boolean {
  return (
    (state.phase === "ReadyClean" || state.phase === "ReadyDirty" || state.phase === "ReadyToSubmit") &&
    state.dirtyCount > 0
  );
}

export function canSubmit(state: EditorState): boolean {
  return state.phase === "ReadyToSubmit";
}

/** @deprecated POC alias kept so existing e2e imports keep type-checking if any remain. */
export const pocReducer = reducer;
export const INITIAL_POC_STATE = INITIAL_EDITOR_STATE;
export type PocState = EditorState;
export type PocAction = EditorAction;

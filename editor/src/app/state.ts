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
  /** QA P2-8:自动保存的非业务失败(401/5xx 等)——回可编辑态保脏格,不落 Failed。 */
  | { type: "draftSaveFailed"; hint: string }
  /** QA P2-1/P2-8:连接恢复时清理连接类失败残留(SavingDraft 卡死 / 无业务 failKind 的 Failed)。 */
  | { type: "recover" }
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
  | { type: "schemaChanged" }
  /** 仅 __lumioPoc.setPhase(layout.spec 的 14 态注入)使用,生产代码不得派发。 */
  | { type: "debugPhase"; phase: EditorPhase; failKind?: FailKind; online?: boolean; dirtyCount?: number; hint?: string };

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
    case "draftSaveFailed":
      // QA P2-8:草稿没存上不是会话失败——脏格仍在表格里,回到可编辑态等重试;
      // 落 Failed 会错配「提交失败」胶囊并锁格,而唯一逃生门(重开表)会丢未保存脏格。
      return {
        ...state,
        phase: state.dirtyCount > 0 ? "ReadyDirty" : "ReadyClean",
        hint: action.hint,
        failKind: "",
      };
    case "recover":
      // QA P2-1/P2-8:SSE 重连成功后清理连接类残留。带业务 failKind 的 Failed
      // (VCS/SCHEMA_CHANGED/DRAFT_VERSION_CONFLICT)是真实业务终态,不清。
      if (state.phase === "SavingDraft" || (state.phase === "Failed" && state.failKind === "")) {
        return { ...state, phase: state.dirtyCount > 0 ? "ReadyDirty" : "ReadyClean" };
      }
      return state;
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
    case "debugPhase":
      return {
        ...state,
        phase: action.phase,
        failKind: action.failKind ?? (action.phase === "Failed" ? "" : state.failKind),
        ...(action.online === undefined ? {} : { online: action.online }),
        ...(action.dirtyCount === undefined ? {} : { dirtyCount: action.dirtyCount }),
        ...(action.hint === undefined ? {} : { hint: action.hint }),
      };
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

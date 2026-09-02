import type { EditorPhase } from "../api/types";

export interface EditorState {
  phase: EditorPhase;
  table: string;
  fingerprint: string;
  rowCount: number;
  hint: string;
  draftVersion: number;
  dirtyCount: number;
  online: boolean;
}

export type EditorAction =
  | { type: "open"; table: string; fingerprint: string; rowCount: number; draftVersion?: number }
  | { type: "hint"; hint: string }
  | { type: "dirty"; dirtyCount: number }
  | { type: "saving" }
  | { type: "saved"; draftVersion: number }
  | { type: "stale"; hint: string }
  | { type: "failed"; hint: string }
  | { type: "online"; online: boolean };

export const INITIAL_EDITOR_STATE: EditorState = {
  phase: "Opening",
  table: "skills",
  fingerprint: "",
  rowCount: 0,
  hint: "",
  draftVersion: 0,
  dirtyCount: 0,
  online: false,
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
      };
    case "hint":
      return { ...state, hint: action.hint };
    case "dirty":
      return {
        ...state,
        dirtyCount: action.dirtyCount,
        phase: action.dirtyCount > 0 ? "ReadyDirty" : "ReadyClean",
      };
    case "saving":
      return { ...state, phase: "SavingDraft" };
    case "saved":
      return {
        ...state,
        phase: state.dirtyCount > 0 ? "ReadyDirty" : "ReadyClean",
        draftVersion: action.draftVersion,
      };
    case "stale":
      return { ...state, phase: "Stale", hint: action.hint };
    case "failed":
      return { ...state, phase: "Failed", hint: action.hint };
    case "online":
      return { ...state, online: action.online };
    default:
      return state;
  }
}

export function canEdit(state: EditorState): boolean {
  return state.phase === "ReadyClean" || state.phase === "ReadyDirty" || state.phase === "SavingDraft";
}

export function canSave(state: EditorState): boolean {
  return state.phase === "ReadyDirty";
}

export function canRefreshOnly(state: EditorState): boolean {
  return state.phase === "Failed" && state.hint.includes("标签页");
}

export function canSubmit(_state: EditorState): boolean {
  return false;
}

/** @deprecated POC alias kept so existing e2e imports keep type-checking if any remain. */
export const pocReducer = reducer;
export const INITIAL_POC_STATE = INITIAL_EDITOR_STATE;
export type PocState = EditorState;
export type PocAction = EditorAction;

export interface PocState {
  table: string;
  fingerprint: string;
  rowCount: number;
  hint: string;
}

export type PocAction =
  | { type: "open"; table: string; fingerprint: string; rowCount: number }
  | { type: "hint"; hint: string };

export const INITIAL_POC_STATE: PocState = {
  table: "skills",
  fingerprint: "",
  rowCount: 0,
  hint: "",
};

export function pocReducer(state: PocState, action: PocAction): PocState {
  switch (action.type) {
    case "open":
      return {
        table: action.table,
        fingerprint: action.fingerprint,
        rowCount: action.rowCount,
        hint: "",
      };
    case "hint":
      return { ...state, hint: action.hint };
    default:
      return state;
  }
}

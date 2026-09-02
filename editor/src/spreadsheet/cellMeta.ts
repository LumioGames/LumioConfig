import type { CellState, CellToken } from "../api/types";
import type { WorkbookCell } from "./workbook-types";

export const LUMIO_CUSTOM_KEY = "lumio";
export const DRAFT_ID_LABEL = "合入时发号";
export const BADGE = {
  missing: "missing",
  empty: '""',
  null: "∅",
  default: "默认",
} as const;

export interface LumioCellMeta extends CellToken {
  column: string;
  rowKey: string;
  badge?: string;
  draftId?: boolean;
}

export function readLumioMeta(cell: WorkbookCell | undefined): LumioCellMeta | undefined {
  const custom = cell?.custom?.[LUMIO_CUSTOM_KEY];
  if (!custom || typeof custom !== "object") {
    return undefined;
  }
  const rec = custom as Record<string, unknown>;
  const state = rec.state;
  if (
    state !== "value" &&
    state !== "empty" &&
    state !== "null" &&
    state !== "default" &&
    state !== "missing"
  ) {
    return undefined;
  }
  return {
    state,
    raw: typeof rec.raw === "string" ? rec.raw : "",
    effective: rec.effective,
    column: typeof rec.column === "string" ? rec.column : "",
    rowKey: typeof rec.rowKey === "string" ? rec.rowKey : "",
    badge: typeof rec.badge === "string" ? rec.badge : undefined,
    draftId: rec.draftId === true,
  };
}

export function writeLumioCustom(meta: LumioCellMeta): Record<string, unknown> {
  return {
    [LUMIO_CUSTOM_KEY]: {
      state: meta.state,
      raw: meta.raw,
      effective: meta.effective,
      column: meta.column,
      rowKey: meta.rowKey,
      ...(meta.badge ? { badge: meta.badge } : {}),
      ...(meta.draftId ? { draftId: true } : {}),
    },
  };
}

export function tokenFromMeta(meta: LumioCellMeta): CellToken {
  return { state: meta.state, raw: meta.raw, effective: meta.effective };
}

export function badgeFor(state: CellState): string | undefined {
  if (state === "missing") {
    return BADGE.missing;
  }
  if (state === "empty") {
    return BADGE.empty;
  }
  if (state === "null") {
    return BADGE.null;
  }
  if (state === "default") {
    return BADGE.default;
  }
  return undefined;
}

export function styleIdFor(state: CellState, readOnly: boolean): string {
  if (readOnly) {
    return "idReadOnly";
  }
  if (state === "missing") {
    return "missing";
  }
  if (state === "empty") {
    return "empty";
  }
  if (state === "null") {
    return "nullState";
  }
  if (state === "default") {
    return "default";
  }
  return "value";
}

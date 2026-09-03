import { COPY } from "../app/copy";
import type { CellState, CellToken, TableColumn } from "../api/types";
import { editorKind, enumOptions, numberOutOfRange } from "./editors";
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
  /** 脏格标记(设计稿 §6):渲染层画右上三角,不进 v / token。 */
  dirty?: boolean;
  /** 无效格标记(设计稿 §6):渲染层画 `!`,样式层给红波浪。 */
  invalid?: boolean;
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
    dirty: rec.dirty === true,
    invalid: rec.invalid === true,
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
      ...(meta.dirty ? { dirty: true } : {}),
      ...(meta.invalid ? { invalid: true } : {}),
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

/** styleIdFor 的行级/格级视觉开关(设计稿 §6),优先级:删除行 > 新行 > 脏格 > 四态底色。 */
export interface CellStyleFlags {
  dirty?: boolean;
  newRow?: boolean;
  deletedRow?: boolean;
}

const DIRTY_STYLE: Record<string, string> = {
  value: "dirtyValue",
  missing: "dirtyMissing",
  empty: "dirtyEmpty",
  nullState: "dirtyNull",
  default: "dirtyDefault",
};

export function styleIdFor(state: CellState, readOnly: boolean, flags?: CellStyleFlags): string {
  if (flags?.deletedRow) {
    return "deletedRow";
  }
  if (flags?.newRow) {
    return readOnly ? "newRowId" : "newRow";
  }
  const base = baseStyleId(state, readOnly);
  if (!flags?.dirty) {
    return base;
  }
  if (readOnly) {
    return "dirtyReadOnly";
  }
  return DIRTY_STYLE[base] ?? "dirtyValue";
}

function baseStyleId(state: CellState, readOnly: boolean): string {
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

/**
 * 远端预检错误项(与 api/types.ts 的 ApiErrorItem 结构兼容;Host 侧错误可直接传入,
 * 调用方按行过滤后再交给 invalidReason)。
 */
export interface ValidationError {
  row?: string;
  rowId?: string;
  column: string;
  code: string;
  message: string;
  suggestion?: string;
}

export interface InvalidReason {
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * 无效原因(设计稿 §6「为什么无效」块的数据源):
 * 本地判定 必填缺列 / 类型 / 范围 / 枚举;远端预检错误覆盖本地结论。
 */
export function invalidReason(
  column: TableColumn,
  token: CellToken,
  remoteErrors: ValidationError[] = [],
): InvalidReason | null {
  const remote = remoteErrors.find((error) => error.column === column.name);
  if (remote) {
    return { code: remote.code, message: remote.message, suggestion: remote.suggestion };
  }
  if (column.required === true && token.state === "missing") {
    return {
      code: "REQUIRED_MISSING",
      message: COPY.inspector.invalid.requiredMissing,
      suggestion: COPY.inspector.invalid.requiredMissingSuggestion,
    };
  }
  if (token.state !== "value") {
    return null;
  }
  const kind = editorKind(column);
  if (kind === "number") {
    const value = Number(token.raw);
    if (!Number.isFinite(value)) {
      return {
        code: "TYPE_MISMATCH",
        message: COPY.inspector.invalid.typeMismatch,
        suggestion: COPY.inspector.invalid.typeMismatchSuggestion,
      };
    }
    if (numberOutOfRange(column, token.raw)) {
      return {
        code: "OUT_OF_RANGE",
        message: COPY.inspector.invalid.outOfRange,
        suggestion: COPY.inspector.invalid.outOfRangeSuggestion,
      };
    }
    return null;
  }
  if (kind === "bool" && token.raw !== "true" && token.raw !== "false") {
    return { code: "TYPE_MISMATCH", message: COPY.inspector.invalid.boolMismatch };
  }
  if (kind === "enum") {
    const options = enumOptions(column);
    if (options.length && !options.includes(token.raw)) {
      return {
        code: "ENUM_INVALID",
        message: COPY.inspector.invalid.enumInvalid,
        suggestion: COPY.inspector.invalid.enumInvalidSuggestion,
      };
    }
  }
  return null;
}

/** 检查器(§7)的展示模型:App 接线方从投影层组装,Inspector 只读渲染。 */
export interface CellMeta {
  table: string;
  rowKey: string;
  rowName: string;
  rowStatus: "existing" | "new" | "deleted";
  column: TableColumn;
  current: CellToken;
  baseline?: CellToken;
  remoteErrors?: ValidationError[];
  conflict?: { code: string; message: string } | null;
}

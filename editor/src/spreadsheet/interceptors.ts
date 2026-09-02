import type { ProjectionMap } from "../api/types";
import { DRAFT_ID_LABEL, styleIdFor, writeLumioCustom } from "./cellMeta";

export const HINTS = {
  formula: "公式不可用，配表不持久化公式",
  merge: "禁止合并单元格",
  columns: "禁止插入或删除 Schema 列",
  id: "id 列不可编辑",
  pasteFormula: "粘贴含公式，已仅保留值",
  header: "表头不可编辑",
  insertRow: "新行将在合入时发号",
} as const;

export const COMMAND = {
  setRangeValues: "sheet.command.set-range-values",
  setRangeValuesMutation: "sheet.mutation.set-range-values",
  merge: "sheet.command.add-worksheet-merge",
  mergeAll: "sheet.command.add-worksheet-merge-all",
  mergeVertical: "sheet.command.add-worksheet-merge-vertical",
  mergeHorizontal: "sheet.command.add-worksheet-merge-horizontal",
  insertColBefore: "sheet.command.insert-col-before",
  insertColAfter: "sheet.command.insert-col-after",
  insertColByRange: "sheet.command.insert-col-by-range",
  insertCol: "sheet.command.insert-col",
  removeColConfirm: "sheet.command.remove-col-confirm",
  removeColByRange: "sheet.command.remove-col-by-range",
  confirmRemoveCol: "sheet.confirm.remove-col",
  insertRowBefore: "sheet.command.insert-row-before",
  insertRowAfter: "sheet.command.insert-row-after",
  insertRowByRange: "sheet.command.insert-row-by-range",
  removeRowConfirm: "sheet.command.remove-row-confirm",
  removeRowByRange: "sheet.command.remove-row-by-range",
  confirmRemoveRow: "sheet.confirm.remove-row",
  paste: "univer.command.paste",
  pasteNamed: "sheet.command.paste",
  pasteShortKey: "sheet.command.paste-by-short-key",
  pasteValue: "sheet.command.paste-value",
  pasteOptional: "sheet.command.optional-paste",
  pasteBesidesBorder: "sheet.command.paste-besides-border",
  pasteFormula: "sheet.command.paste-formula",
  insertFunction: "formula-ui.operation.insert-function",
  moreFunctions: "formula-ui.operation.more-functions",
} as const;

const MERGE_IDS = new Set<string>([
  COMMAND.merge,
  COMMAND.mergeAll,
  COMMAND.mergeVertical,
  COMMAND.mergeHorizontal,
]);

const COLUMN_IDS = new Set<string>([
  COMMAND.insertColBefore,
  COMMAND.insertColAfter,
  COMMAND.insertColByRange,
  COMMAND.insertCol,
  COMMAND.removeColConfirm,
  COMMAND.removeColByRange,
  COMMAND.confirmRemoveCol,
]);

const INSERT_ROW_AFTER = new Set<string>([COMMAND.insertRowAfter]);
const INSERT_ROW_IDS = new Set<string>([
  COMMAND.insertRowBefore,
  COMMAND.insertRowAfter,
  COMMAND.insertRowByRange,
]);

const DELETE_ROW_IDS = new Set<string>([
  COMMAND.removeRowConfirm,
  COMMAND.removeRowByRange,
  COMMAND.confirmRemoveRow,
]);

const PASTE_IDS = new Set<string>([
  COMMAND.paste,
  COMMAND.pasteNamed,
  COMMAND.pasteShortKey,
  COMMAND.pasteValue,
  COMMAND.pasteOptional,
  COMMAND.pasteBesidesBorder,
  COMMAND.pasteFormula,
]);

const FORMULA_UI_IDS = new Set<string>([COMMAND.insertFunction, COMMAND.moreFunctions]);

const FORMULA_LIKE = /^=[A-Za-z]/;

export interface CommandInterceptEvent {
  id: string;
  type?: unknown;
  params?: unknown;
  cancel?: boolean;
}

export interface InterceptorHost {
  addEvent?: (
    event: unknown,
    handler: (event: CommandInterceptEvent) => void,
  ) => { dispose(): void };
  Event?: { BeforeCommandExecute?: unknown; CommandExecuted?: unknown };
  onBeforeCommandExecute?: (
    handler: (event: CommandInterceptEvent) => void,
  ) => { dispose(): void };
  onCommandExecuted?: (handler: (event: CommandInterceptEvent) => void) => { dispose(): void };
  univerAPI?: InterceptorHost;
}

export interface InstallInterceptorsOptions {
  onHint?: (hint: string) => void;
  randomBytes?: () => Uint8Array;
  executeCommand?: (id: string, params?: unknown) => unknown;
}

function resolveHost(univer: unknown): InterceptorHost {
  const rec = univer as InterceptorHost;
  if (rec && typeof rec.addEvent === "function") {
    return rec;
  }
  if (rec?.univerAPI) {
    return resolveHost(rec.univerAPI);
  }
  if (rec && typeof rec.onBeforeCommandExecute === "function") {
    return rec;
  }
  throw new Error("installInterceptors: univer host has no command interceptor API");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function looksLikeCell(rec: Record<string, unknown>): boolean {
  return "v" in rec || "f" in rec || "t" in rec || "custom" in rec || "si" in rec;
}

export function visitCells(
  value: unknown,
  visit: (cell: Record<string, unknown>, row?: number, col?: number) => void,
  row?: number,
  col?: number,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitCells(item, visit, row, col ?? index));
    return;
  }
  const rec = asRecord(value);
  if (!rec) {
    return;
  }

  const range = asRecord(rec.range);
  const rangeRow = numberOf(range?.startRow);
  const rangeCol = numberOf(range?.startColumn);
  if (rec.value && typeof rec.value === "object" && !Array.isArray(rec.value)) {
    const cell = rec.value as Record<string, unknown>;
    if (looksLikeCell(cell) && !("cellValue" in cell)) {
      visit(cell, rangeRow ?? row, rangeCol ?? col);
    } else {
      visitCells(rec.value, visit, rangeRow ?? row, rangeCol ?? col);
    }
  }

  if (looksLikeCell(rec) && !("cellValue" in rec) && !("range" in rec) && !("value" in rec)) {
    visit(rec, row, col);
  }
  if (rec.cellValue) {
    visitCells(rec.cellValue, visit);
  }
  for (const [key, child] of Object.entries(rec)) {
    if (key === "custom" || key === "s" || key === "p" || key === "range" || key === "value") {
      continue;
    }
    const asRow = Number(key);
    if (Number.isInteger(asRow) && child && typeof child === "object") {
      const nested = child as Record<string, unknown>;
      const nestedIsRow = Object.keys(nested).some((colKey) => Number.isInteger(Number(colKey)));
      if (nestedIsRow) {
        for (const [colKey, cell] of Object.entries(nested)) {
          visitCells(cell, visit, asRow, Number(colKey));
        }
      }
    }
  }
}

function hasFormulaField(value: unknown): boolean {
  let found = false;
  visitCells(value, (cell) => {
    if (typeof cell.f === "string" && cell.f.length > 0) {
      found = true;
    }
    if (typeof cell.si === "string" && cell.si.length > 0) {
      found = true;
    }
    if (typeof cell.v === "string" && FORMULA_LIKE.test(cell.v)) {
      found = true;
    }
  });
  return found;
}

function stripFormulas(value: unknown): boolean {
  let changed = false;
  visitCells(value, (cell) => {
    if ("f" in cell) {
      delete cell.f;
      changed = true;
    }
    if ("si" in cell) {
      delete cell.si;
      changed = true;
    }
    if (typeof cell.v === "string" && cell.v.startsWith("=")) {
      cell.t = 4;
      changed = true;
    }
  });
  return changed;
}

function idColumnIndex(map: ProjectionMap): number {
  const index = map.columns.indexOf("id");
  return index >= 0 ? index : 0;
}

function isDraftIdWrite(value: unknown): boolean {
  let draft = false;
  visitCells(value, (cell) => {
    const custom = asRecord(cell.custom);
    const lumio = asRecord(custom?.lumio);
    if (lumio?.draftId === true) {
      draft = true;
    }
  });
  return draft;
}

function touchesHeaderOrId(value: unknown, map: ProjectionMap): "header" | "id" | undefined {
  const idCol = idColumnIndex(map);
  let hit: "header" | "id" | undefined;
  visitCells(value, (_cell, row, col) => {
    if (row === 0) {
      hit = "header";
    } else if (col === idCol) {
      hit = hit ?? "id";
    }
  });
  return hit;
}

function rowRange(params: unknown): { startRow: number; count: number } | undefined {
  const rec = asRecord(params);
  if (!rec) {
    return undefined;
  }
  const range = asRecord(rec.range);
  const startRow =
    numberOf(range?.startRow) ?? numberOf(rec.startRow) ?? numberOf(rec.row) ?? numberOf(rec.rowIndex);
  if (startRow === undefined) {
    return undefined;
  }
  const endRow = numberOf(range?.endRow) ?? numberOf(rec.endRow) ?? startRow;
  const count =
    numberOf(rec.rowCount) ??
    numberOf(rec.numRows) ??
    numberOf(rec.count) ??
    numberOf(asRecord(rec.value)?.count) ??
    Math.max(1, endRow - startRow + 1);
  return { startRow, count };
}

export function newDraftRowKey(randomBytes?: () => Uint8Array): string {
  const bytes =
    randomBytes?.() ??
    (typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(4))
      : Uint8Array.from([
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
        ]));
  const hex = Array.from(bytes.subarray(0, 4))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `draft:${hex}`;
}

function dataInsertIndex(sheetRow: number, after: boolean): number {
  const base = Math.max(0, sheetRow - 1);
  return after ? base + 1 : base;
}

function applyInsert(map: ProjectionMap, params: unknown, after: boolean, randomBytes?: () => Uint8Array): string[] {
  const range = rowRange(params) ?? { startRow: 1, count: 1 };
  const index = Math.min(map.rowKeys.length, dataInsertIndex(range.startRow, after));
  const keys: string[] = [];
  for (let i = 0; i < range.count; i += 1) {
    keys.push(newDraftRowKey(randomBytes));
  }
  map.rowKeys.splice(index, 0, ...keys);
  return keys;
}

function applyDelete(map: ProjectionMap, params: unknown): string[] {
  const range = rowRange(params);
  if (!range) {
    return [];
  }
  const start = Math.max(0, range.startRow - 1);
  const removed = map.rowKeys.splice(start, range.count);
  for (const key of removed) {
    map.deleted.add(key);
  }
  return removed;
}

function attachLumioFromEdit(params: unknown, map: ProjectionMap): void {
  visitCells(params, (cell, row, col) => {
    if (row === undefined || col === undefined || row <= 0) {
      return;
    }
    const column = map.columns[col];
    const rowKey = map.rowKeys[row - 1];
    if (!column || !rowKey) {
      return;
    }
    const raw =
      cell.v === undefined || cell.v === null
        ? ""
        : typeof cell.v === "string"
          ? cell.v
          : String(cell.v);
    cell.custom = {
      ...asRecord(cell.custom),
      ...writeLumioCustom({
        state: "value",
        raw,
        effective: cell.v ?? raw,
        column,
        rowKey,
      }),
    };
  });
}

export function draftIdCell(rowKey: string): Record<string, unknown> {
  return {
    v: DRAFT_ID_LABEL,
    t: 1,
    s: "idReadOnly",
    custom: writeLumioCustom({
      state: "value",
      raw: "",
      effective: null,
      column: "id",
      rowKey,
      draftId: true,
    }),
  };
}

function missingCell(rowKey: string, column: string): Record<string, unknown> {
  return {
    s: styleIdFor("missing", column === "id"),
    custom: writeLumioCustom({
      state: "missing",
      raw: "@missing",
      effective: null,
      column,
      rowKey,
    }),
  };
}

function writeDraftRow(
  executeCommand: ((id: string, params?: unknown) => unknown) | undefined,
  map: ProjectionMap,
  keys: string[],
  startSheetRow: number,
): void {
  if (!executeCommand) {
    return;
  }
  keys.forEach((rowKey, offset) => {
    const sheetRow = startSheetRow + offset;
    map.columns.forEach((column, colIndex) => {
      const value = column === "id" ? draftIdCell(rowKey) : missingCell(rowKey, column);
      executeCommand(COMMAND.setRangeValues, {
        range: {
          startRow: sheetRow,
          startColumn: colIndex,
          endRow: sheetRow,
          endColumn: colIndex,
        },
        value,
      });
    });
  });
}

export function installInterceptors(
  univer: unknown,
  map: ProjectionMap,
  options?: InstallInterceptorsOptions,
): { dispose: () => void } {
  const host = resolveHost(univer);
  const hint = (message: string) => options?.onHint?.(message);
  const pendingInserts: Array<{ keys: string[]; startSheetRow: number }> = [];

  const onBefore = (event: CommandInterceptEvent) => {
    const id = event.id;
    if (MERGE_IDS.has(id)) {
      event.cancel = true;
      hint(HINTS.merge);
      return;
    }
    if (COLUMN_IDS.has(id)) {
      event.cancel = true;
      hint(HINTS.columns);
      return;
    }
    if (FORMULA_UI_IDS.has(id)) {
      event.cancel = true;
      hint(HINTS.formula);
      return;
    }
    if (PASTE_IDS.has(id) || id === COMMAND.setRangeValuesMutation) {
      if (hasFormulaField(event.params) || id === COMMAND.pasteFormula) {
        stripFormulas(event.params);
        hint(HINTS.pasteFormula);
      }
      const blocked = touchesHeaderOrId(event.params, map);
      if (blocked === "header") {
        event.cancel = true;
        hint(HINTS.header);
      } else if (blocked === "id" && !isDraftIdWrite(event.params)) {
        event.cancel = true;
        hint(HINTS.id);
      } else {
        attachLumioFromEdit(event.params, map);
      }
      return;
    }
    if (id === COMMAND.setRangeValues) {
      const blocked = touchesHeaderOrId(event.params, map);
      if (blocked === "header") {
        event.cancel = true;
        hint(HINTS.header);
        return;
      }
      if (blocked === "id" && !isDraftIdWrite(event.params)) {
        event.cancel = true;
        hint(HINTS.id);
        return;
      }
      if (hasFormulaField(event.params)) {
        event.cancel = true;
        hint(HINTS.formula);
        return;
      }
      if (!isDraftIdWrite(event.params)) {
        attachLumioFromEdit(event.params, map);
      }
      return;
    }
    if (INSERT_ROW_IDS.has(id)) {
      const keys = applyInsert(map, event.params, INSERT_ROW_AFTER.has(id), options?.randomBytes);
      const rec = asRecord(event.params);
      if (rec) {
        rec.lumioDraftKeys = keys;
      }
      const range = rowRange(event.params) ?? { startRow: 1, count: keys.length };
      pendingInserts.push({ keys, startSheetRow: INSERT_ROW_AFTER.has(id) ? range.startRow + 1 : range.startRow });
      hint(`${HINTS.insertRow}（${keys.join(", ")}）`);
      return;
    }
    if (DELETE_ROW_IDS.has(id)) {
      applyDelete(map, event.params);
    }
  };

  const onAfter = (event: CommandInterceptEvent) => {
    if (event.cancel) {
      return;
    }
    if (!INSERT_ROW_IDS.has(event.id)) {
      return;
    }
    const next = pendingInserts.shift();
    if (!next) {
      return;
    }
    writeDraftRow(options?.executeCommand, map, next.keys, next.startSheetRow);
  };

  const disposers: Array<{ dispose(): void }> = [];
  if (typeof host.addEvent === "function") {
    const beforeToken = host.Event?.BeforeCommandExecute ?? "BeforeCommandExecute";
    const afterToken = host.Event?.CommandExecuted ?? "CommandExecuted";
    disposers.push(host.addEvent(beforeToken, onBefore));
    disposers.push(host.addEvent(afterToken, onAfter));
  } else if (typeof host.onBeforeCommandExecute === "function") {
    disposers.push(host.onBeforeCommandExecute(onBefore));
    if (typeof host.onCommandExecuted === "function") {
      disposers.push(host.onCommandExecuted(onAfter));
    }
  } else {
    throw new Error("installInterceptors: no beforeCommandExecute hook");
  }

  return {
    dispose() {
      for (const disposer of disposers) {
        disposer.dispose();
      }
    },
  };
}

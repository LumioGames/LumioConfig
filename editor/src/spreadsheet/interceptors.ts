import type { CellToken, ProjectionMap, TableColumn } from "../api/types";
import { DRAFT_ID_LABEL, readLumioMeta, styleIdFor, tokenFromMeta, writeLumioCustom } from "./cellMeta";
import { COMMAND } from "./commands";
import { rememberToken } from "./extract";
import { tokenForDeleteKey } from "./fourState";
import { numberOutOfRange } from "./editors";

// COMMAND 常量已按 ADR 0004 移至 spreadsheet/commands.ts;此处 re-export 保住
// 既有导入方(App.tsx、tests/interceptors.test.ts)不换文件。
export { COMMAND } from "./commands";

export const HINTS = {
  formula: "公式不可用，配表不持久化公式",
  merge: "禁止合并单元格",
  columns: "禁止插入或删除 Schema 列",
  id: "id 列不可编辑",
  pasteFormula: "粘贴含公式，已仅保留值",
  header: "表头不可编辑",
  insertRow: "新行将在合入时发号",
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

const CLEAR_IDS = new Set<string>([
  COMMAND.clearSelectionContent,
  COMMAND.clearSelectionAll,
  COMMAND.clearContent,
]);

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
  tableColumns?: TableColumn[];
  onChange?: () => void;
  onViewChange?: () => void;
  canEdit?: () => boolean;
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
  const rec = asRecord(params);
  const preset = rec?.lumioDraftKeys;
  const keys: string[] = Array.isArray(preset)
    ? preset.filter((item): item is string => typeof item === "string")
    : [];
  while (keys.length < range.count) {
    keys.push(newDraftRowKey(randomBytes));
  }
  map.rowKeys.splice(index, 0, ...keys.slice(0, range.count));
  return keys.slice(0, range.count);
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

function columnOf(options: InstallInterceptorsOptions | undefined, name: string): TableColumn | undefined {
  return options?.tableColumns?.find((item) => item.name === name);
}

/** 单元格提交值与 token 有效显示值的统一文本口径(null/undefined 视为空)。 */
function displayText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function attachLumioFromEdit(params: unknown, map: ProjectionMap, options?: InstallInterceptorsOptions): void {
  visitCells(params, (cell, row, col) => {
    if (row === undefined || col === undefined || row <= 0) {
      return;
    }
    const column = map.columns[col];
    const rowKey = map.rowKeys[row - 1];
    if (!column || !rowKey) {
      return;
    }
    const existing = readLumioMeta(cell as { custom?: Record<string, unknown> });
    // Univer 键盘提交的 value 携带整格旧 custom.lumio;只有「新 v 相对当前
    // 有效显示值发生了变化」才是用户文本编辑(0-7 §5:四态与普通值互不坍缩)。
    const typedEdit = cell.v !== undefined && cell.v !== null;
    if (existing && existing.state !== "value") {
      if (!typedEdit || displayText(cell.v) === displayText(existing.effective)) {
        const token = tokenFromMeta({ ...existing, column, rowKey });
        cell.custom = {
          ...asRecord(cell.custom),
          ...writeLumioCustom({
            ...existing,
            column,
            rowKey,
          }),
        };
        rememberToken(map, rowKey, column, token);
        return;
      }
    } else if (!typedEdit && !existing) {
      // 例如漏过拦截的清空 mutation:{ v: null } 不是文本编辑,不得记成
      // { state: "value", raw: "" }(required 列保持原值的兜底口径)。
      return;
    }
    const raw =
      cell.v === undefined || cell.v === null
        ? ""
        : typeof cell.v === "string"
          ? cell.v
          : String(cell.v);
    const token: CellToken = { state: "value", raw, effective: cell.v ?? raw };
    const desc = columnOf(options, column);
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
    if (desc && numberOutOfRange(desc, raw)) {
      cell.s = "invalid";
    }
    rememberToken(map, rowKey, column, token);
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
      if (column === "id") {
        rememberToken(map, rowKey, column, { state: "value", raw: "", effective: null });
      } else {
        rememberToken(map, rowKey, column, { state: "missing", raw: "@missing", effective: null });
      }
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

function colRange(params: unknown): { startCol: number; endCol: number } {
  const rec = asRecord(params);
  const range = asRecord(rec?.range);
  const startCol = numberOf(range?.startColumn) ?? numberOf(rec?.startColumn) ?? 0;
  const endCol = numberOf(range?.endColumn) ?? numberOf(rec?.endColumn) ?? startCol;
  return { startCol, endCol };
}

export function copyRowKey(map: ProjectionMap, sourceKey: string, randomBytes?: () => Uint8Array): string {
  const key = newDraftRowKey(randomBytes);
  const index = map.rowKeys.indexOf(sourceKey);
  map.rowKeys.splice(index >= 0 ? index + 1 : map.rowKeys.length, 0, key);
  return key;
}

interface SelectionSheetRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

function callMethod(target: unknown, name: string): unknown {
  const rec = asRecord(target);
  const method = rec?.[name];
  return typeof method === "function" ? (method as () => unknown).call(target) : undefined;
}

/**
 * 键盘 Delete 的 sheet.command.clear-selection-content 不带 range(真实命令
 * 从 selectionManager 取选区);拦截时从 univerAPI 读当前活动选区兜底。
 */
function activeSelectionRange(univer: unknown): SelectionSheetRange | undefined {
  const rec = asRecord(univer);
  const api = rec?.univerAPI ?? univer;
  const workbook = callMethod(api, "getActiveWorkbook");
  const sheet = callMethod(workbook, "getActiveSheet");
  const selection = callMethod(sheet, "getSelection");
  const range = callMethod(selection, "getActiveRange");
  if (!asRecord(range)) {
    return undefined;
  }
  const startRow = numberOf(callMethod(range, "getRow"));
  const startCol = numberOf(callMethod(range, "getColumn"));
  if (startRow === undefined || startCol === undefined) {
    return undefined;
  }
  return {
    startRow,
    endRow: numberOf(callMethod(range, "getLastRow")) ?? startRow,
    startCol,
    endCol: numberOf(callMethod(range, "getLastColumn")) ?? startCol,
  };
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
    const viewOnly =
      id.includes("zoom") ||
      id.includes("frozen") ||
      id.includes("filter") ||
      id.includes("sort") ||
      id.includes("hide") ||
      id.includes("width");
    if (!viewOnly && options?.canEdit && !options.canEdit()) {
      event.cancel = true;
      hint("另一个标签页已保存，请刷新");
      return;
    }
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
        attachLumioFromEdit(event.params, map, options);
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
        attachLumioFromEdit(event.params, map, options);
      }
      return;
    }
    if (CLEAR_IDS.has(id)) {
      let rows = rowRange(event.params);
      let cols: { startCol: number; endCol: number };
      if (rows) {
        cols = colRange(event.params);
      } else {
        const selection = activeSelectionRange(univer);
        if (!selection) {
          return;
        }
        rows = { startRow: selection.startRow, count: selection.endRow - selection.startRow + 1 };
        cols = { startCol: selection.startCol, endCol: selection.endCol };
      }
      event.cancel = true;
      const execute = options?.executeCommand;
      for (let sheetRow = rows.startRow; sheetRow < rows.startRow + rows.count; sheetRow += 1) {
        if (sheetRow <= 0) {
          continue;
        }
        const rowKey = map.rowKeys[sheetRow - 1];
        if (!rowKey) {
          continue;
        }
        for (let col = cols.startCol; col <= cols.endCol; col += 1) {
          const columnName = map.columns[col];
          if (!columnName || columnName === "id") {
            continue;
          }
          const desc = columnOf(options, columnName);
          if (!desc) {
            continue;
          }
          const result = tokenForDeleteKey(desc);
          if (!result.token) {
            hint(result.hint ?? "required 列不能清空");
            continue;
          }
          rememberToken(map, rowKey, columnName, result.token);
          execute?.(COMMAND.setRangeValues, {
            range: { startRow: sheetRow, startColumn: col, endRow: sheetRow, endColumn: col },
            value: {
              // 四态写入必须带显式 v:null:Univer mutation 合并只在新值带 v 字段时
              // 覆盖,否则画布残留旧文本(评审 P2-1,与 buildCell 写路径同规则)。
              v: null,
              s: styleIdFor(result.token.state, false),
              custom: writeLumioCustom({
                ...result.token,
                column: columnName,
                rowKey,
              }),
            },
          });
        }
      }
      options?.onChange?.();
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
    if (INSERT_ROW_IDS.has(event.id)) {
      const next = pendingInserts.shift();
      if (next) {
        writeDraftRow(options?.executeCommand, map, next.keys, next.startSheetRow);
      }
    }
    if (
      PASTE_IDS.has(event.id) ||
      event.id === COMMAND.setRangeValues ||
      event.id === COMMAND.setRangeValuesMutation ||
      INSERT_ROW_IDS.has(event.id) ||
      DELETE_ROW_IDS.has(event.id)
    ) {
      options?.onChange?.();
    }
    options?.onViewChange?.();
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

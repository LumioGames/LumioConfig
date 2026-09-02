import type { CellToken, Draft, DraftCell, PatchObject, PatchOp, ProjectionMap } from "../api/types";
import { readLumioMeta, tokenFromMeta } from "./cellMeta";
import { tokenEqual } from "./tokens";
import type { WorkbookData, WorksheetData } from "./workbook-types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function resolveWorkbookData(source: unknown): WorkbookData {
  const rec = asRecord(source);
  if (!rec) {
    throw new Error("extractTokens requires a workbook snapshot or Univer instance");
  }
  if (rec.sheets && rec.sheetOrder) {
    return source as WorkbookData;
  }
  if (typeof rec.save === "function") {
    return resolveWorkbookData((rec.save as () => unknown)());
  }
  if (typeof rec.getSnapshot === "function") {
    return resolveWorkbookData((rec.getSnapshot as () => unknown)());
  }
  if (typeof rec.getActiveWorkbook === "function") {
    return resolveWorkbookData((rec.getActiveWorkbook as () => unknown)());
  }
  if (rec.univerAPI) {
    return resolveWorkbookData(rec.univerAPI);
  }
  throw new Error("extractTokens: unrecognized univer/workbook argument");
}

function sheetOf(workbook: WorkbookData, table: string): WorksheetData {
  const ordered = workbook.sheetOrder?.[0];
  const sheet = workbook.sheets[table] ?? (ordered ? workbook.sheets[ordered] : undefined);
  if (!sheet) {
    throw new Error(`extractTokens: sheet ${table} not found`);
  }
  return sheet;
}

function indexRowsByKey(sheet: WorksheetData): Map<string, number> {
  const index = new Map<string, number>();
  for (const [rowKey, row] of Object.entries(sheet.cellData ?? {})) {
    const rowIndex = Number(rowKey);
    if (!Number.isFinite(rowIndex) || rowIndex === 0) {
      continue;
    }
    for (const cell of Object.values(row ?? {})) {
      const meta = readLumioMeta(cell);
      if (meta?.rowKey) {
        index.set(meta.rowKey, rowIndex);
        break;
      }
    }
  }
  return index;
}

export function extractTokens(
  univer: unknown,
  map: ProjectionMap,
): Record<string, Record<string, CellToken>> {
  const workbook = resolveWorkbookData(univer);
  const sheet = sheetOf(workbook, map.table);
  const byKey = indexRowsByKey(sheet);
  const out: Record<string, Record<string, CellToken>> = {};

  map.rowKeys.forEach((rowKey, dataIndex) => {
    if (map.deleted.has(rowKey)) {
      return;
    }
    const sheetRow = byKey.get(rowKey) ?? dataIndex + 1;
    const line = sheet.cellData?.[String(sheetRow)] ?? {};
    const cells: Record<string, CellToken> = {};
    map.columns.forEach((column, colIndex) => {
      const cell = line[String(colIndex)];
      const meta = readLumioMeta(cell);
      if (meta) {
        cells[column] = tokenFromMeta(meta);
        return;
      }
      if (column === "id" && rowKey.startsWith("draft:")) {
        cells[column] = { state: "value", raw: "", effective: null };
        return;
      }
      const fromCurrent = map.currentCells?.[rowKey]?.[column];
      if (fromCurrent) {
        cells[column] = fromCurrent;
        return;
      }
      const fromMap = map.baseCells[rowKey]?.[column];
      if (fromMap) {
        cells[column] = fromMap;
        return;
      }
      if (rowKey.startsWith("draft:")) {
        cells[column] = { state: "missing", raw: "@missing", effective: null };
        return;
      }
      throw new Error(
        `extractTokens: cell ${rowKey}.${column} has no lumio state metadata (refusing to guess from style)`,
      );
    });
    out[rowKey] = cells;
  });

  return out;
}

export function mergeCurrentCells(
  map: ProjectionMap,
  tokens: Record<string, Record<string, CellToken>>,
): Record<string, Record<string, CellToken>> {
  const out: Record<string, Record<string, CellToken>> = { ...tokens };
  for (const [rowKey, cells] of Object.entries(map.currentCells ?? {})) {
    out[rowKey] = { ...out[rowKey], ...cells };
  }
  return out;
}

export function rememberToken(map: ProjectionMap, rowKey: string, column: string, token: CellToken): void {
  if (!map.currentCells) {
    map.currentCells = {};
  }
  if (!map.currentCells[rowKey]) {
    map.currentCells[rowKey] = {};
  }
  map.currentCells[rowKey][column] = token;
}

export function countDirty(
  map: ProjectionMap,
  tokens: Record<string, Record<string, CellToken>>,
): number {
  let n = map.deleted.size;
  for (const [rowKey, cells] of Object.entries(tokens)) {
    if (rowKey.startsWith("draft:")) {
      n += Object.keys(cells).length;
      continue;
    }
    const base = map.baseCells[rowKey] ?? {};
    for (const [column, token] of Object.entries(cells)) {
      if (!tokenEqual(token, base[column])) {
        n += 1;
      }
    }
  }
  return n;
}

function asDraftCell(token: CellToken): DraftCell {
  return { state: token.state, raw: token.raw, effective: token.effective };
}

export function buildDraft(
  table: string,
  map: ProjectionMap,
  tokens: Record<string, Record<string, CellToken>>,
  draftVersion: number,
): Draft {
  const rows: Draft["rows"] = {};
  const renamed: Record<string, string> = {};
  for (const rowKey of map.rowKeys) {
    if (map.deleted.has(rowKey)) {
      continue;
    }
    const current = tokens[rowKey] ?? {};
    if (rowKey.startsWith("draft:")) {
      const patch: Record<string, DraftCell | string> = {};
      for (const [column, token] of Object.entries(current)) {
        if (column === "id") {
          continue;
        }
        if (column === "name") {
          patch.name = String(token.effective ?? token.raw);
          continue;
        }
        patch[column] = asDraftCell(token);
      }
      rows[rowKey] = patch;
      continue;
    }
    const base = map.baseCells[rowKey] ?? {};
    const patch: Record<string, DraftCell | string> = {};
    for (const [column, token] of Object.entries(current)) {
      if (tokenEqual(token, base[column])) {
        continue;
      }
      if (column === "id") {
        continue;
      }
      if (column === "name") {
        renamed[rowKey] = String(token.effective ?? token.raw);
        continue;
      }
      patch[column] = asDraftCell(token);
    }
    if (Object.keys(patch).length) {
      rows[rowKey] = patch;
    }
  }
  return {
    table,
    baseFingerprint: map.baseFingerprint,
    draftVersion,
    rows,
    renamed,
    deleted: [...map.deleted],
  };
}

function setValue(token: CellToken, refNames?: Record<string, string>): string | number | boolean | null | undefined {
  if (token.state === "missing") {
    return undefined;
  }
  if (token.state === "empty") {
    return "";
  }
  if (token.state === "null") {
    return null;
  }
  if (token.state === "default") {
    return "@default";
  }
  const mapped = refNames?.[token.raw] ?? refNames?.[String(token.effective ?? "")];
  if (mapped) {
    return mapped;
  }
  return token.raw;
}

function rowName(cells: Record<string, CellToken> | undefined): string {
  const token = cells?.name;
  return String(token?.effective ?? token?.raw ?? "");
}

export function buildPatch(
  map: ProjectionMap,
  tokens: Record<string, Record<string, CellToken>>,
  options?: { refNames?: Record<string, string> },
): PatchObject {
  const ops: PatchOp[] = [];
  const refNames = options?.refNames;
  for (const rowKey of map.deleted) {
    if (rowKey.startsWith("draft:")) {
      continue;
    }
    const base = map.baseCells[rowKey] ?? {};
    ops.push({
      op: "delete",
      name: rowName(base),
      expect: { id: String(base.id?.effective ?? base.id?.raw ?? rowKey) },
    });
  }
  for (const rowKey of map.rowKeys) {
    if (map.deleted.has(rowKey)) {
      continue;
    }
    if (rowKey.startsWith("draft:")) {
      const current = tokens[rowKey] ?? {};
      const set: Record<string, string | number | boolean | null> = {};
      for (const [column, token] of Object.entries(current)) {
        if (column === "id" || column === "name") {
          continue;
        }
        const value = setValue(token, refNames);
        if (value !== undefined) {
          set[column] = value;
        }
      }
      ops.push({
        op: "create",
        name: rowName(current),
        draftRowKey: rowKey,
        set,
      });
      continue;
    }
    const current = tokens[rowKey] ?? {};
    const base = map.baseCells[rowKey] ?? {};
    const baseName = rowName(base);
    const nextName = rowName(current) || baseName;
    if (nextName && baseName && nextName !== baseName) {
      ops.push({
        op: "rename",
        name: baseName,
        to: nextName,
        expect: { name: baseName },
      });
    }
    const set: Record<string, string | number | boolean | null> = {};
    const expect: Record<string, string> = {};
    const columns = new Set([...Object.keys(base), ...Object.keys(current)]);
    for (const column of columns) {
      if (column === "id" || column === "name") {
        continue;
      }
      const token = current[column];
      const baseline = base[column];
      if (!token || tokenEqual(token, baseline)) {
        continue;
      }
      const value = setValue(token, refNames);
      if (value !== undefined) {
        set[column] = value;
      }
      expect[column] = baseline?.raw ?? "@missing";
    }
    if (Object.keys(set).length || Object.keys(expect).length) {
      const update: PatchOp = { op: "update", name: nextName || baseName, set };
      if (Object.keys(expect).length) {
        update.expect = expect;
      }
      ops.push(update);
    }
  }
  return {
    table: map.table,
    base: { sourceFingerprint: map.baseFingerprint },
    ops,
  };
}

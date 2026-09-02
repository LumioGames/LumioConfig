import type { CellToken, Draft, DraftCell, ProjectionMap } from "../api/types";
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

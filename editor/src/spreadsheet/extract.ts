import type { CellToken, ProjectionMap } from "../api/types";
import { readLumioMeta, tokenFromMeta } from "./cellMeta";
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
      throw new Error(
        `extractTokens: cell ${rowKey}.${column} has no lumio state metadata (refusing to guess from style)`,
      );
    });
    out[rowKey] = cells;
  });

  return out;
}

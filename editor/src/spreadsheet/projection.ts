import type { CellToken, ProjectionMap, TableColumn, TableResponse } from "../api/types";
import {
  badgeFor,
  DRAFT_ID_LABEL,
  styleIdFor,
  writeLumioCustom,
} from "./cellMeta";
import { tokensFromTable } from "./tokens";
import type { WorkbookCell, WorkbookData, WorksheetData } from "./workbook-types";

export const HEADER_ROW = 0;
export const APP_VERSION = "0.25.1";

const STYLES: WorkbookData["styles"] = {
  header: {
    bl: { s: 1 },
    bg: { rgb: "#EEF2F6" },
    ht: 1,
    vt: 2,
    fs: 11,
  },
  idReadOnly: {
    bg: { rgb: "#F4F6F8" },
    cl: { rgb: "#5C6570" },
    ht: 1,
    vt: 2,
    fs: 11,
  },
  missing: {
    it: { s: 1 },
    cl: { rgb: "#9AA0A6" },
    fs: 10,
    vt: 2,
  },
  empty: {
    it: { s: 1 },
    cl: { rgb: "#80868B" },
    fs: 10,
    vt: 2,
  },
  nullState: {
    it: { s: 1 },
    cl: { rgb: "#80868B" },
    fs: 11,
    vt: 2,
    ht: 1,
  },
  default: {
    it: { s: 1 },
    cl: { rgb: "#9AA0A6" },
    fs: 11,
    vt: 2,
  },
  value: {
    fs: 11,
    vt: 2,
  },
};

function displayValue(
  token: CellToken,
  column: TableColumn,
  rowKey: string,
): { v: string | number | boolean | undefined; forceString: boolean } {
  if (column.name === "id" && rowKey.startsWith("draft:")) {
    return { v: DRAFT_ID_LABEL, forceString: true };
  }
  if (token.state === "missing" || token.state === "empty" || token.state === "null") {
    return { v: undefined, forceString: false };
  }
  if (token.state === "default") {
    return displayFromEffective(token.effective);
  }
  return displayFromEffective(token.effective ?? token.raw);
}

function displayFromEffective(value: unknown): {
  v: string | number | boolean | undefined;
  forceString: boolean;
} {
  if (value === null || value === undefined) {
    return { v: undefined, forceString: false };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { v: value, forceString: false };
  }
  const text = String(value);
  const forceString = text.length > 0 && "=-+@".includes(text[0] ?? "");
  return { v: text, forceString };
}

function cellFor(
  token: CellToken,
  column: TableColumn,
  rowKey: string,
): WorkbookCell {
  const readOnly = column.readOnly === true || column.name === "id";
  const { v, forceString } = displayValue(token, column, rowKey);
  const badge = badgeFor(token.state);
  const cell: WorkbookCell = {
    s: styleIdFor(token.state, readOnly),
    custom: writeLumioCustom({
      state: token.state,
      raw: token.raw,
      effective: token.effective,
      column: column.name,
      rowKey,
      badge,
      draftId: column.name === "id" && rowKey.startsWith("draft:"),
    }),
  };
  if (v !== undefined) {
    cell.v = v;
  }
  if (forceString) {
    cell.t = 4;
  } else if (typeof v === "number") {
    cell.t = 2;
  } else if (typeof v === "boolean") {
    cell.t = 3;
  } else if (typeof v === "string") {
    cell.t = 1;
  }
  return cell;
}

export function buildWorkbook(table: TableResponse): { workbook: WorkbookData; map: ProjectionMap } {
  const columns = table.columns.map((column) => column.name);
  const rowKeys = table.rows.map((row) => String(row.id));
  const baseCells = tokensFromTable(table);
  const map: ProjectionMap = {
    table: table.table,
    baseFingerprint: table.sourceFingerprint,
    columns,
    rowKeys,
    baseCells,
    deleted: new Set<string>(),
  };

  const cellData: WorksheetData["cellData"] = {};
  const headerRow: Record<string, WorkbookCell> = {};
  table.columns.forEach((column, colIndex) => {
    headerRow[String(colIndex)] = {
      v: column.name,
      t: 1,
      s: "header",
    };
  });
  cellData[String(HEADER_ROW)] = headerRow;

  table.rows.forEach((row, rowIndex) => {
    const rowKey = String(row.id);
    const sheetRow = rowIndex + 1;
    const line: Record<string, WorkbookCell> = {};
    table.columns.forEach((column, colIndex) => {
      const token = baseCells[rowKey]?.[column.name] ?? {
        state: "missing" as const,
        raw: "@missing",
        effective: null,
      };
      line[String(colIndex)] = cellFor(token, column, rowKey);
    });
    cellData[String(sheetRow)] = line;
  });

  const columnData: WorksheetData["columnData"] = {};
  table.columns.forEach((column, colIndex) => {
    columnData[String(colIndex)] = {
      w: column.name === "id" ? 110 : column.name === "name" ? 140 : 120,
    };
  });

  const sheet: WorksheetData = {
    id: table.table,
    name: table.table,
    rowCount: Math.max(40, table.rows.length + 20),
    columnCount: Math.max(table.columns.length, 1),
    defaultColumnWidth: 120,
    defaultRowHeight: 24,
    freeze: {
      xSplit: Math.min(2, table.columns.length),
      ySplit: 1,
      startRow: 1,
      startColumn: Math.min(2, table.columns.length),
    },
    mergeData: [],
    cellData,
    columnData,
    zoomRatio: 1,
    showGridlines: 1,
    rightToLeft: 0,
    hidden: 0,
  };

  const workbook: WorkbookData = {
    id: `lumio-${table.table}`,
    name: table.table,
    appVersion: APP_VERSION,
    locale: "zhCN",
    styles: STYLES,
    sheetOrder: [table.table],
    sheets: { [table.table]: sheet },
  };

  return { workbook, map };
}

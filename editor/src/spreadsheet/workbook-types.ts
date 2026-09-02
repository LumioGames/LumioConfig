/** Univer IWorkbookData / ICellData compatible snapshot types (no Univer import). */

export type CellValue = string | number | boolean;

export interface WorkbookCell {
  v?: CellValue;
  t?: number;
  s?: string;
  p?: unknown;
  f?: string;
  si?: string;
  custom?: Record<string, unknown>;
}

export interface FreezeState {
  xSplit: number;
  ySplit: number;
  startRow: number;
  startColumn: number;
}

export interface ColumnData {
  w?: number;
  hd?: number;
  s?: string;
}

export interface RowData {
  h?: number;
  hd?: number;
  s?: string;
}

export interface WorksheetData {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  defaultColumnWidth?: number;
  defaultRowHeight?: number;
  freeze?: FreezeState;
  mergeData?: unknown[];
  cellData: Record<string, Record<string, WorkbookCell>>;
  rowData?: Record<string, RowData>;
  columnData?: Record<string, ColumnData>;
  zoomRatio?: number;
  hidden?: number;
  showGridlines?: number;
  rightToLeft?: number;
}

export interface WorkbookStyle {
  it?: { s?: number };
  cl?: { rgb?: string };
  fs?: number;
  bl?: { s?: number };
  bg?: { rgb?: string };
  ht?: number;
  vt?: number;
  ff?: string;
}

export interface WorkbookData {
  id: string;
  name: string;
  appVersion: string;
  locale: string;
  styles: Record<string, WorkbookStyle>;
  sheetOrder: string[];
  sheets: Record<string, WorksheetData>;
  resources?: unknown;
}

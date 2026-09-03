import type { FreezeState } from "./workbook-types";
import type { WorkbookData } from "./workbook-types";

export const VIEW_KEY_PREFIX = "lumio-config-editor:view:";

export interface ViewState {
  columnWidths?: Record<string, number>;
  freeze?: FreezeState;
  hiddenColumns?: number[];
  filter?: unknown;
  sort?: unknown;
  zoom?: number;
  /** 检查器开合(设计稿 §2.1:默认收起,开合记 localStorage,刷新后记忆)。 */
  inspectorOpen?: boolean;
  /** 表列表折叠(Ctrl+B / 44px 首字母栏,设计稿 §10)。 */
  sidebarCollapsed?: boolean;
}

/** 检查器 / 表列表的缺省开合态:检查器默认收起,表列表默认展开。 */
export const UI_DEFAULTS = {
  inspectorOpen: false,
  sidebarCollapsed: false,
} as const;

/** 存量视图 JSON(无这两个字段)与 null 一律落回缺省开合态。 */
export function uiFlags(state: ViewState | null): {
  inspectorOpen: boolean;
  sidebarCollapsed: boolean;
} {
  return {
    inspectorOpen: state?.inspectorOpen ?? UI_DEFAULTS.inspectorOpen,
    sidebarCollapsed: state?.sidebarCollapsed ?? UI_DEFAULTS.sidebarCollapsed,
  };
}

export function storageKey(repoName: string, table: string): string {
  return `${VIEW_KEY_PREFIX}${repoName}:${table}`;
}

export function load(
  repoName: string,
  table: string,
  storage: Pick<Storage, "getItem"> = globalThis.localStorage,
): ViewState | null {
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(storageKey(repoName, table));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ViewState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function save(
  repoName: string,
  table: string,
  state: ViewState,
  storage: Pick<Storage, "setItem"> = globalThis.localStorage,
): void {
  storage.setItem(storageKey(repoName, table), JSON.stringify(state));
}

export function applyViewState(workbook: WorkbookData, table: string, state: ViewState | null): WorkbookData {
  if (!state) {
    return workbook;
  }
  const sheet = workbook.sheets[table] ?? workbook.sheets[workbook.sheetOrder[0] ?? ""];
  if (!sheet) {
    return workbook;
  }
  if (state.freeze) {
    sheet.freeze = { ...state.freeze };
  }
  if (state.zoom && Number.isFinite(state.zoom)) {
    sheet.zoomRatio = state.zoom;
  }
  sheet.columnData = sheet.columnData ?? {};
  if (state.columnWidths) {
    for (const [index, width] of Object.entries(state.columnWidths)) {
      const current = sheet.columnData[index] ?? {};
      sheet.columnData[index] = { ...current, w: width };
    }
  }
  if (state.hiddenColumns) {
    for (const index of state.hiddenColumns) {
      const key = String(index);
      const current = sheet.columnData[key] ?? {};
      sheet.columnData[key] = { ...current, hd: 1 };
    }
  }
  return workbook;
}

export function captureViewState(workbook: WorkbookData, table: string): ViewState {
  const sheet = workbook.sheets[table] ?? workbook.sheets[workbook.sheetOrder[0] ?? ""];
  const columnWidths: Record<string, number> = {};
  const hiddenColumns: number[] = [];
  for (const [index, data] of Object.entries(sheet?.columnData ?? {})) {
    if (typeof data.w === "number") {
      columnWidths[index] = data.w;
    }
    if (data.hd === 1) {
      hiddenColumns.push(Number(index));
    }
  }
  return {
    columnWidths,
    freeze: sheet?.freeze ? { ...sheet.freeze } : undefined,
    hiddenColumns,
    zoom: sheet?.zoomRatio,
  };
}

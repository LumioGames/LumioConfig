import { COPY } from "../app/copy";
import type {
  CellToken,
  Draft,
  DraftCell,
  ProjectionMap,
  RebaseResponse,
  TableColumn,
  TableResponse,
  TableRow,
} from "../api/types";
import {
  badgeFor,
  DRAFT_ID_LABEL,
  styleIdFor,
  writeLumioCustom,
  type CellStyleFlags,
} from "./cellMeta";
import { enumOptions, numberOutOfRange, validationRules } from "./editors";
import { tokenEqual, tokensFromTable } from "./tokens";
import type { WorkbookCell, WorkbookData, WorkbookStyle, WorksheetData } from "./workbook-types";

export const HEADER_ROW = 0;
export const APP_VERSION = "0.25.1";

/**
 * STYLES 是工作簿数据,无法引用 CSS 变量;色值逐项对齐设计令牌真值表
 * `.spec/knowledge/features/web-editor-ux.md` §4(与 styles/tokens.css 同源):
 * - 文本:#1C2230(text)/ #6A7280(text-muted)/ #9AA3B0(text-faint)
 * - 脏格底:#FFF7E0(--color-dirty-bg;右上三角 #B7791F 由渲染层画)
 * - 新行底:#EAF2FF(--color-new-bg)
 * - 无效:#B3261E(--color-danger-text)+ 波浪下划线(TextDecoration.WAVE=14)
 * - 删除行:#FDECEC(--color-danger-bg)+ 删除线
 * - 只读列底:#F6F7F9(--color-readonly-bg)
 * header 底 #EEF2F6 沿用 v1 既有值(§4 未定义列头底色,非本轮改项)。
 * ul/st/tb 是 Univer IStyleData 字段,workbook-types 的 WorkbookStyle 未收录,
 * 故在此局部放宽(见 CellStyle)。
 */
interface CellStyle extends WorkbookStyle {
  ul?: { s?: number; t?: number; cl?: { rgb?: string } };
  st?: { s?: number };
  /** WrapStrategy.WRAP = 3:两行列头(一行 Univer 行,\n 分行,高 36)。 */
  tb?: number;
}

const STYLES: Record<string, CellStyle> = {
  header: {
    bl: { s: 1 },
    bg: { rgb: "#EEF2F6" },
    ht: 1,
    vt: 2,
    fs: 11,
    tb: 3,
  },
  idReadOnly: {
    bg: { rgb: "#F6F7F9" },
    cl: { rgb: "#6A7280" },
    ht: 1,
    vt: 2,
    fs: 11,
  },
  missing: {
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 10,
    vt: 2,
  },
  empty: {
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 10,
    vt: 2,
  },
  nullState: {
    it: { s: 1 },
    cl: { rgb: "#6A7280" },
    fs: 11,
    vt: 2,
    ht: 1,
  },
  default: {
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 11,
    vt: 2,
  },
  value: {
    cl: { rgb: "#1C2230" },
    fs: 11,
    vt: 2,
  },
  invalid: {
    cl: { rgb: "#B3261E" },
    fs: 11,
    vt: 2,
    ul: { s: 1, t: 14, cl: { rgb: "#B3261E" } },
  },
  dirtyValue: {
    bg: { rgb: "#FFF7E0" },
    cl: { rgb: "#1C2230" },
    fs: 11,
    vt: 2,
  },
  dirtyMissing: {
    bg: { rgb: "#FFF7E0" },
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 10,
    vt: 2,
  },
  dirtyEmpty: {
    bg: { rgb: "#FFF7E0" },
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 10,
    vt: 2,
  },
  dirtyNull: {
    bg: { rgb: "#FFF7E0" },
    it: { s: 1 },
    cl: { rgb: "#6A7280" },
    fs: 11,
    vt: 2,
    ht: 1,
  },
  dirtyDefault: {
    bg: { rgb: "#FFF7E0" },
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 11,
    vt: 2,
  },
  dirtyReadOnly: {
    bg: { rgb: "#FFF7E0" },
    cl: { rgb: "#6A7280" },
    ht: 1,
    vt: 2,
    fs: 11,
  },
  newRow: {
    bg: { rgb: "#EAF2FF" },
    cl: { rgb: "#1C2230" },
    fs: 11,
    vt: 2,
  },
  newRowId: {
    bg: { rgb: "#EAF2FF" },
    it: { s: 1 },
    cl: { rgb: "#6A7280" },
    fs: 11,
    ht: 1,
    vt: 2,
  },
  deletedRow: {
    st: { s: 1 },
    cl: { rgb: "#B3261E" },
    bg: { rgb: "#FDECEC" },
    fs: 11,
    vt: 2,
  },
  placeholder: {
    it: { s: 1 },
    cl: { rgb: "#9AA3B0" },
    fs: 11,
    vt: 2,
  },
};

/** §6 列头第二行 / 检查器列约束共用的类型段:引用列展开目标表。 */
export function columnTypeLabel(column: TableColumn): string {
  if (column.type === "ref") {
    return `ref→${column.refTarget ?? ""}`;
  }
  return column.type;
}

/** §6 列头第一行:`name *`(必填星)与 `🔒`(只读锁,id 列恒只读)。 */
function headerFirstLine(column: TableColumn): string {
  const readOnly = column.readOnly === true || column.name === "id";
  return `${column.name}${column.required === true ? " *" : ""}${readOnly ? " 🔒" : ""}`;
}

/** M7-C S01:类型段走 COPY.columnType 中文化;未知类型回落原字面量;ref 列维持 columnTypeLabel 的 `ref→<目标表>`。 */
function localizedTypeLabel(column: TableColumn): string {
  const label = columnTypeLabel(column);
  return COPY.columnType?.[label] ?? label;
}

/** M7-C S01:可见性逐字符走 COPY.visibility 展开、`·` 连接;未知字符原样保留。 */
function visibilityLabel(visibility: string): string {
  return [...visibility].map((char) => COPY.visibility?.[char] ?? char).join("·");
}

/** §6 列头两行文本:`name * 🔒` / `类型中文名 · 可见性中文名`(M7-C S01 中文化)。 */
function headerText(column: TableColumn): string {
  const type = localizedTypeLabel(column);
  const second = column.visibility ? `${type} · ${visibilityLabel(column.visibility)}` : type;
  return `${headerFirstLine(column)}\n${second}`;
}

/**
 * M7-C S02:显示宽度按码点计,ASCII 码点记 1,CJK/全角/emoji 等非 ASCII 码点记 2
 * (🔒 等增补平面字符经 for...of 取到完整码点)。
 */
function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += (char.codePointAt(0) ?? 0) < 0x80 ? 1 : 2;
  }
  return width;
}

/**
 * M7-C S02:列宽按列头第一行自适应 `clamp(112, ceil(width * 8) + 34, 240)`,
 * 目标是 `cooldown_frames *` 这类首行在默认缩放下单行不折(WRAP 仍兜底超长列名)。
 * 下限 112 已覆盖 id 列旧的三元式下限 110(它带 `*` 与 🔒)。
 */
export function columnWidth(column: TableColumn): number {
  const raw = Math.ceil(textWidth(headerFirstLine(column)) * 8) + 34;
  return Math.min(240, Math.max(112, raw));
}

/** §6 列头 title:完整列名 / 类型 / 默认值 / 范围 / 枚举 / 可见性(TableColumn 暂无描述字段,待 Host 补)。 */
function headerTitleText(column: TableColumn): string {
  const labels = COPY.inspector.constraintLabels;
  const parts: string[] = [
    COPY.grid.fullColumnName?.(column.name) ?? column.name,
    `${labels.type} ${columnTypeLabel(column)}`,
  ];
  if (column.required === true) {
    parts.push(labels.required);
  }
  if (column.default !== undefined) {
    parts.push(`${labels.default} ${String(column.default)}`);
  }
  const options = enumOptions(column);
  if (options.length) {
    parts.push(`${labels.enum} ${options.join(" / ")}`);
  }
  if (column.minimum !== undefined || column.maximum !== undefined) {
    const min = column.minimum !== undefined ? `≥${column.minimum}` : undefined;
    const max = column.maximum !== undefined ? `≤${column.maximum}` : undefined;
    parts.push(`${labels.range} ${[min, max].filter(Boolean).join(" 且 ")}`);
  }
  if (column.visibility) {
    parts.push(`${labels.visibility} ${column.visibility}`);
  }
  return parts.join(" · ");
}

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

export interface BuildCellOptions {
  /**
   * 快照路径(整表加载)无 mutation 合并,空值保持省略 v;
   * 写路径默认显式 v: null,Univer 的 set-range-values 合并才会清掉旧值(评审 P2-1)。
   */
  snapshot?: boolean;
  /** 脏格(§6):custom.lumio.dirty + 脏底色 + 渲染层右上三角。 */
  dirty?: boolean;
  /** 删除行(§6):整行删除线 + 淡红底;token 提取侧仍跳过该行。 */
  deletedRow?: boolean;
}

export function buildCell(
  token: CellToken,
  column: TableColumn,
  rowKey: string,
  options?: BuildCellOptions,
): WorkbookCell {
  const readOnly = column.readOnly === true || column.name === "id";
  const { v, forceString } = displayValue(token, column, rowKey);
  const badge = badgeFor(token.state);
  const invalid = token.state === "value" && numberOutOfRange(column, token.raw);
  const flags: CellStyleFlags = {
    dirty: options?.dirty,
    newRow: rowKey.startsWith("draft:"),
    deletedRow: options?.deletedRow,
  };
  const cell: WorkbookCell = {
    s: styleIdFor(token.state, readOnly, flags),
    custom: writeLumioCustom({
      state: token.state,
      raw: token.raw,
      effective: token.effective,
      column: column.name,
      rowKey,
      badge,
      draftId: column.name === "id" && rowKey.startsWith("draft:"),
      dirty: options?.dirty,
      invalid,
    }),
  };
  if (v !== undefined) {
    cell.v = v;
  } else if (!options?.snapshot) {
    // Univer ICellData.v 为 Nullable<CellValue>;本地 WorkbookCell 镜像未含 null,
    // 写路径在此显式置空以清画布旧文本(四态徽标仍只进 custom.lumio.badge)。
    (cell as { v?: string | number | boolean | null }).v = null;
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
  // 无效(红波浪 + `!`)优先于行级视觉:越界值即使在脏格/新行上也得红出来。
  if (invalid) {
    cell.s = "invalid";
  }
  return cell;
}

export interface BuildWorkbookOptions {
  refOptions?: Record<string, string[]>;
  /** 仓库底稿 token,脏格判定基准;缺省视为无脏格(纯快照路径)。 */
  baseCells?: Record<string, Record<string, CellToken>>;
  /** 已删除行 key 集(§6:显示删除线行;extractTokens/buildDraft 仍跳过)。 */
  deleted?: Set<string>;
}

export function buildWorkbook(
  table: TableResponse,
  options?: BuildWorkbookOptions,
): { workbook: WorkbookData; map: ProjectionMap } {
  const columns = table.columns.map((column) => column.name);
  const rowKeys = table.rows.map((row) => String(row.id));
  const baseCells = tokensFromTable(table);
  const map: ProjectionMap = {
    table: table.table,
    baseFingerprint: table.sourceFingerprint,
    columns,
    rowKeys,
    baseCells,
    currentCells: JSON.parse(JSON.stringify(baseCells)) as Record<string, Record<string, CellToken>>,
    deleted: new Set<string>(),
  };
  const deleted = options?.deleted ?? map.deleted;

  const cellData: WorksheetData["cellData"] = {};
  const headerRow: Record<string, WorkbookCell> = {};
  table.columns.forEach((column, colIndex) => {
    headerRow[String(colIndex)] = {
      v: headerText(column),
      t: 1,
      s: "header",
      custom: { lumio: { headerTitle: headerTitleText(column) } },
    };
  });
  cellData[String(HEADER_ROW)] = headerRow;

  table.rows.forEach((row, rowIndex) => {
    const rowKey = String(row.id);
    const sheetRow = rowIndex + 1;
    const isNew = rowKey.startsWith("draft:");
    const isDeleted = deleted.has(rowKey);
    const baseRow = options?.baseCells?.[rowKey];
    const line: Record<string, WorkbookCell> = {};
    table.columns.forEach((column, colIndex) => {
      const token = baseCells[rowKey]?.[column.name] ?? {
        state: "missing" as const,
        raw: "@missing",
        effective: null,
      };
      const base = isNew || isDeleted ? undefined : baseRow?.[column.name];
      const dirty = base !== undefined && !tokenEqual(token, base);
      line[String(colIndex)] = buildCell(token, column, rowKey, {
        snapshot: true,
        dirty,
        deletedRow: isDeleted,
      });
    });
    cellData[String(sheetRow)] = line;
  });

  // §3 空行策略:rowCount = rows + 3;首空行 name 格占位文案只进
  // custom.lumio.placeholder(渲染层画),不写 v、不进 token。
  const nameColIndex = table.columns.findIndex((column) => column.name === "name");
  if (nameColIndex >= 0) {
    const placeholderRow = cellData[String(table.rows.length + 1)] ?? {};
    placeholderRow[String(nameColIndex)] = {
      s: "placeholder",
      custom: { lumio: { placeholder: COPY.grid.placeholderNewRow } },
    };
    cellData[String(table.rows.length + 1)] = placeholderRow;
  }

  const columnData: WorksheetData["columnData"] = {};
  table.columns.forEach((column, colIndex) => {
    columnData[String(colIndex)] = { w: columnWidth(column) };
  });

  const sheet: WorksheetData = {
    id: table.table,
    name: table.table,
    rowCount: table.rows.length + 3,
    columnCount: Math.max(table.columns.length, 1),
    defaultColumnWidth: 120,
    defaultRowHeight: 24,
    rowData: { "0": { h: 36 } },
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

  // §3:空行不写 dataValidation——下拉/范围规则截到最后一个数据行。
  const lastDataRow = Math.max(1, table.rows.length);
  const rules = (table.rows.length === 0 ? [] : validationRules(table, options?.refOptions ?? {})).map(
    (rule) => ({
      ...rule,
      ranges: rule.ranges.map((range) => ({ ...range, endRow: Math.min(range.endRow, lastDataRow) })),
    }),
  );

  const workbook: WorkbookData = {
    id: `lumio-${table.table}`,
    name: table.table,
    appVersion: APP_VERSION,
    locale: "zhCN",
    styles: STYLES,
    sheetOrder: [table.table],
    sheets: { [table.table]: sheet },
    resources: [
      {
        name: "SHEET_DATA_VALIDATION_PLUGIN",
        data: JSON.stringify({ [table.table]: rules }),
      },
    ],
  };

  return { workbook, map };
}

function asDraftCell(value: DraftCell | string | undefined): CellToken | undefined {
  if (!value || typeof value === "string") {
    return undefined;
  }
  return { state: value.state, raw: value.raw, effective: value.effective };
}

export function applyDraft(
  table: TableResponse,
  draft: Draft | undefined,
): { table: TableResponse; stale: boolean } {
  if (!draft) {
    return { table, stale: false };
  }
  if (draft.baseFingerprint !== table.sourceFingerprint) {
    return { table, stale: true };
  }
  const deleted = new Set(draft.deleted ?? []);
  const renamed = draft.renamed ?? {};
  const rows: TableRow[] = [];
  for (const row of table.rows) {
    const key = String(row.id);
    if (deleted.has(key)) {
      continue;
    }
    const patch = draft.rows[key] ?? {};
    const nextName = renamed[key] ?? (typeof patch.name === "string" ? patch.name : row.name);
    const cells = { ...row.cells };
    for (const [column, value] of Object.entries(patch)) {
      if (column === "name") {
        continue;
      }
      const token = asDraftCell(value);
      if (token) {
        cells[column] = token;
      }
    }
    rows.push({ id: row.id, name: nextName, cells });
  }
  for (const [key, patch] of Object.entries(draft.rows)) {
    if (!key.startsWith("draft:")) {
      continue;
    }
    const cells: Record<string, CellToken> = {};
    let name = "";
    for (const [column, value] of Object.entries(patch)) {
      if (column === "name" && typeof value === "string") {
        name = value;
        continue;
      }
      const token = asDraftCell(value);
      if (token) {
        cells[column] = token;
      }
    }
    rows.push({ id: key, name, cells });
  }
  return { table: { ...table, rows }, stale: false };
}

/**
 * §6 删除行要「删除线 + 淡红底」地显示在原位(检查器/右键可撤销删除),而
 * applyDraft 的契约是过滤删除行(tests/applyDraft.test.ts 锁定)。因此在这里
 * 把仓库底稿的删除行按原位拼回显示表——token 提取与草稿构造照旧跳过它们。
 */
function reinsertDeletedRows(
  warehouse: TableResponse,
  applied: TableResponse,
  deleted: Set<string>,
): TableResponse {
  if (!deleted.size) {
    return applied;
  }
  const appliedByKey = new Map(applied.rows.map((row) => [String(row.id), row]));
  const warehouseKeys = new Set(warehouse.rows.map((row) => String(row.id)));
  const rows: TableRow[] = [];
  for (const row of warehouse.rows) {
    const key = String(row.id);
    if (deleted.has(key)) {
      rows.push(row);
      continue;
    }
    const patched = appliedByKey.get(key);
    if (patched) {
      rows.push(patched);
    }
  }
  for (const row of applied.rows) {
    const key = String(row.id);
    if (!warehouseKeys.has(key) && !deleted.has(key)) {
      rows.push(row);
    }
  }
  return { ...applied, rows };
}

export function workbookFromWarehouse(
  warehouse: TableResponse,
  overlay: Draft | undefined,
  options?: { refOptions?: Record<string, string[]> },
): { workbook: WorkbookData; map: ProjectionMap; displayed: TableResponse } {
  const usable = overlay
    ? { ...overlay, baseFingerprint: warehouse.sourceFingerprint }
    : undefined;
  const applied = usable ? applyDraft(warehouse, usable) : { table: warehouse, stale: false };
  const deleted = new Set(usable?.deleted ?? []);
  const displayed = reinsertDeletedRows(warehouse, applied.table, deleted);
  const baseCells = tokensFromTable(warehouse);
  const { workbook, map } = buildWorkbook(displayed, {
    refOptions: options?.refOptions,
    baseCells,
    deleted,
  });
  map.baseCells = baseCells;
  map.baseFingerprint = warehouse.sourceFingerprint;
  if (usable) {
    map.deleted = new Set(usable.deleted ?? []);
  }
  return { workbook, map, displayed };
}

export function applyRebase(
  table: TableResponse,
  map: ProjectionMap,
  result: RebaseResponse,
): { table: TableResponse; map: ProjectionMap } {
  const warehouse = { ...table, sourceFingerprint: result.baseFingerprint || table.sourceFingerprint };
  map.baseFingerprint = warehouse.sourceFingerprint;
  map.baseCells = tokensFromTable(warehouse);
  map.conflicts = result.conflicts ?? [];
  const conflictKeys = new Set(map.conflicts.map((item) => `${item.rowId ?? ""}:${item.column}`));
  const filteredRows: Draft["rows"] = {};
  for (const [rowKey, cells] of Object.entries(result.draft?.rows ?? {})) {
    const next: Record<string, DraftCell | string> = {};
    for (const [column, value] of Object.entries(cells)) {
      if (!conflictKeys.has(`${rowKey}:${column}`)) {
        next[column] = value;
      }
    }
    if (Object.keys(next).length) {
      filteredRows[rowKey] = next;
    }
  }
  const overlay: Draft = {
    ...result.draft,
    table: result.draft?.table ?? table.table,
    baseFingerprint: warehouse.sourceFingerprint,
    draftVersion: result.draftVersion,
    rows: filteredRows,
    renamed: result.ok ? result.draft?.renamed : {},
    deleted: result.ok ? result.draft?.deleted : [],
  };
  const applied = applyDraft(warehouse, overlay);
  map.deleted = new Set(overlay.deleted ?? []);
  const keys = applied.table.rows.map((row) => String(row.id));
  for (const key of keys) {
    if (!map.rowKeys.includes(key)) {
      map.rowKeys.push(key);
    }
  }
  map.rowKeys = map.rowKeys.filter(
    (key) => key.startsWith("draft:") || keys.includes(key) || (map.conflicts ?? []).some((item) => item.rowId === key),
  );
  return { table: applied.table, map };
}

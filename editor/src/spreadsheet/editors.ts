import type { TableColumn, TableResponse } from "../api/types";

export type EditorKind = "enum" | "ref" | "number" | "bool" | "text";

const NUMBER_TYPES = new Set(["i32", "i64", "u32", "u64", "fixed", "f32", "f64"]);

export const ADD_VALIDATION_COMMAND = "sheet.command.addDataValidation";

export interface SheetValidationRule {
  uid: string;
  type: string;
  formula1?: string;
  formula2?: string;
  operator?: string;
  ranges: Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>;
  showDropDown?: boolean;
  allowBlank?: boolean;
  errorStyle?: number;
  showErrorMessage?: boolean;
  error?: string;
}

export function editorKind(column: TableColumn): EditorKind {
  if (column.type === "enum") {
    return "enum";
  }
  if (column.type === "ref") {
    return "ref";
  }
  if (column.type === "bool") {
    return "bool";
  }
  if (NUMBER_TYPES.has(column.type)) {
    return "number";
  }
  return "text";
}

export function numberOutOfRange(column: TableColumn, raw: string): boolean {
  if (!NUMBER_TYPES.has(column.type)) {
    return false;
  }
  if (raw === "" || raw === "null" || raw === "@default" || raw === "@missing") {
    return false;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return true;
  }
  if (column.minimum !== undefined && value < column.minimum) {
    return true;
  }
  if (column.maximum !== undefined && value > column.maximum) {
    return true;
  }
  return false;
}

export function enumOptions(column: TableColumn): string[] {
  if (column.enumValues && column.enumValues.length) {
    return column.enumValues;
  }
  const extra = (column as { enum?: string[] }).enum;
  return Array.isArray(extra) ? extra : [];
}

export function editorKinds(table: TableResponse): Record<string, EditorKind> {
  const out: Record<string, EditorKind> = {};
  for (const column of table.columns) {
    out[column.name] = editorKind(column);
  }
  return out;
}

export function validationRules(
  table: TableResponse,
  refOptions: Record<string, string[]> = {},
): SheetValidationRule[] {
  const rules: SheetValidationRule[] = [];
  table.columns.forEach((column, colIndex) => {
    const kind = editorKind(column);
    // ADR 0004 空行策略:DV 只挂数据行 + 3 空行,不再铺满万行。
    const ranges = [
      {
        startRow: 1,
        startColumn: colIndex,
        endRow: table.rows.length + 3,
        endColumn: colIndex,
      },
    ];
    if (kind === "enum") {
      rules.push({
        uid: `lumio-enum-${column.name}`,
        type: "list",
        formula1: enumOptions(column).join(","),
        ranges,
        showDropDown: true,
        allowBlank: true,
      });
    } else if (kind === "ref") {
      const names = refOptions[column.refTarget ?? ""] ?? [];
      rules.push({
        uid: `lumio-ref-${column.name}`,
        type: "list",
        formula1: names.join(","),
        ranges,
        showDropDown: true,
        allowBlank: true,
      });
    } else if (kind === "bool") {
      rules.push({
        uid: `lumio-bool-${column.name}`,
        type: "checkbox",
        ranges,
        allowBlank: true,
      });
    } else if (kind === "number" && (column.minimum !== undefined || column.maximum !== undefined)) {
      rules.push({
        uid: `lumio-num-${column.name}`,
        type: "decimal",
        operator: "between",
        formula1: String(column.minimum ?? Number.MIN_SAFE_INTEGER),
        formula2: String(column.maximum ?? Number.MAX_SAFE_INTEGER),
        ranges,
        allowBlank: true,
        errorStyle: 0,
        showErrorMessage: true,
        error: "超出范围，已暂存",
      });
    }
  });
  return rules;
}

export async function applyEditors(
  univerAPI: unknown,
  table: TableResponse,
  refOptions: Record<string, string[]> = {},
): Promise<number> {
  const api = univerAPI as {
    executeCommand?: (id: string, params?: object) => unknown;
    getActiveWorkbook?: () => { getId?: () => string } | null;
  };
  const execute = api.executeCommand;
  if (!execute) {
    return 0;
  }
  const unitId = api.getActiveWorkbook?.()?.getId?.() ?? `lumio-${table.table}`;
  let applied = 0;
  for (const rule of validationRules(table, refOptions)) {
    try {
      await execute(ADD_VALIDATION_COMMAND, { unitId, subUnitId: table.table, rule });
      applied += 1;
    } catch {
      /* Univer may reject duplicate rules on reload; kinds still expose the editor. */
    }
  }
  return applied;
}

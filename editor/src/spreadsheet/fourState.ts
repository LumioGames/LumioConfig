import type { CellToken, TableColumn } from "../api/types";

export type FourStateKind = "empty" | "null" | "default" | "missing";

export function canSetMissing(column: TableColumn): boolean {
  return column.required !== true;
}

export function tokenForMenu(kind: FourStateKind, column: TableColumn): CellToken | null {
  if (kind === "missing" && !canSetMissing(column)) {
    return null;
  }
  if (kind === "empty") {
    return { state: "empty", raw: '""', effective: "" };
  }
  if (kind === "null") {
    return { state: "null", raw: "null", effective: null };
  }
  if (kind === "default") {
    return { state: "default", raw: "@default", effective: column.default ?? null };
  }
  return { state: "missing", raw: "@missing", effective: null };
}

export function tokenForDeleteKey(column: TableColumn): { token: CellToken | null; hint?: string } {
  if (column.default !== undefined) {
    return { token: tokenForMenu("default", column) };
  }
  if (!column.required) {
    return { token: tokenForMenu("null", column) };
  }
  return { token: null, hint: "required 列不能清空" };
}

export const FOUR_STATE_MENU = [
  { kind: "empty" as const, label: "设为空字符串" },
  { kind: "null" as const, label: "设为 null" },
  { kind: "default" as const, label: "恢复默认" },
  { kind: "missing" as const, label: "设为缺列" },
];

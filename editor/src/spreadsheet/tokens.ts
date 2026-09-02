import type { CellDiff, CellToken, TableResponse } from "../api/types";

export function tokensFromTable(table: TableResponse): Record<string, Record<string, CellToken>> {
  const out: Record<string, Record<string, CellToken>> = {};
  for (const row of table.rows) {
    const rowKey = String(row.id);
    const cells: Record<string, CellToken> = {};
    for (const column of table.columns) {
      if (column.name === "id") {
        if (rowKey.startsWith("draft:")) {
          cells.id = { state: "value", raw: "", effective: null };
        } else {
          cells.id = { state: "value", raw: String(row.id), effective: row.id };
        }
      } else if (column.name === "name") {
        cells.name = { state: "value", raw: row.name, effective: row.name };
      } else {
        const cell = row.cells[column.name];
        cells[column.name] = cell
          ? { state: cell.state, raw: cell.raw, effective: cell.effective }
          : { state: "missing", raw: "@missing", effective: null };
      }
    }
    out[rowKey] = cells;
  }
  return out;
}

export function tokenEqual(a?: CellToken, b?: CellToken): boolean {
  if (a === undefined && b === undefined) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  return a.state === b.state && a.raw === b.raw && effectiveEqual(a.effective, b.effective);
}

function effectiveEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null && b === undefined) {
    return true;
  }
  if (a === undefined && b === null) {
    return true;
  }
  return false;
}

export function diffTokens(
  actual: Record<string, Record<string, CellToken>>,
  expected: Record<string, Record<string, CellToken>>,
): CellDiff[] {
  const diffs: CellDiff[] = [];
  const rowKeys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const rowKey of [...rowKeys].sort()) {
    const actualRow = actual[rowKey] ?? {};
    const expectedRow = expected[rowKey] ?? {};
    const columns = new Set([...Object.keys(actualRow), ...Object.keys(expectedRow)]);
    for (const column of [...columns].sort()) {
      if (!tokenEqual(actualRow[column], expectedRow[column])) {
        diffs.push({
          rowKey,
          column,
          expected: expectedRow[column],
          actual: actualRow[column],
        });
      }
    }
  }
  return diffs;
}

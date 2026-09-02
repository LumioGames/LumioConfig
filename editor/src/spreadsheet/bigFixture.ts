import type { CellState, CellToken, TableColumn, TableResponse, TableRow } from "../api/types";

export const BIG_TABLE = "big";
export const BIG_ROWS = 10_000;
export const BIG_COLS = 50;

const STATES: CellState[] = ["value", "empty", "null", "default", "missing"];
const CJK = ["你好", "火球", "冰箭", "配置表", "合入时发号"];
const EMOJI = ["🔥", "❄️", "⚡", "🧪", "🎯"];

function columnName(index: number): string {
  if (index === 0) {
    return "id";
  }
  if (index === 1) {
    return "name";
  }
  return `c${String(index).padStart(2, "0")}`;
}

function cellFor(state: CellState, row: number, col: number): CellToken {
  if (state === "empty") {
    return { state, raw: '""', effective: "" };
  }
  if (state === "null") {
    return { state, raw: "null", effective: null };
  }
  if (state === "default") {
    return { state, raw: "@default", effective: "d" };
  }
  if (state === "missing") {
    return { state, raw: "@missing", effective: null };
  }
  const kind = (row + col) % 4;
  if (kind === 0) {
    const text = `${CJK[row % CJK.length]}${EMOJI[col % EMOJI.length]}`;
    return { state, raw: text, effective: text };
  }
  if (kind === 1) {
    const n = (row * 50 + col) % 1000;
    return { state, raw: String(n), effective: n };
  }
  if (kind === 2) {
    const text = CJK[col % CJK.length] ?? "你好";
    return { state, raw: text, effective: text };
  }
  const text = EMOJI[row % EMOJI.length] ?? "🔥";
  return { state, raw: text, effective: text };
}

export function buildBigFixture(rowCount = BIG_ROWS, colCount = BIG_COLS): TableResponse {
  const columns: TableColumn[] = [];
  for (let i = 0; i < colCount; i += 1) {
    const name = columnName(i);
    columns.push({
      name,
      type: i === 0 ? "u32" : "string",
      required: i < 2,
      visibility: "SCV",
      readOnly: i === 0,
      default: i >= 2 ? "d" : undefined,
    });
  }

  const rows: TableRow[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const cells: Record<string, CellToken> = {};
    for (let c = 2; c < colCount; c += 1) {
      const state = STATES[(r + c) % STATES.length] ?? "value";
      cells[columnName(c)] = cellFor(state, r, c);
    }
    rows.push({
      id: 800000 + r,
      name: `r${String(r).padStart(5, "0")}`,
      cells,
    });
  }

  return {
    table: BIG_TABLE,
    sourceFingerprint: "sha256:poc-big-10k-50",
    columns,
    rows,
  };
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIG_ROWS = 10_000;
const BIG_COLS = 50;
const STATES = ["value", "empty", "null", "default", "missing"];
const CJK = ["你好", "火球", "冰箭", "配置表", "合入时发号"];
const EMOJI = ["🔥", "❄️", "⚡", "🧪", "🎯"];

function columnName(index) {
  if (index === 0) return "id";
  if (index === 1) return "name";
  return `c${String(index).padStart(2, "0")}`;
}

function cellFor(state, row, col) {
  if (state === "empty") return { state, raw: '""', effective: "" };
  if (state === "null") return { state, raw: "null", effective: null };
  if (state === "default") return { state, raw: "@default", effective: "d" };
  if (state === "missing") return { state, raw: "@missing", effective: null };
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
    const text = CJK[col % CJK.length];
    return { state, raw: text, effective: text };
  }
  const text = EMOJI[row % EMOJI.length];
  return { state, raw: text, effective: text };
}

export function buildBigFixture(rowCount = BIG_ROWS, colCount = BIG_COLS) {
  const columns = [];
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
  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    const cells = {};
    for (let c = 2; c < colCount; c += 1) {
      cells[columnName(c)] = cellFor(STATES[(r + c) % STATES.length], r, c);
    }
    rows.push({
      id: 800000 + r,
      name: `r${String(r).padStart(5, "0")}`,
      cells,
    });
  }
  return {
    table: "big",
    sourceFingerprint: "sha256:poc-big-10k-50",
    columns,
    rows,
  };
}

function isMain() {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return path.normalize(self) === path.normalize(invoked);
}

if (isMain()) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const out = path.join(root, "fixtures", "big-10k-50.json");
  const started = Date.now();
  const fixture = buildBigFixture();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(fixture));
  const stat = fs.statSync(out);
  console.log(
    `wrote ${out} rows=${fixture.rows.length} cols=${fixture.columns.length} bytes=${stat.size} ms=${Date.now() - started}`,
  );
}

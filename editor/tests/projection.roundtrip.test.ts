import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TableResponse } from "../src/api/types";
import { buildBigFixture } from "../src/spreadsheet/bigFixture";
import { extractTokens } from "../src/spreadsheet/extract";
import { buildWorkbook } from "../src/spreadsheet/projection";
import { diffTokens, tokensFromTable } from "../src/spreadsheet/tokens";
import type { WorkbookData } from "../src/spreadsheet/workbook-types";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function loadJson(name: string): TableResponse {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8")) as TableResponse;
}

function roundTrip(table: TableResponse) {
  const { workbook, map } = buildWorkbook(table);
  const extracted = extractTokens(workbook, map);
  return { workbook, map, extracted, expected: tokensFromTable(table) };
}

function applyViewOnlyOps(workbook: WorkbookData, table: string): void {
  const sheet = workbook.sheets[table];
  if (!sheet) {
    throw new Error(`missing sheet ${table}`);
  }
  sheet.freeze = { xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 };
  sheet.zoomRatio = 0.75;
  sheet.columnData = sheet.columnData ?? {};
  sheet.columnData["3"] = { ...(sheet.columnData["3"] ?? {}), w: 240 };
  sheet.columnData["4"] = { ...(sheet.columnData["4"] ?? {}), hd: 1 };

  const rows = Object.entries(sheet.cellData)
    .filter(([index]) => Number(index) > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]));
  if (rows.length >= 2) {
    const rebuilt: typeof sheet.cellData = { "0": sheet.cellData["0"] ?? {} };
    rows.forEach(([_, row], order) => {
      rebuilt[String(order + 1)] = row;
    });
    sheet.cellData = rebuilt;
  }
}

describe("buildWorkbook → extractTokens", () => {
  it.each(["skills.json", "effects.json", "drops.json"] as const)(
    "round-trips %s with an empty cell diff",
    (file) => {
      const table = loadJson(file);
      const { extracted, expected } = roundTrip(table);
      expect(diffTokens(extracted, expected)).toEqual([]);
    },
  );

  it("round-trips the generated 10k×50 fixture with an empty cell diff", () => {
    const table = buildBigFixture();
    expect(table.rows).toHaveLength(10_000);
    expect(table.columns).toHaveLength(50);
    const { extracted, expected, map } = roundTrip(table);
    expect(map.rowKeys).toHaveLength(10_000);
    expect(diffTokens(extracted, expected)).toEqual([]);
  });

  it("keeps an empty diff after view-only sort/filter/freeze/width/hide/zoom", () => {
    const table = loadJson("skills.json");
    const { workbook, map, expected } = roundTrip(table);
    applyViewOnlyOps(workbook, table.table);
    const extracted = extractTokens(workbook, map);
    expect(diffTokens(extracted, expected)).toEqual([]);
  });

  it("does not write four-state badges into cell values", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const sheet = workbook.sheets.skills;
    const demo = sheet?.cellData?.["3"];
    const displayName = demo?.["2"];
    const effect = demo?.["3"];
    const cooldown = demo?.["5"];
    expect(displayName?.v).toBeUndefined();
    expect(effect?.v).toBeUndefined();
    expect(cooldown?.v).toBeUndefined();
    expect(displayName?.custom?.lumio).toMatchObject({ state: "empty", raw: '""' });
  });

  it("does not put four-state badges into extracted raw tokens", () => {
    const table = loadJson("skills.json");
    const { extracted } = roundTrip(table);
    const demo = extracted["40090"];
    expect(demo?.display_name).toEqual({ state: "empty", raw: '""', effective: "" });
    expect(demo?.effect_id).toEqual({ state: "null", raw: "null", effective: null });
    expect(demo?.damage).toEqual({ state: "default", raw: "@default", effective: 0 });
    expect(demo?.cooldown_frames).toEqual({ state: "missing", raw: "@missing", effective: null });
    expect(demo?.icon?.raw).toBe("火球🔥");
  });
});

import { describe, expect, it } from "vitest";
import type { Draft, TableResponse } from "../src/api/types";
import { applyDraft, buildWorkbook } from "../src/spreadsheet/projection";
import { buildDraft, countDirty, extractTokens } from "../src/spreadsheet/extract";
import { tokenEqual } from "../src/spreadsheet/tokens";
import skills from "../fixtures/skills.json";

const table = skills as TableResponse;

describe("buildDraft", () => {
  it("records only changed cells and draft rows, never view state", () => {
    const { workbook, map } = buildWorkbook(table);
    const tokens = extractTokens(workbook, map);
    tokens["40001"] = {
      ...tokens["40001"],
      damage: { state: "value", raw: "130", effective: 130 },
    };
    const draft = buildDraft("skills", map, tokens, 0);
    expect(draft.rows["40001"]).toEqual({
      damage: { state: "value", raw: "130", effective: 130 },
    });
    expect(draft).not.toHaveProperty("zoom");
    expect(draft).not.toHaveProperty("columnWidths");
    expect(countDirty(map, tokens)).toBeGreaterThan(0);
    const baseline = extractTokens(workbook, map);
    expect(countDirty(map, baseline)).toBe(0);
  });

  it("round-trips applyDraft for matching fingerprints", () => {
    const draft: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 1,
      rows: {
        "40001": { damage: { state: "value", raw: "130", effective: 130 } },
        "draft:abcd1234": { name: "ice_lance" },
      },
      deleted: ["40002"],
    };
    const applied = applyDraft(table, draft);
    const { workbook, map } = buildWorkbook(applied.table);
    const tokens = extractTokens(workbook, map);
    expect(tokens["40001"].damage.raw).toBe("130");
    expect(tokenEqual(tokens["40001"].display_name, table.rows[0]?.cells.display_name)).toBe(true);
  });
});

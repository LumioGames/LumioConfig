import { describe, expect, it } from "vitest";
import type { Draft, RebaseResponse, TableResponse } from "../src/api/types";
import { countDirty, extractTokens } from "../src/spreadsheet/extract";
import { applyRebase, buildWorkbook, workbookFromWarehouse } from "../src/spreadsheet/projection";
import skills from "../fixtures/skills.json";

const table = skills as TableResponse;

describe("workbookFromWarehouse", () => {
  it("keeps warehouse tokens as baseCells so overlay stays dirty", () => {
    const overlay: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 2,
      rows: {
        "40001": { damage: { state: "value", raw: "133", effective: 133 } },
      },
    };
    const { map, workbook } = workbookFromWarehouse(table, overlay);
    expect(map.baseCells["40001"]?.damage.raw).toBe("120");
    const tokens = extractTokens(workbook, map);
    expect(tokens["40001"]?.damage.raw).toBe("133");
    expect(countDirty(map, tokens)).toBeGreaterThan(0);
  });
});

describe("applyRebase", () => {
  it("advances baseFingerprint and keeps draft cells that are not conflicts", () => {
    const { map } = buildWorkbook(table);
    const draft: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 2,
      rows: {
        "40001": { damage: { state: "value", raw: "130", effective: 130 } },
      },
    };
    const result: RebaseResponse = {
      ok: true,
      draft: { ...draft, baseFingerprint: "sha256:new" },
      conflicts: [],
      baseFingerprint: "sha256:new",
      merged: 1,
      draftVersion: 3,
    };
    const nextTable = { ...table, sourceFingerprint: "sha256:new" };
    const applied = applyRebase(nextTable, map, result);
    expect(map.baseFingerprint).toBe("sha256:new");
    expect(applied.table.rows[0]?.cells.damage?.raw).toBe("130");
    expect(map.conflicts).toEqual([]);
  });

  it("leaves conflict columns on the warehouse value", () => {
    const { map } = buildWorkbook(table);
    const result: RebaseResponse = {
      ok: false,
      draft: {
        table: "skills",
        baseFingerprint: "old",
        draftVersion: 1,
        rows: {
          "40001": { damage: { state: "value", raw: "130", effective: 130 } },
        },
      },
      conflicts: [
        {
          table: "skills",
          row: "fireball",
          column: "damage",
          code: "STALE_BASELINE",
          message: "conflict",
          suggestion: "pick",
          base: "120",
          current: "140",
          draft: "130",
          rowId: "40001",
        },
      ],
      baseFingerprint: table.sourceFingerprint,
      merged: 0,
      draftVersion: 1,
    };
    const applied = applyRebase(table, map, result);
    expect(applied.table.rows[0]?.cells.damage?.raw).toBe("120");
    expect(map.conflicts?.[0]?.code).toBe("STALE_BASELINE");
  });
});

import { describe, expect, it } from "vitest";
import { applyDraft, buildWorkbook } from "../src/spreadsheet/projection";
import { extractTokens } from "../src/spreadsheet/extract";
import skills from "../fixtures/skills.json";
import type { Draft, TableResponse } from "../src/api/types";

const table = skills as TableResponse;

describe("applyDraft", () => {
  it("applies cell edits when fingerprints match and marks stale otherwise", () => {
    const draft: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 1,
      rows: {
        "40001": { damage: { state: "value", raw: "130", effective: 130 } },
        "draft:abcd1234": {
          name: "ice_lance",
          display_name: { state: "value", raw: "Ice Lance", effective: "Ice Lance" },
        },
      },
      deleted: ["40002"],
    };
    const applied = applyDraft(table, draft);
    expect(applied.stale).toBe(false);
    expect(applied.table.rows.some((row) => row.name === "frostbolt")).toBe(false);
    expect(applied.table.rows.some((row) => String(row.id) === "draft:abcd1234")).toBe(true);
    const fireball = applied.table.rows.find((row) => row.name === "fireball");
    expect(fireball?.cells.damage.raw).toBe("130");
    const { workbook, map } = buildWorkbook(applied.table);
    const tokens = extractTokens(workbook, map);
    expect(tokens["40001"].damage.raw).toBe("130");
    expect(tokens["draft:abcd1234"].id.raw).toBe("");
    expect(applyDraft(table, { ...draft, baseFingerprint: "other" }).stale).toBe(true);
  });
});

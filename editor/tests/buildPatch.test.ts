import { describe, expect, it } from "vitest";
import type { CellToken, TableResponse } from "../src/api/types";
import { buildPatch } from "../src/spreadsheet/extract";
import { buildWorkbook } from "../src/spreadsheet/projection";
import { tokensFromTable } from "../src/spreadsheet/tokens";
import skills from "../fixtures/skills.json";

const table = skills as TableResponse;

function setup(mutate?: (tokens: Record<string, Record<string, CellToken>>) => void) {
  const { map } = buildWorkbook(table);
  const tokens = tokensFromTable(table);
  mutate?.(tokens);
  return { map, tokens, patch: buildPatch(map, tokens) };
}

describe("buildPatch", () => {
  it("emits empty ops when tokens match the baseline", () => {
    const { patch, map } = setup();
    expect(patch.table).toBe("skills");
    expect(patch.base).toEqual({ sourceFingerprint: map.baseFingerprint });
    expect(patch.ops).toEqual([]);
  });

  it("converts four-state tokens into set/expect values", () => {
    const { patch } = setup((tokens) => {
      tokens["40001"] = {
        ...tokens["40001"],
        display_name: { state: "empty", raw: '""', effective: "" },
        damage: { state: "default", raw: "@default", effective: 0 },
        icon: { state: "missing", raw: "@missing", effective: null },
      };
      tokens["40002"] = {
        ...tokens["40002"],
        display_name: { state: "null", raw: "null", effective: null },
      };
    });
    const updateFire = patch.ops.find((op) => op.op === "update" && op.name === "fireball");
    const updateFrost = patch.ops.find((op) => op.op === "update" && op.name === "frostbolt");
    expect(updateFire?.set).toEqual({ display_name: "", damage: "@default" });
    expect(updateFire?.set).not.toHaveProperty("icon");
    expect(updateFire?.expect).toEqual({
      display_name: "Fireball",
      damage: "120",
      icon: "fx_fireball",
    });
    expect(updateFrost?.set).toEqual({ display_name: null });
    expect(updateFrost?.expect?.display_name).toBe("Frostbolt");
  });

  it("emits rename, delete, create, and folds draft create+delete", () => {
    const { map } = buildWorkbook(table);
    const tokens = tokensFromTable(table);
    tokens["40001"] = { ...tokens["40001"], name: { state: "value", raw: "fire_ball", effective: "fire_ball" } };
    map.deleted.add("40002");
    map.rowKeys = map.rowKeys.filter((key) => key !== "40002");
    map.rowKeys.push("draft:abcd1234");
    tokens["draft:abcd1234"] = {
      id: { state: "value", raw: "", effective: null },
      name: { state: "value", raw: "ice_lance", effective: "ice_lance" },
      display_name: { state: "value", raw: "Ice Lance", effective: "Ice Lance" },
      effect_id: { state: "value", raw: "chill", effective: "chill" },
      damage: { state: "value", raw: "40", effective: 40 },
      cooldown_frames: { state: "value", raw: "60", effective: 60 },
      icon: { state: "value", raw: "fx_ice", effective: "fx_ice" },
      element: { state: "missing", raw: "@missing", effective: null },
      enabled: { state: "missing", raw: "@missing", effective: null },
    };
    map.deleted.add("draft:deadbeef");
    const patch = buildPatch(map, tokens);
    expect(patch.ops.find((op) => op.op === "rename")).toEqual({
      op: "rename",
      name: "fireball",
      to: "fire_ball",
      expect: { name: "fireball" },
    });
    expect(patch.ops.find((op) => op.op === "delete")).toEqual({
      op: "delete",
      name: "frostbolt",
      expect: { id: "40002" },
    });
    const created = patch.ops.find((op) => op.op === "create");
    expect(created?.name).toBe("ice_lance");
    expect(created?.draftRowKey).toBe("draft:abcd1234");
    expect(created?.expect).toBeUndefined();
    expect(created?.set).toMatchObject({
      display_name: "Ice Lance",
      effect_id: "chill",
      damage: "40",
      cooldown_frames: "60",
      icon: "fx_ice",
    });
    expect(created?.set).not.toHaveProperty("element");
    expect(patch.ops.some((op) => op.draftRowKey === "draft:deadbeef")).toBe(false);
  });
});

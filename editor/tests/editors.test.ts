import { describe, expect, it } from "vitest";
import type { TableColumn } from "../src/api/types";
import { editorKind, numberOutOfRange } from "../src/spreadsheet/editors";

const stringColumn: TableColumn = { name: "name", type: "string", required: true };
const enumColumn: TableColumn = {
  name: "element",
  type: "enum",
  enumValues: ["fire", "ice", "none"],
  required: false,
};
const boolColumn: TableColumn = { name: "enabled", type: "bool", required: false, default: true };
const refColumn: TableColumn = { name: "effect_id", type: "ref", refTarget: "effects", required: true };
const damageColumn: TableColumn = { name: "damage", type: "i32", required: true, minimum: 0 };
const chanceColumn: TableColumn = {
  name: "chance_permille",
  type: "i32",
  required: true,
  minimum: 0,
  maximum: 1000,
};

describe("numberOutOfRange", () => {
  it("is false for non-number columns regardless of raw text", () => {
    expect(numberOutOfRange(stringColumn, "fireball")).toBe(false);
    expect(numberOutOfRange(enumColumn, "fireball")).toBe(false);
    expect(numberOutOfRange(boolColumn, "fireball")).toBe(false);
    expect(numberOutOfRange(refColumn, "fireball")).toBe(false);
    expect(numberOutOfRange(refColumn, "50001")).toBe(false);
  });

  it("flags non-numeric raw on numeric columns", () => {
    expect(numberOutOfRange(damageColumn, "abc")).toBe(true);
  });

  it("flags numeric columns below minimum or above maximum", () => {
    expect(numberOutOfRange(damageColumn, "-1")).toBe(true);
    expect(numberOutOfRange(chanceColumn, "1500")).toBe(true);
    expect(numberOutOfRange(damageColumn, "120")).toBe(false);
    expect(numberOutOfRange(chanceColumn, "0")).toBe(false);
  });

  it("treats four-state sentinel raws as never out of range", () => {
    for (const raw of ["", "null", "@default", "@missing"]) {
      expect(numberOutOfRange(damageColumn, raw)).toBe(false);
    }
  });

  it("still classifies editor kinds per column type", () => {
    expect(editorKind(stringColumn)).toBe("text");
    expect(editorKind(enumColumn)).toBe("enum");
    expect(editorKind(boolColumn)).toBe("bool");
    expect(editorKind(refColumn)).toBe("ref");
    expect(editorKind(damageColumn)).toBe("number");
  });
});

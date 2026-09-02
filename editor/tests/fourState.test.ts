import { describe, expect, it } from "vitest";
import { editorKind, numberOutOfRange } from "../src/spreadsheet/editors";
import { canSetMissing, tokenForDeleteKey, tokenForMenu } from "../src/spreadsheet/fourState";
import type { TableColumn } from "../src/api/types";

const optional: TableColumn = { name: "note", type: "string", required: false, default: "none" };
const required: TableColumn = { name: "damage", type: "i32", required: true, minimum: 0 };

describe("fourState", () => {
  it("keeps four tokens distinct and respects required/missing", () => {
    expect(tokenForMenu("empty", optional)?.raw).toBe('""');
    expect(tokenForMenu("null", optional)?.raw).toBe("null");
    expect(tokenForMenu("default", optional)?.raw).toBe("@default");
    expect(tokenForMenu("missing", optional)?.raw).toBe("@missing");
    expect(tokenForMenu("missing", required)).toBeNull();
    expect(canSetMissing(required)).toBe(false);
    expect(tokenForDeleteKey(optional).token?.raw).toBe("@default");
    expect(tokenForDeleteKey(required).token).toBeNull();
  });
});

describe("editors", () => {
  it("classifies columns and flags out of range numbers", () => {
    expect(editorKind({ name: "kind", type: "enum", enumValues: ["a"] })).toBe("enum");
    expect(editorKind({ name: "effect_id", type: "ref", refTarget: "effects" })).toBe("ref");
    expect(editorKind({ name: "on", type: "bool" })).toBe("bool");
    expect(editorKind(required)).toBe("number");
    expect(numberOutOfRange(required, "-1")).toBe(true);
    expect(numberOutOfRange(required, "10")).toBe(false);
  });
});

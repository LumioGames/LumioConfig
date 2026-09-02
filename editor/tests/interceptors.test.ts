import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TableResponse } from "../src/api/types";
import {
  COMMAND,
  HINTS,
  installInterceptors,
} from "../src/spreadsheet/interceptors";
import { buildWorkbook } from "../src/spreadsheet/projection";
import { FakeUniver } from "./helpers/fake-univer";

const skills = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/skills.json"), "utf8"),
) as TableResponse;

function setup() {
  const { map } = buildWorkbook(skills);
  const univer = new FakeUniver();
  const hints: string[] = [];
  const installed = installInterceptors(univer, map, {
    onHint: (hint) => hints.push(hint),
    randomBytes: () => Uint8Array.from([0x3f, 0x9a, 0x1c, 0x2e]),
  });
  return { map, univer, hints, installed };
}

describe("installInterceptors", () => {
  it("rejects formulas with a visible hint", () => {
    const { univer, hints } = setup();
    const event = univer.emit(COMMAND.setRangeValues, {
      cellValue: { 1: { 2: { f: "=SUM(1,2)", v: 3 } } },
    });
    expect(event.cancel).toBe(true);
    expect(hints.at(-1)).toBe(HINTS.formula);
  });

  it("rejects merge cells with a visible hint", () => {
    const { univer, hints } = setup();
    const event = univer.emit(COMMAND.merge, { ranges: [] });
    expect(event.cancel).toBe(true);
    expect(hints.at(-1)).toBe(HINTS.merge);
  });

  it("rejects insert and delete columns with a visible hint", () => {
    const { univer, hints } = setup();
    expect(univer.emit(COMMAND.insertColBefore, {}).cancel).toBe(true);
    expect(univer.emit(COMMAND.removeColConfirm, {}).cancel).toBe(true);
    expect(hints).toEqual([HINTS.columns, HINTS.columns]);
  });

  it("rejects editing the id column with a visible hint", () => {
    const { univer, hints } = setup();
    const event = univer.emit(COMMAND.setRangeValues, {
      cellValue: { 1: { 0: { v: "99999" } } },
    });
    expect(event.cancel).toBe(true);
    expect(hints.at(-1)).toBe(HINTS.id);
  });

  it("paste containing =SUM(...) keeps values only", () => {
    const { univer, hints } = setup();
    const params = {
      cellValue: { 1: { 2: { f: "=SUM(1,2)", v: 3 } } },
    };
    const event = univer.emit(COMMAND.paste, params);
    expect(event.cancel).toBeFalsy();
    expect(params.cellValue[1][2].f).toBeUndefined();
    expect(params.cellValue[1][2].v).toBe(3);
    expect(hints.at(-1)).toBe(HINTS.pasteFormula);
  });

  it("insert row assigns draft:<8hex> into map.rowKeys", () => {
    const { univer, map } = setup();
    const before = [...map.rowKeys];
    const event = univer.emit(COMMAND.insertRowBefore, {
      range: { startRow: 1, endRow: 1 },
    });
    expect(event.cancel).toBeFalsy();
    expect(map.rowKeys[0]).toBe("draft:3f9a1c2e");
    expect(map.rowKeys.slice(1)).toEqual(before);
  });

  it("delete row records the key in map.deleted", () => {
    const { univer, map } = setup();
    const first = map.rowKeys[0];
    expect(first).toBeDefined();
    univer.emit(COMMAND.removeRowConfirm, { range: { startRow: 1, endRow: 1 } });
    expect(map.deleted.has(first ?? "")).toBe(true);
    expect(map.rowKeys).not.toContain(first);
  });
});

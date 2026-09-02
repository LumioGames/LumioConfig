import { describe, expect, it } from "vitest";
import { applyViewState, load, save, storageKey } from "../src/spreadsheet/viewState";
import { buildWorkbook } from "../src/spreadsheet/projection";
import type { TableResponse } from "../src/api/types";
import { MemoryStorage } from "./helpers/fake-univer";
import skills from "../fixtures/skills.json";

describe("viewState.load/save", () => {
  it("round-trips freeze/width/hide/zoom under the namespaced key", () => {
    const storage = new MemoryStorage();
    const state = {
      freeze: { xSplit: 2, ySplit: 1, startRow: 1, startColumn: 2 },
      columnWidths: { "2": 180 },
      hiddenColumns: [4],
      zoom: 1.25,
    };
    save("LumioConfig", "skills", state, storage);
    expect(storage.getItem(storageKey("LumioConfig", "skills"))).toContain("1.25");
    expect(load("LumioConfig", "skills", storage)).toEqual(state);
  });

  it("applyViewState does not rewrite cell tokens", () => {
    const { workbook } = buildWorkbook(skills as TableResponse);
    const before = JSON.stringify(workbook.sheets.skills?.cellData);
    applyViewState(workbook, "skills", {
      freeze: { xSplit: 1, ySplit: 3, startRow: 3, startColumn: 1 },
      columnWidths: { "1": 200 },
      hiddenColumns: [5],
      zoom: 0.5,
    });
    expect(JSON.stringify(workbook.sheets.skills?.cellData)).toBe(before);
    expect(workbook.sheets.skills?.zoomRatio).toBe(0.5);
    expect(workbook.sheets.skills?.columnData?.["5"]?.hd).toBe(1);
  });
});

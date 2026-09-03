import { describe, expect, it } from "vitest";
import {
  applyViewState,
  changedSinceSeen,
  load,
  readSeen,
  save,
  storageKey,
  writeSeen,
} from "../src/spreadsheet/viewState";
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

describe("viewState.seen(§8 末段 J3 横幅)", () => {
  it("round-trips revisionId + fingerprint under lumio-config-editor:seen:<repo>:<table>", () => {
    const storage = new MemoryStorage();
    expect(readSeen("LumioConfig", "skills", storage)).toBeNull();
    writeSeen("LumioConfig", "skills", { revisionId: "a10eb3f", fingerprint: "47f6f165" }, storage);
    expect(storage.getItem("lumio-config-editor:seen:LumioConfig:skills")).toBe(
      JSON.stringify({ revisionId: "a10eb3f", fingerprint: "47f6f165" }),
    );
    expect(readSeen("LumioConfig", "skills", storage)).toEqual({
      revisionId: "a10eb3f",
      fingerprint: "47f6f165",
    });
    // 键按 repo:table 隔离,不串表。
    expect(readSeen("LumioConfig", "cost", storage)).toBeNull();
    expect(readSeen("OtherRepo", "skills", storage)).toBeNull();
  });

  it("falls back to null on corrupt payloads", () => {
    const storage = new MemoryStorage();
    storage.setItem("lumio-config-editor:seen:LumioConfig:skills", "not-json{");
    expect(readSeen("LumioConfig", "skills", storage)).toBeNull();
    storage.setItem("lumio-config-editor:seen:LumioConfig:skills", JSON.stringify({ revisionId: 3 }));
    expect(readSeen("LumioConfig", "skills", storage)).toBeNull();
  });

  it("first open shows no banner; a differing revision or fingerprint does", () => {
    const storage = new MemoryStorage();
    const current = { revisionId: "r2", fingerprint: "fp2" };
    // 首次打开:没有 seen 记录 → 不出横幅(App 此时种下 seen)。
    expect(changedSinceSeen("LumioConfig", "skills", current, storage)).toBe(false);
    writeSeen("LumioConfig", "skills", current, storage);
    // 重复打开同一修订 + 同一指纹 → 不出横幅。
    expect(changedSinceSeen("LumioConfig", "skills", current, storage)).toBe(false);
    // 指纹变(内容变)或修订变(仓库动过)→ 出横幅;ack 后由 App writeSeen 收敛。
    expect(changedSinceSeen("LumioConfig", "skills", { ...current, fingerprint: "fp9" }, storage)).toBe(true);
    expect(changedSinceSeen("LumioConfig", "skills", { ...current, revisionId: "r9" }, storage)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COPY } from "../src/app/copy";
import type { Draft, TableResponse } from "../src/api/types";
import { buildBigFixture } from "../src/spreadsheet/bigFixture";
import { extractTokens } from "../src/spreadsheet/extract";
import { tokenForMenu } from "../src/spreadsheet/fourState";
import { buildCell, buildWorkbook, columnWidth, workbookFromWarehouse } from "../src/spreadsheet/projection";
import { decorateViewCell, type MutableViewCell } from "../src/spreadsheet/badges";
import { diffTokens, tokensFromTable } from "../src/spreadsheet/tokens";
import type { WorkbookData } from "../src/spreadsheet/workbook-types";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

/** v3 样式用到 workbook-types 之外的 Univer 样式字段(ul/st/tb),断言侧放宽取值。 */
type SheetStyle = WorkbookData["styles"][string] & {
  tb?: number;
  ul?: { s?: number; t?: number; cl?: { rgb?: string } };
  st?: { s?: number };
};

function styleOf(workbook: WorkbookData, key: string): SheetStyle {
  return workbook.styles[key] as SheetStyle;
}

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

  it("carries v: null on four-state writes so Univer clears the stored value", () => {
    const table = loadJson("skills.json");
    const icon = table.columns.find((column) => column.name === "icon");
    expect(icon?.type).toBe("string");
    // 与 App.tsx writeToken 相同的三参调用形态(右键四态菜单 / 冲突覆盖的写路径)。
    const token = tokenForMenu("null", icon!);
    expect(token).toEqual({ state: "null", raw: "null", effective: null });
    const cell = buildCell(token!, icon!, "40001");
    expect(cell.v).toBeNull();
    expect(cell.custom?.lumio).toMatchObject({
      state: "null",
      raw: "null",
      column: "icon",
      rowKey: "40001",
      badge: "∅",
    });
    expect(cell.s).toBe("nullState");
  });

  it("keeps a real display value on writes and only nulls the empty display", () => {
    const table = loadJson("skills.json");
    const icon = table.columns.find((column) => column.name === "icon")!;
    // default 态带非空 effective:仍显示列默认值,不清 v。
    const defaultToken = tokenForMenu("default", icon)!;
    expect(defaultToken.effective).toBe("fx_none");
    expect(buildCell(defaultToken, icon, "40001").v).toBe("fx_none");
    // value 态写入保持原值。
    expect(
      buildCell({ state: "value", raw: "fx_new", effective: "fx_new" }, icon, "40001").v,
    ).toBe("fx_new");
  });
});

/** v3 投影视觉(R-00380 M6-H S03/S04;设计稿 §4/§6,ADR 0008)。 */
describe("v3 grid visuals", () => {
  it("renders a two-line column header (name * + readonly lock / type · visibility) at 36px", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const sheet = workbook.sheets.skills;
    const idHeader = sheet?.cellData["0"]?.["0"];
    const nameHeader = sheet?.cellData["0"]?.["1"];
    const refHeader = sheet?.cellData["0"]?.["3"];
    expect(idHeader?.v).toContain("id");
    expect(idHeader?.v).toContain("*");
    expect(idHeader?.v).toContain("🔒");
    expect(nameHeader?.v).toContain("name *");
    expect(nameHeader?.v).toContain("\n");
    expect(nameHeader?.v).toContain("文本 · 服务端·客户端·体素");
    expect(refHeader?.v).toContain("ref→effects · 服务端");
    expect(sheet?.rowData?.["0"]?.h).toBe(36);
    expect(styleOf(workbook, "header").tb).toBe(3);
  });

  it("carries default/range constraints on the header tooltip metadata, off the data path", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const damageHeader = workbook.sheets.skills?.cellData["0"]?.["4"];
    const lumio = (damageHeader?.custom as { lumio?: { headerTitle?: string } } | undefined)?.lumio;
    expect(lumio?.headerTitle).toContain("默认值");
    expect(lumio?.headerTitle).toContain("范围");
    const cooldownHeader = workbook.sheets.skills?.cellData["0"]?.["5"];
    const cooldownLumio = (cooldownHeader?.custom as { lumio?: { headerTitle?: string } } | undefined)?.lumio;
    expect(cooldownLumio?.headerTitle).not.toContain("默认值");
    expect(cooldownLumio?.headerTitle).toContain("范围");
  });

  it("sizes the sheet to rows + 3 and keeps dataValidation off the empty rows", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const sheet = workbook.sheets.skills;
    expect(sheet?.rowCount).toBe(table.rows.length + 3);
    const resource = (workbook.resources as Array<{ name?: string; data?: string }> | undefined)?.find(
      (item) => item.name === "SHEET_DATA_VALIDATION_PLUGIN",
    );
    expect(resource?.data).toBeTruthy();
    const rules = JSON.parse(resource!.data!)[table.table] as Array<{
      ranges: Array<{ endRow: number }>;
    }>;
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      for (const range of rule.ranges) {
        expect(range.endRow).toBeLessThanOrEqual(table.rows.length);
      }
    }
  });

  it("paints the first empty-row name placeholder in metadata only, never into v or tokens", () => {
    const table = loadJson("skills.json");
    const { workbook, extracted, expected } = roundTrip(table);
    const sheet = workbook.sheets.skills;
    const nameCol = String(table.columns.findIndex((column) => column.name === "name"));
    const placeholderRow = String(table.rows.length + 1);
    const cell = sheet?.cellData?.[placeholderRow]?.[nameCol];
    expect(cell?.custom?.lumio).toMatchObject({ placeholder: COPY.grid.placeholderNewRow });
    expect(cell?.v).toBeUndefined();
    // 占位行不在 rowKeys 里,进不了 token;round-trip 仍零 diff。
    expect(diffTokens(extracted, expected)).toEqual([]);
  });

  it("marks dirty cells with custom.lumio.dirty plus the dirty background, keeping v a plain value", () => {
    const table = loadJson("skills.json");
    const overlay: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 1,
      rows: { 40001: { damage: { state: "value", raw: "133", effective: 133 } } },
    };
    const { workbook, map } = workbookFromWarehouse(table, overlay);
    const damage = workbook.sheets.skills?.cellData["1"]?.["4"];
    expect(damage?.v).toBe(133);
    expect(damage?.custom?.lumio).toMatchObject({ state: "value", dirty: true });
    expect(damage?.s).toBe("dirtyValue");
    expect(workbook.styles.dirtyValue?.bg?.rgb).toBe("#FFF7E0");
    const icon = workbook.sheets.skills?.cellData["1"]?.["6"];
    expect((icon?.custom?.lumio as Record<string, unknown> | undefined)?.dirty).toBeUndefined();
    expect(icon?.s).toBe("value");
    expect(map.baseCells["40001"]?.damage.raw).toBe("120");
  });

  it("styles new draft rows with the whole-row new background and the 合入时发号 id cell", () => {
    const table = loadJson("skills.json");
    const overlay: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 1,
      rows: {
        "draft:abcd1234": { name: "ice_lance", damage: { state: "value", raw: "40", effective: 40 } },
      },
    };
    const { workbook, map } = workbookFromWarehouse(table, overlay);
    const sheetRow = String(table.rows.length + 1);
    const row = workbook.sheets.skills?.cellData?.[sheetRow];
    expect(row?.["0"]).toMatchObject({ v: "合入时发号", s: "newRowId" });
    expect(row?.["1"]).toMatchObject({ v: "ice_lance", s: "newRow" });
    expect(row?.["4"]).toMatchObject({ v: 40, s: "newRow" });
    expect(workbook.styles.newRow?.bg?.rgb).toBe("#EAF2FF");
    expect(workbook.styles.newRowId?.bg?.rgb).toBe("#EAF2FF");
    expect(map.rowKeys).toContain("draft:abcd1234");
  });

  it("shows deleted rows struck-through on a pale red row while keeping them out of tokens", () => {
    const table = loadJson("skills.json");
    const overlay: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 1,
      rows: {},
      deleted: ["40002"],
    };
    const { workbook, map, extracted } = workbookFromWarehouseRountrip(table, overlay);
    const frostbolt = workbook.sheets.skills?.cellData["2"];
    expect(frostbolt?.["0"]).toMatchObject({ v: 40002, s: "deletedRow" });
    expect(frostbolt?.["1"]).toMatchObject({ s: "deletedRow" });
    expect(styleOf(workbook, "deletedRow").st).toEqual({ s: 1 });
    expect(workbook.styles.deletedRow?.bg?.rgb).toBe("#FDECEC");
    expect((frostbolt?.["1"]?.custom?.lumio as Record<string, unknown> | undefined)?.dirty).toBeUndefined();
    expect(map.deleted.has("40002")).toBe(true);
    expect(extracted["40002"]).toBeUndefined();
    expect(extracted["40001"]?.icon?.raw).toBe("fx_fireball");
  });

  it("flags out-of-range number cells invalid with a wavy danger underline; string columns stay clean", () => {
    const table = loadJson("skills.json");
    const overlay: Draft = {
      table: "skills",
      baseFingerprint: table.sourceFingerprint,
      draftVersion: 1,
      rows: {
        40001: {
          cooldown_frames: { state: "value", raw: "0", effective: 0 },
          display_name: { state: "value", raw: "999", effective: "999" },
        },
      },
    };
    const { workbook } = workbookFromWarehouse(table, overlay);
    const cooldown = workbook.sheets.skills?.cellData["1"]?.["5"];
    expect(cooldown?.s).toBe("invalid");
    expect(cooldown?.custom?.lumio).toMatchObject({ invalid: true });
    expect(workbook.styles.invalid?.cl?.rgb).toBe("#B3261E");
    expect(styleOf(workbook, "invalid").ul).toEqual({ s: 1, t: 14, cl: { rgb: "#B3261E" } });
    const displayName = workbook.sheets.skills?.cellData["1"]?.["2"];
    expect(displayName?.s).toBe("dirtyValue");
    expect((displayName?.custom?.lumio as Record<string, unknown> | undefined)?.invalid).toBeUndefined();
  });

  it("decorates view cells at render time (ADR 0008) without ever touching v", () => {
    const badgeLumio = { state: "null", badge: "∅" };
    const badgeCell: MutableViewCell = { v: null, s: "nullState", custom: { lumio: badgeLumio } };
    decorateViewCell(badgeCell, badgeLumio);
    expect(badgeCell.customRender).toHaveLength(1);
    expect(badgeCell.v).toBeNull();
    expect(badgeCell.markers).toBeUndefined();

    const dirtyLumio = { state: "value", dirty: true };
    const dirtyCell: MutableViewCell = { v: 133, s: "dirtyValue", custom: { lumio: dirtyLumio } };
    decorateViewCell(dirtyCell, dirtyLumio);
    expect(dirtyCell.markers).toEqual({ tr: { color: "#B7791F", size: 6 } });
    expect(dirtyCell.customRender).toBeUndefined();
    expect(dirtyCell.v).toBe(133);

    const invalidLumio = { state: "value", invalid: true, dirty: true };
    const invalidCell: MutableViewCell = { v: 0, s: "invalid", custom: { lumio: invalidLumio } };
    decorateViewCell(invalidCell, invalidLumio);
    expect(invalidCell.customRender).toHaveLength(1);
    expect(invalidCell.markers).toBeUndefined();

    const placeholderLumio = { placeholder: COPY.grid.placeholderNewRow };
    const placeholderCell: MutableViewCell = { s: "placeholder", custom: { lumio: placeholderLumio } };
    decorateViewCell(placeholderCell, placeholderLumio);
    expect(placeholderCell.customRender).toHaveLength(1);
    expect(placeholderCell.v).toBeUndefined();

    // 快照(模型层)永远不带渲染字段:customRender/markers 只在拦截器组合视图时追加。
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    expect(JSON.stringify(workbook)).not.toContain("customRender");
    expect(JSON.stringify(workbook)).not.toContain("markers");
  });

  it("keeps four-state writes out of v even when the write is dirty", () => {
    const table = loadJson("skills.json");
    const icon = table.columns.find((column) => column.name === "icon")!;
    const token = tokenForMenu("null", icon)!;
    const cell = buildCell(token, icon, "40001", { dirty: true });
    expect(cell.v).toBeNull();
    expect(cell.custom?.lumio).toMatchObject({ state: "null", badge: "∅", dirty: true });
  });
});

function workbookFromWarehouseRountrip(table: TableResponse, overlay: Draft) {
  const { workbook, map } = workbookFromWarehouse(table, overlay);
  return { workbook, map, extracted: extractTokens(workbook, map) };
}

/** M7-C(R-00394)S01/S02:列头第二行中文化 + 列宽自适应;S04:回环与徽标守卫见上。 */
describe("M7-C header readability", () => {
  it("localizes the header second line via COPY maps (damage / id against the real skills fixture)", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const header = (col: number) => workbook.sheets.skills?.cellData["0"]?.[String(col)]?.v;
    expect(header(4)).toBe("damage *\n整数 · 服务端");
    expect(header(0)).toBe("id * 🔒\n整数 · 服务端·客户端·体素");
  });

  it("falls back to the raw type literal and preserves unknown visibility chars without throwing", () => {
    const table: TableResponse = {
      table: "weird",
      sourceFingerprint: "sha256:weird",
      columns: [{ name: "odd", type: "vec3", visibility: "QX" }],
      rows: [],
    };
    const { workbook, extracted, expected } = roundTrip(table);
    expect(workbook.sheets.weird?.cellData["0"]?.["0"]?.v).toBe("odd\nvec3 · Q·X");
    expect(diffTokens(extracted, expected)).toEqual([]);
  });

  it("clamps columnWidth to [112, 240] and gives cooldown_frames more than its one-line need", () => {
    const table = loadJson("skills.json");
    const cooldown = table.columns.find((column) => column.name === "cooldown_frames")!;
    const firstLine = "cooldown_frames *";
    expect(columnWidth(cooldown)).toBeGreaterThan(firstLine.length * 8);
    expect(columnWidth({ name: "a", type: "string" })).toBe(112);
    expect(columnWidth({ name: "x".repeat(40), type: "string" })).toBe(240);
    const id = table.columns.find((column) => column.name === "id")!;
    expect(columnWidth(id)).toBeGreaterThanOrEqual(110);
  });

  it("wires columnWidth into the sheet columnData", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const cooldown = table.columns.find((column) => column.name === "cooldown_frames")!;
    expect(workbook.sheets.skills?.columnData?.["5"]?.w).toBe(columnWidth(cooldown));
  });

  it("prepends the full column name to the header tooltip", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const lumio = (workbook.sheets.skills?.cellData["0"]?.["4"]?.custom as
      | { lumio?: { headerTitle?: string } }
      | undefined)?.lumio;
    expect(lumio?.headerTitle?.startsWith(COPY.grid.fullColumnName("damage"))).toBe(true);
  });

  it("QA-P3-2:header tooltip 三行——完整列名 / 中文类型·可见性(与列头第二行同源) / 约束", () => {
    const table = loadJson("skills.json");
    const { workbook } = buildWorkbook(table);
    const damage = (workbook.sheets.skills?.cellData["0"]?.["4"]?.custom as
      | { lumio?: { headerTitle?: string } }
      | undefined)?.lumio?.headerTitle;
    const lines = damage?.split("\n");
    expect(lines?.[0]).toBe(COPY.grid.fullColumnName("damage"));
    expect(lines?.[1]).toBe("整数 · 服务端");
    expect(lines?.[2]).toContain("必填");
    expect(lines?.[2]).toContain("范围");
    // 英文字面量不再出现在悬浮 title(类型/可见性与列头同一套中文)。
    expect(damage).not.toContain("i32");
    expect(damage).not.toContain("可见性 S");
    // id 列(u32 · SCV)同源展开。
    const id = (workbook.sheets.skills?.cellData["0"]?.["0"]?.custom as
      | { lumio?: { headerTitle?: string } }
      | undefined)?.lumio?.headerTitle;
    expect(id?.split("\n")[1]).toBe("整数 · 服务端·客户端·体素");
  });
});

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
import { extractTokens } from "../src/spreadsheet/extract";
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
    executeCommand: (id, params) => univer.executeCommand(id, params),
    tableColumns: skills.columns,
  });
  return { map, univer, hints, installed };
}

/** 模拟 univerAPI 的当前活动选区(键盘 Delete 的 clear 命令不带 range 时依赖它)。 */
function withActiveSelection(
  univer: FakeUniver,
  range: { startRow: number; endRow: number; startColumn: number; endColumn: number },
) {
  Object.assign(univer, {
    getActiveWorkbook: () => ({
      getActiveSheet: () => ({
        getSelection: () => ({
          getActiveRange: () => ({
            getRow: () => range.startRow,
            getLastRow: () => range.endRow,
            getColumn: () => range.startColumn,
            getLastColumn: () => range.endColumn,
          }),
        }),
      }),
    }),
  });
  return univer;
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

  it("rejects Univer 0.25 range+value id edits", () => {
    const { univer, hints } = setup();
    const event = univer.emit(COMMAND.setRangeValues, {
      range: { startRow: 1, startColumn: 0, endRow: 1, endColumn: 0 },
      value: { v: "99999" },
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

  it("strips formulas on Univer paste ids and mutations", () => {
    const { univer, hints } = setup();
    const shortKey = { cellValue: { 1: { 2: { f: "=SUM(1,2)", v: 3 } } } };
    expect(univer.emit(COMMAND.pasteShortKey, shortKey).cancel).toBeFalsy();
    expect(shortKey.cellValue[1][2].f).toBeUndefined();
    const mutation = {
      cellValue: { 1: { 3: { f: "=A1", v: 1 } } },
    };
    expect(univer.emit(COMMAND.setRangeValuesMutation, mutation).cancel).toBeFalsy();
    expect(mutation.cellValue[1][3].f).toBeUndefined();
    expect(hints).toContain(HINTS.pasteFormula);
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
    expect(univer.executed.some((item) => item.id === COMMAND.setRangeValues)).toBe(true);
    const idWrite = univer.executed.find((item) => item.id === COMMAND.setRangeValues);
    const value = (idWrite?.params as { value?: { v?: string; custom?: { lumio?: { draftId?: boolean } } } }).value;
    expect(value?.v).toBe("合入时发号");
    expect(value?.custom?.lumio?.draftId).toBe(true);
  });

  it("does not mint a second draft key for the inner insert-row command", () => {
    const { univer, map } = setup();
    univer.emit(COMMAND.insertRowBefore, { range: { startRow: 1, endRow: 1 } });
    const afterUi = [...map.rowKeys];
    univer.emit("sheet.command.insert-row", { range: { startRow: 1, endRow: 1 } });
    expect(map.rowKeys).toEqual(afterUi);
  });

  it("delete row records the key in map.deleted", () => {
    const { univer, map } = setup();
    const first = map.rowKeys[0];
    expect(first).toBeDefined();
    univer.emit(COMMAND.removeRowConfirm, { range: { startRow: 1, endRow: 1 } });
    expect(map.deleted.has(first ?? "")).toBe(true);
    expect(map.rowKeys).not.toContain(first);
  });

  it("paste keeps an existing four-state lumio token instead of collapsing to value", () => {
    const { univer, map } = setup();
    const params = {
      range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
      value: {
        custom: {
          lumio: { state: "empty", raw: '""', effective: "", column: "display_name", rowKey: "40001" },
        },
      },
    };
    const event = univer.emit(COMMAND.paste, params);
    expect(event.cancel).toBeFalsy();
    expect(map.currentCells["40001"]?.display_name?.raw).toBe('""');
    expect(map.currentCells["40001"]?.display_name?.state).toBe("empty");
  });

  /**
   * Univer 的键盘提交(set-range-values)从 getCellRaw 起步,value 携带整格旧
   * custom.lumio。P1-1 回归:四态格被真实键盘覆写时必须转成 value token。
   */
  it("keyboard submit over a null-state cell becomes a value token", () => {
    const { univer, map } = setup();
    const params = {
      range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
      value: {
        v: "fx_new",
        t: 1,
        custom: {
          lumio: { state: "null", raw: "null", effective: null, column: "display_name", rowKey: "40001" },
        },
      },
    };
    const event = univer.emit(COMMAND.setRangeValues, params);
    expect(event.cancel).toBeFalsy();
    expect(map.currentCells["40001"]?.display_name).toEqual({
      state: "value",
      raw: "fx_new",
      effective: "fx_new",
    });
    // 拦截器重写过 cell.custom,真实 extractTokens(经 workbook 快照)也必须读到 value。
    const snapshot = {
      sheetOrder: ["skills"],
      sheets: { skills: { cellData: { 1: { 2: params.value } } } },
    };
    expect(extractTokens(snapshot, map)["40001"]?.display_name).toEqual({
      state: "value",
      raw: "fx_new",
      effective: "fx_new",
    });
  });

  it("keyboard submit that leaves the effective value unchanged keeps the four-state token", () => {
    const { univer, map } = setup();
    const event = univer.emit(COMMAND.setRangeValues, {
      range: { startRow: 1, startColumn: 4, endRow: 1, endColumn: 4 },
      value: {
        v: 0,
        t: 2,
        custom: {
          lumio: { state: "default", raw: "@default", effective: 0, column: "damage", rowKey: "40001" },
        },
      },
    });
    expect(event.cancel).toBeFalsy();
    expect(map.currentCells["40001"]?.damage?.state).toBe("default");
    expect(map.currentCells["40001"]?.damage?.raw).toBe("@default");
  });

  /**
   * P1-2 回归:键盘 Delete 的 clear-selection-content 不带 range,必须取
   * univerAPI 当前活动选区,再按 0-7 §5 逐格分派。
   */
  it("clear without range blocks a required column without default and hints", () => {
    const { univer, map, hints } = setup();
    withActiveSelection(univer, { startRow: 1, endRow: 1, startColumn: 5, endColumn: 5 });
    const event = univer.emit(COMMAND.clearSelectionContent, {});
    expect(event.cancel).toBe(true);
    expect(hints.at(-1)).toBeTruthy();
    expect(map.currentCells["40001"]?.cooldown_frames?.raw).toBe("150");
    expect(univer.executed.filter((item) => item.id === COMMAND.setRangeValues)).toHaveLength(0);
  });

  it("clear without range writes @default on a column with default", () => {
    const { univer, map } = setup();
    withActiveSelection(univer, { startRow: 1, endRow: 1, startColumn: 4, endColumn: 4 });
    const event = univer.emit(COMMAND.clearSelectionContent, {});
    expect(event.cancel).toBe(true);
    expect(map.currentCells["40001"]?.damage).toEqual({ state: "default", raw: "@default", effective: 0 });
    expect(univer.executed.some((item) => item.id === COMMAND.setRangeValues)).toBe(true);
  });

  it("clear without range writes null on an optional column without default", () => {
    const { univer, map } = setup();
    withActiveSelection(univer, { startRow: 1, endRow: 1, startColumn: 7, endColumn: 7 });
    const event = univer.emit(COMMAND.clearSelectionContent, {});
    expect(event.cancel).toBe(true);
    expect(map.currentCells["40001"]?.element).toEqual({ state: "null", raw: "null", effective: null });
  });

  it("a {v:null} mutation is not recorded as an empty value token", () => {
    const { univer, map } = setup();
    const before = map.currentCells["40001"]?.display_name;
    const event = univer.emit(COMMAND.setRangeValuesMutation, {
      cellValue: { 1: { 2: { v: null, p: null, f: null, si: null, custom: null } } },
    });
    expect(event.cancel).toBeFalsy();
    expect(map.currentCells["40001"]?.display_name).toEqual(before);
    expect(map.currentCells["40001"]?.display_name?.raw).not.toBe("");
  });
});

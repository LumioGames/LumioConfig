import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { FUniver } from "@univerjs/core/facade";
import type { PocBridge } from "../src/app/App";
import { GridToolbar } from "../src/panels/GridToolbar";
import { COMMAND } from "../src/spreadsheet/commands";
import { COPY } from "../src/app/copy";

interface Recorded {
  id: string;
  params?: unknown;
}

function makeUniverAPI(row: number | null) {
  const calls: Recorded[] = [];
  const range = row === null ? null : { getRow: () => row };
  const univerAPI = {
    executeCommand: (id: string, params?: unknown) => {
      calls.push({ id, params });
      return Promise.resolve(true);
    },
    getActiveWorkbook: () => ({
      getActiveSheet: () => ({
        getSelection: () => ({ getActiveRange: () => range }),
      }),
    }),
  };
  return { univerAPI: univerAPI as unknown as FUniver, calls };
}

function installBridge() {
  const copied: string[] = [];
  const bridge = {
    map: () => ({ rowKeys: ["40001", "40002", "draft:aa"] }),
    copyRow: async (rowKey: string) => {
      copied.push(rowKey);
      return "draft:bb";
    },
  } as unknown as PocBridge;
  window.__lumioPoc = bridge;
  return copied;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

function button(el: HTMLElement, testid: string): HTMLButtonElement {
  const node = el.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
  if (!node) {
    throw new Error(`button ${testid} not found`);
  }
  return node;
}

function click(el: HTMLElement, testid: string) {
  act(() => {
    button(el, testid).click();
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  delete window.__lumioPoc;
  localStorage.clear();
});

describe("GridToolbar view commands", () => {
  it("dispatches the whitelist command id for undo / redo / find / filter", () => {
    const { univerAPI, calls } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);

    click(el, "tb-undo");
    click(el, "tb-redo");
    click(el, "tb-find");
    click(el, "tb-filter");

    expect(calls.map((call) => call.id)).toEqual([
      COMMAND.undo,
      COMMAND.redo,
      COMMAND.find,
      COMMAND.filterToggle,
    ]);
  });

  it("sort opens a menu dispatching asc / desc commands", () => {
    const { univerAPI, calls } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);

    click(el, "tb-sort");
    const menu = el.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const items = Array.from(menu!.querySelectorAll('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toContain(COPY.toolbar.sortAsc);
    expect(items.map((item) => item.textContent)).toContain(COPY.toolbar.sortDesc);

    act(() => {
      (items[0] as HTMLElement).click();
    });
    expect(calls.map((call) => call.id)).toEqual([COMMAND.sortAsc]);

    click(el, "tb-sort");
    const again = Array.from(el.querySelectorAll('[role="menuitem"]'));
    act(() => {
      (again[1] as HTMLElement).click();
    });
    expect(calls.map((call) => call.id)).toEqual([COMMAND.sortAsc, COMMAND.sortDesc]);
  });

  it("freeze toggles first row + column on, then off, via set-frozen", () => {
    const { univerAPI, calls } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);

    click(el, "tb-freeze");
    click(el, "tb-freeze");

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      id: COMMAND.freeze,
      params: { startRow: 1, startColumn: 1, ySplit: 1, xSplit: 1 },
    });
    expect(calls[1]).toEqual({
      id: COMMAND.freeze,
      params: { startRow: -1, startColumn: -1, ySplit: 0, xSplit: 0 },
    });
  });

  it("zoom cycles presets and labels the current ratio", () => {
    const { univerAPI, calls } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    expect(button(el, "tb-zoom").textContent).toContain("100%");

    click(el, "tb-zoom");
    expect(calls[0]?.params).toEqual({ zoomRatio: 1.25 });
    expect(button(el, "tb-zoom").textContent).toContain("125%");

    click(el, "tb-zoom");
    click(el, "tb-zoom");
    expect(calls.map((call) => call.params)).toEqual([
      { zoomRatio: 1.25 },
      { zoomRatio: 1.5 },
      { zoomRatio: 0.75 },
    ]);

    click(el, "tb-zoom");
    expect(calls[3]?.params).toEqual({ zoomRatio: 1 });
    expect(button(el, "tb-zoom").textContent).toContain("100%");
  });
});

describe("GridToolbar row operations", () => {
  it("insert row dispatches insert-row-after with the selected range", () => {
    const { univerAPI, calls } = makeUniverAPI(2);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    click(el, "tb-insert-row");
    expect(calls).toEqual([
      { id: COMMAND.insertRowAfter, params: { range: { startRow: 2, endRow: 2 } } },
    ]);
  });

  it("delete row dispatches remove-row-confirm with the selected range", () => {
    const { univerAPI, calls } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    click(el, "tb-delete-row");
    expect(calls).toEqual([
      { id: COMMAND.removeRowConfirm, params: { range: { startRow: 1, endRow: 1 } } },
    ]);
  });

  it("copy row goes through the __lumioPoc bridge, not raw commands", () => {
    const copied = installBridge();
    const { univerAPI, calls } = makeUniverAPI(2);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    click(el, "tb-copy-row");
    expect(copied).toEqual(["40002"]);
    expect(calls).toEqual([]);
  });
});

describe("GridToolbar hint and disabled states", () => {
  it("shows the column count view hint on the right", () => {
    const { univerAPI } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    expect(el.querySelector('[data-testid="grid-toolbar"]')?.textContent).toContain(
      COPY.toolbar.viewHint(9),
    );
  });

  it("canEdit=false disables edit buttons with a reason, keeps view buttons live", () => {
    const { univerAPI, calls } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit={false} />);

    for (const testid of ["tb-undo", "tb-redo", "tb-insert-row", "tb-copy-row", "tb-delete-row"]) {
      const node = button(el, testid);
      expect(node.disabled, testid).toBe(true);
      expect(node.title, testid).toBe(COPY.toolbar.notEditable);
    }
    for (const testid of ["tb-find", "tb-filter", "tb-sort", "tb-freeze", "tb-zoom"]) {
      expect(button(el, testid).disabled, testid).toBe(false);
    }

    click(el, "tb-find");
    expect(calls.map((call) => call.id)).toEqual([COMMAND.find]);
  });

  it("no data-row selection disables row buttons with the no-selection reason", () => {
    const { univerAPI } = makeUniverAPI(null);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);

    for (const testid of ["tb-insert-row", "tb-delete-row"]) {
      const node = button(el, testid);
      expect(node.disabled, testid).toBe(true);
      expect(node.title, testid).toBe(COPY.toolbar.noSelection);
    }
  });

  it("null univerAPI disables everything with the not-ready reason", () => {
    const el = mount(<GridToolbar univerAPI={null} columnCount={9} canEdit />);
    for (const testid of [
      "tb-undo",
      "tb-redo",
      "tb-find",
      "tb-filter",
      "tb-sort",
      "tb-freeze",
      "tb-insert-row",
      "tb-copy-row",
      "tb-delete-row",
      "tb-zoom",
    ]) {
      const node = button(el, testid);
      expect(node.disabled, testid).toBe(true);
      expect(node.title, testid).toBe(COPY.toolbar.notReady);
    }
  });

  it("missing bridge disables only copy row, with the bridge reason", () => {
    const { univerAPI } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    const node = button(el, "tb-copy-row");
    expect(node.disabled).toBe(true);
    expect(node.title).toBe(COPY.toolbar.noBridge);
    expect(button(el, "tb-insert-row").disabled).toBe(false);
  });

  it("renders a labeled region landmark (Task 20: toolbar→region, axe landmark 覆盖)", () => {
    const { univerAPI } = makeUniverAPI(1);
    const el = mount(<GridToolbar univerAPI={univerAPI} columnCount={9} canEdit />);
    const toolbar = el.querySelector('[data-testid="grid-toolbar"]');
    // 未实现 roving tabindex,role=region + aria-label 更诚实,且满足 axe region 规则。
    expect(toolbar?.getAttribute("role")).toBe("region");
    expect(toolbar?.getAttribute("aria-label")).toBe(COPY.toolbar.ariaLabel);
  });
});

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../src/app/copy";
import type { TableColumn } from "../src/api/types";
import { Inspector, type InspectorProps } from "../src/panels/Inspector";
import type { CellMeta } from "../src/spreadsheet/cellMeta";
import { load as loadView, save as saveView, uiFlags } from "../src/spreadsheet/viewState";
import { MemoryStorage } from "./helpers/fake-univer";

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

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

const damageColumn: TableColumn = {
  name: "damage",
  type: "i32",
  required: true,
  minimum: 0,
  default: 0,
  visibility: "S",
};

const cooldownColumn: TableColumn = {
  name: "cooldown_frames",
  type: "i32",
  required: true,
  minimum: 1,
  visibility: "S",
};

const optionalColumn: TableColumn = {
  name: "element",
  type: "enum",
  enumValues: ["fire", "ice", "none"],
  visibility: "S",
};

function buildMeta(overrides: Partial<CellMeta> = {}): CellMeta {
  return {
    table: "skills",
    rowKey: "40001",
    rowName: "fireball",
    rowStatus: "existing",
    column: damageColumn,
    current: { state: "value", raw: "130", effective: 130 },
    baseline: { state: "value", raw: "120", effective: 120 },
    remoteErrors: [],
    conflict: null,
    ...overrides,
  };
}

function mountInspector(
  props: Partial<InspectorProps> & { meta?: CellMeta | null },
): HTMLDivElement {
  const onFourState = props.onFourState ?? vi.fn();
  const onRevert = props.onRevert ?? vi.fn();
  const onDeleteRow = props.onDeleteRow ?? vi.fn();
  const onUndeleteRow = props.onUndeleteRow ?? vi.fn();
  const onGoToConflicts = props.onGoToConflicts ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  return mount(
    <Inspector
      open={props.open ?? true}
      selection={props.selection ?? { row: 1, column: "damage" }}
      meta={props.meta === undefined ? buildMeta() : props.meta}
      onFourState={onFourState}
      onRevert={onRevert}
      onDeleteRow={onDeleteRow}
      onUndeleteRow={onUndeleteRow}
      onGoToConflicts={onGoToConflicts}
      onClose={onClose}
    />,
  );
}

describe("Inspector(只读检查器,设计稿 §7)", () => {
  it("renders nothing while collapsed", () => {
    const el = mountInspector({ open: false });
    expect(el.querySelector('[data-testid="inspector"]')).toBeNull();
  });

  it("shows breadcrumb, column name with required/readonly tags and the current value", () => {
    const el = mountInspector({});
    const panel = el.querySelector('[data-testid="inspector"]') as HTMLElement;
    expect(panel.textContent).toContain("skills · fireball");
    expect(panel.textContent).toContain("damage");
    expect(panel.textContent).toContain(COPY.inspector.requiredTag);
    expect(panel.textContent).toContain("130");
    expect(panel.textContent).toContain(COPY.inspector.stateLabels.value);
  });

  it("marks readonly columns with the readonly tag instead of editable actions", () => {
    const el = mountInspector({
      meta: buildMeta({
        column: { name: "id", type: "u32", required: true, readOnly: true, visibility: "SCV" },
      }),
    });
    const panel = el.querySelector('[data-testid="inspector"]') as HTMLElement;
    expect(panel.textContent).toContain(COPY.inspector.readonlyTag);
  });

  it("renders the invalid reason block with message, suggestion and code (remote wins)", () => {
    const el = mountInspector({
      meta: buildMeta({
        remoteErrors: [
          { row: "40001", column: "damage", code: "OUT_OF_RANGE", message: "超出范围", suggestion: "改小一点" },
        ],
      }),
    });
    const block = el.querySelector('[data-testid="invalid-reason"]') as HTMLElement;
    expect(block).toBeTruthy();
    expect(block.textContent).toContain("超出范围");
    expect(block.textContent).toContain("改小一点");
    expect(block.textContent).toContain("OUT_OF_RANGE");
  });

  it("falls back to local type checking when the precheck has nothing for this cell", () => {
    const el = mountInspector({
      meta: buildMeta({ current: { state: "value", raw: "abc", effective: "abc" } }),
    });
    const block = el.querySelector('[data-testid="invalid-reason"]') as HTMLElement;
    expect(block).toBeTruthy();
    expect(block.textContent).toContain(COPY.inspector.invalid.typeMismatch);
    expect(block.textContent).toContain("TYPE_MISMATCH");
  });

  it("hides the invalid block when the cell is valid", () => {
    const el = mountInspector({});
    expect(el.querySelector('[data-testid="invalid-reason"]')).toBeNull();
  });

  it("shows baseline → current with a revert action only when the cell drifted", () => {
    const onRevert = vi.fn();
    const el = mountInspector({ onRevert });
    const baseline = el.querySelector('[data-testid="cell-baseline"]') as HTMLElement;
    expect(baseline).toBeTruthy();
    expect(baseline.textContent).toContain("120 → 130");
    const revert = baseline.querySelector("button") as HTMLButtonElement;
    expect(revert.textContent).toBe(COPY.inspector.revert);
    act(() => {
      revert.click();
    });
    expect(onRevert).toHaveBeenCalledTimes(1);

    const clean = mountInspector({
      meta: buildMeta({ current: { state: "value", raw: "120", effective: 120 } }),
    });
    expect(clean.querySelector('[data-testid="cell-baseline"]')).toBeNull();
  });

  it("renders four-state keys with data-source=inspector, disabled reasons and clicks", () => {
    const onFourState = vi.fn();
    const el = mountInspector({ onFourState });
    for (const kind of ["empty", "null", "default", "missing"] as const) {
      const button = el.querySelector(`[data-testid="four-state-${kind}"]`) as HTMLButtonElement;
      expect(button, kind).toBeTruthy();
      expect(button.getAttribute("data-source")).toBe("inspector");
    }
    // damage:必填 → 设为缺列禁用并给 title 原因;有默认值 → 恢复默认可用。
    const missing = el.querySelector('[data-testid="four-state-missing"]') as HTMLButtonElement;
    expect(missing.disabled).toBe(true);
    expect(missing.title).toBe(COPY.validation.requiredMissingColumn);
    const setEmpty = el.querySelector('[data-testid="four-state-empty"]') as HTMLButtonElement;
    act(() => {
      setEmpty.click();
    });
    expect(onFourState).toHaveBeenCalledWith("empty");

    const noDefault = mountInspector({ meta: buildMeta({ column: cooldownColumn }) });
    const restore = noDefault.querySelector('[data-testid="four-state-default"]') as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
    expect(restore.title).toBe(COPY.inspector.noDefaultReason);

    const optional = mountInspector({ onFourState, meta: buildMeta({ column: optionalColumn }) });
    const optionalMissing = optional.querySelector('[data-testid="four-state-missing"]') as HTMLButtonElement;
    expect(optionalMissing.disabled).toBe(false);
  });

  it("explains where Delete lands on this column", () => {
    const withDefault = mountInspector({});
    const panel = withDefault.querySelector('[data-testid="inspector"]') as HTMLElement;
    expect(panel.textContent).toContain(COPY.inspector.deleteRulePrefix);
    expect(panel.textContent).toContain(COPY.inspector.stateLabels.default);

    const requiredNoDefault = mountInspector({ meta: buildMeta({ column: cooldownColumn }) });
    const text = (requiredNoDefault.querySelector('[data-testid="inspector"]') as HTMLElement).textContent;
    expect(text).toContain(COPY.validation.requiredNoDefault("cooldown_frames"));
  });

  it("offers row actions per row status", () => {
    const onDeleteRow = vi.fn();
    const onUndeleteRow = vi.fn();
    const existing = mountInspector({ onDeleteRow, onUndeleteRow });
    const deleteButton = [...existing.querySelectorAll("button")].find(
      (button) => button.textContent === COPY.inspector.deleteRow,
    ) as HTMLButtonElement;
    expect(deleteButton).toBeTruthy();
    act(() => {
      deleteButton.click();
    });
    expect(onDeleteRow).toHaveBeenCalledTimes(1);
    expect(
      [...existing.querySelectorAll("button")].some((button) => button.textContent === COPY.inspector.undeleteRow),
    ).toBe(false);

    const onUndeleteClick = vi.fn();
    const deleted = mountInspector({
      onUndeleteRow: onUndeleteClick,
      meta: buildMeta({ rowStatus: "deleted" }),
    });
    const undelete = [...deleted.querySelectorAll("button")].find(
      (button) => button.textContent === COPY.inspector.undeleteRow,
    ) as HTMLButtonElement;
    expect(undelete).toBeTruthy();
    act(() => {
      undelete.click();
    });
    expect(onUndeleteClick).toHaveBeenCalledTimes(1);
  });

  it("shows the new-row status for draft rows", () => {
    const el = mountInspector({ meta: buildMeta({ rowStatus: "new", rowKey: "draft:abcd1234" }) });
    const panel = el.querySelector('[data-testid="inspector"]') as HTMLElement;
    expect(panel.textContent).toContain(COPY.inspector.rowStatus.new);
  });

  it("jumps to the conflict panel from the conflict block", () => {
    const onGoToConflicts = vi.fn();
    const el = mountInspector({
      onGoToConflicts,
      meta: buildMeta({ conflict: { code: "STALE_BASELINE", message: "仓库已改这一格" } }),
    });
    const jump = [...el.querySelectorAll("button")].find(
      (button) => button.textContent === COPY.inspector.goToConflicts,
    ) as HTMLButtonElement;
    expect(jump).toBeTruthy();
    act(() => {
      jump.click();
    });
    expect(onGoToConflicts).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    const el = mountInspector({ onClose });
    const close = [...el.querySelectorAll("button")].find(
      (button) => button.textContent === COPY.inspector.close,
    ) as HTMLButtonElement;
    expect(close).toBeTruthy();
    act(() => {
      close.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the empty hint when open without a selection", () => {
    const el = mountInspector({ selection: null, meta: null });
    const panel = el.querySelector('[data-testid="inspector"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain(COPY.inspector.emptyHint);
    expect(el.querySelector('[data-testid="invalid-reason"]')).toBeNull();
    expect(el.querySelector('[data-testid="cell-baseline"]')).toBeNull();
  });

  it("never renders an input; values change only in the grid", () => {
    const el = mountInspector({});
    expect(el.querySelector("input")).toBeNull();
    expect(el.querySelector("textarea")).toBeNull();
    expect(el.querySelector('[contenteditable]')).toBeNull();
  });
});

describe("viewState inspector/sidebar flags(刷新后记忆,设计稿 §2.1)", () => {
  it("round-trips inspectorOpen and sidebarCollapsed under the same namespaced key", () => {
    const storage = new MemoryStorage();
    saveView("LumioConfig", "skills", { inspectorOpen: true, sidebarCollapsed: true }, storage);
    const loaded = loadView("LumioConfig", "skills", storage);
    expect(loaded?.inspectorOpen).toBe(true);
    expect(loaded?.sidebarCollapsed).toBe(true);
  });

  it("defaults to a collapsed inspector and an expanded sidebar", () => {
    expect(uiFlags(null)).toEqual({ inspectorOpen: false, sidebarCollapsed: false });
    const storage = new MemoryStorage();
    saveView("LumioConfig", "skills", { zoom: 1 }, storage);
    expect(uiFlags(loadView("LumioConfig", "skills", storage))).toEqual({
      inspectorOpen: false,
      sidebarCollapsed: false,
    });
  });
});

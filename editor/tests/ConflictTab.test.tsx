import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictTab, conflictKey } from "../src/panels/drawer/ConflictTab";
import type { Resolution } from "../src/panels/drawer/ConflictTab";
import type { RebaseConflict } from "../src/api/types";

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

function conflict(overrides: Partial<RebaseConflict> = {}): RebaseConflict {
  return {
    table: "skills",
    row: "fireball",
    rowId: "40001",
    column: "damage",
    code: "STALE_BASELINE",
    message: "打开后仓库已更新这一格",
    suggestion: "选择一侧后重新预检并提交",
    base: "120",
    current: "140",
    draft: "133",
    ...overrides,
  };
}

function setup(props: Partial<Parameters<typeof ConflictTab>[0]> = {}) {
  const calls: Array<[string, Resolution]> = [];
  const resubmits: number[] = [];
  const cancels: number[] = [];
  const jumps: RebaseConflict[] = [];
  const conflicts = props.conflicts ?? [conflict()];
  const el = mount(
    <ConflictTab
      conflicts={conflicts}
      resolved={props.resolved ?? {}}
      onResolve={(key, r) => calls.push([key, r])}
      onResubmit={() => resubmits.push(1)}
      onCancel={() => cancels.push(1)}
      onJump={(c) => jumps.push(c)}
    />,
  );
  return { el, calls, resubmits, cancels, jumps, conflicts };
}

function q(el: HTMLDivElement, testid: string): HTMLElement {
  return el.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
}

/** React 受控输入需要走原生 value setter(TableList.test 同款)。 */
function typeInto(field: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ConflictTab 空态与进度", () => {
  it("无冲突时渲染 null", () => {
    const el = mount(
      <ConflictTab conflicts={[]} resolved={{}} onResolve={() => undefined} onResubmit={() => undefined} onCancel={() => undefined} />,
    );
    expect(el.textContent).toBe("");
    expect(el.children.length).toBe(0);
  });

  it("进度显示「已解决 N / M」且 progressbar 反映 N/M", () => {
    const two = [conflict(), conflict({ rowId: "40002", row: "frostbolt", column: "icon" })];
    const { el } = setup({
      conflicts: two,
      resolved: { [conflictKey(two[0])]: { kind: "mine" } },
    });
    expect(el.textContent).toContain("已解决 1 / 2");
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("2");
  });

  it("进度条填充宽度按 N/M 比例", () => {
    const two = [conflict(), conflict({ rowId: "40002", row: "frostbolt", column: "icon" })];
    const { el } = setup({
      conflicts: two,
      resolved: { [conflictKey(two[0])]: { kind: "mine" } },
    });
    const fill = el.querySelector('[role="progressbar"] > [data-progress-fill]') as HTMLElement;
    expect(fill.style.width).toBe("50%");
  });
});

describe("ConflictTab 冲突卡(三列 + 单选组)", () => {
  it("三列显示 打开时 / 仓库当前 / 我的草稿 与 base/current/draft 值", () => {
    const { el } = setup();
    expect(el.textContent).toContain("打开时");
    expect(el.textContent).toContain("仓库当前");
    expect(el.textContent).toContain("我的草稿");
    expect(el.textContent).toContain("120");
    expect(el.textContent).toContain("140");
    expect(el.textContent).toContain("133");
  });

  it("radio 单选即回调:采仓库值 / 采我的值 / 恢复默认 / 设为 ∅", () => {
    const { el, calls, conflicts } = setup();
    const key = conflictKey(conflicts[0]);
    act(() => {
      q(el, "conflict-warehouse").click();
    });
    act(() => {
      q(el, "conflict-mine").click();
    });
    act(() => {
      q(el, "conflict-default").click();
    });
    act(() => {
      q(el, "conflict-null").click();
    });
    expect(calls).toEqual([
      [key, { kind: "repo" }],
      [key, { kind: "mine" }],
      [key, { kind: "default" }],
      [key, { kind: "null" }],
    ]);
  });

  it("resolved 决定 radio 勾选态", () => {
    const one = conflict();
    const { el } = setup({ resolved: { [conflictKey(one)]: { kind: "mine" } } });
    expect((q(el, "conflict-mine") as HTMLInputElement).checked).toBe(true);
    expect((q(el, "conflict-warehouse") as HTMLInputElement).checked).toBe(false);
  });

  it("手工输入:选 radio 出现内联输入框,Enter 确认回调 input + value", () => {
    const { el, calls, conflicts } = setup();
    const key = conflictKey(conflicts[0]);
    act(() => {
      q(el, "conflict-input").click();
    });
    const field = el.querySelector('[data-testid="conflict-input-field"]') as HTMLInputElement;
    expect(field).not.toBeNull();
    act(() => {
      typeInto(field, "999");
    });
    act(() => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(calls).toEqual([[key, { kind: "input", value: "999" }]]);
  });

  it("手工输入 Enter 前不回调;空值 Enter 不回调", () => {
    const { el, calls } = setup();
    act(() => {
      q(el, "conflict-input").click();
    });
    const field = el.querySelector('[data-testid="conflict-input-field"]') as HTMLInputElement;
    act(() => {
      typeInto(field, "");
    });
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(calls).toEqual([]);
    act(() => {
      typeInto(field, "  ");
    });
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(calls).toEqual([]);
  });

  it("DELETED_ROW_CONFLICT 只有「放弃我的改动」,无五个单选", () => {
    const { el, calls, conflicts } = setup({
      conflicts: [conflict({ code: "DELETED_ROW_CONFLICT", column: "" })],
    });
    const key = conflictKey(conflicts[0]);
    for (const testid of ["conflict-warehouse", "conflict-mine", "conflict-input", "conflict-default", "conflict-null"]) {
      expect(q(el, testid)).toBeNull();
    }
    expect(el.textContent).toContain("放弃我的改动");
    act(() => {
      q(el, "conflict-drop").click();
    });
    expect(calls).toEqual([[key, { kind: "drop" }]]);
  });

  it("点卡头跳格回调 onJump(冲突对象)", () => {
    const { el, jumps, conflicts } = setup();
    const header = el.querySelector("[data-conflict-jump]") as HTMLElement;
    act(() => {
      header.click();
    });
    expect(jumps).toEqual([conflicts[0]]);
  });
});

describe("ConflictTab 底部动作", () => {
  it("全部解决前 resubmit 禁用,全部解决后可用并回调", () => {
    const one = conflict();
    const { el, resubmits } = setup();
    const resubmit = q(el, "conflict-resubmit") as HTMLButtonElement;
    expect(resubmit.disabled).toBe(true);
    expect(resubmit.textContent).toContain("重新预检并提交");
    act(() => {
      resubmit.click();
    });
    expect(resubmits).toEqual([]);
    const wired = setup({ resolved: { [conflictKey(one)]: { kind: "mine" } } });
    const enabled = q(wired.el, "conflict-resubmit") as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    act(() => {
      enabled.click();
    });
    expect(wired.resubmits.length).toBe(1);
  });

  it("取消本次提交回调 onCancel", () => {
    const { el, cancels } = setup();
    act(() => {
      q(el, "conflict-cancel").click();
    });
    expect(cancels.length).toBe(1);
    expect(q(el, "conflict-cancel").textContent).toContain("取消本次提交");
  });
});

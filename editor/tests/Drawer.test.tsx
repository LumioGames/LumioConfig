import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Drawer, type DrawerTab } from "../src/panels/drawer/Drawer";

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

const TABS: DrawerTab[] = [
  { id: "patch", label: "补丁", count: 3 },
  { id: "errors", label: "错误", count: 1, tone: "danger" },
  { id: "conflicts", label: "冲突", count: 2, tone: "conflict" },
  { id: "export", label: "导出" },
];

function press(key: string, opts?: { ctrl?: boolean; meta?: boolean; target?: EventTarget; prePrevented?: boolean }) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: opts?.ctrl ?? false,
    metaKey: opts?.meta ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (opts?.prePrevented) {
    event.preventDefault();
  }
  (opts?.target ?? window).dispatchEvent(event);
  return event;
}

describe("Drawer", () => {
  it("renders the collapsed strip at 30px with panel testid, tabs and counts", () => {
    const el = mount(<Drawer tabs={TABS} active="patch" open={false} onSelect={() => {}} onToggle={() => {}}><p>body</p></Drawer>);
    const panel = el.querySelector('[data-testid="panel"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.height).toBe("30px");
    expect(panel.style.transition).toBe("");
    for (const tab of TABS) {
      const button = panel.querySelector(`[data-testid="tab-${tab.id}"]`) as HTMLButtonElement;
      expect(button).toBeTruthy();
      expect(button.textContent).toContain(tab.label);
      if (tab.count !== undefined) {
        expect(button.textContent).toContain(String(tab.count));
      }
    }
    expect(panel.textContent).not.toContain("body");
  });

  it("renders expanded at 240px with children only when open", () => {
    const el = mount(<Drawer tabs={TABS} active="patch" open onSelect={() => {}} onToggle={() => {}}><p>drawer-body</p></Drawer>);
    const panel = el.querySelector('[data-testid="panel"]') as HTMLElement;
    expect(panel.style.height).toBe("240px");
    expect(panel.textContent).toContain("drawer-body");
  });

  it("marks the active tab with aria-selected and a tablist role", () => {
    const el = mount(<Drawer tabs={TABS} active="errors" open={false} onSelect={() => {}} onToggle={() => {}}><p>body</p></Drawer>);
    const list = el.querySelector('[role="tablist"]');
    expect(list).toBeTruthy();
    const selected = el.querySelector('[data-testid="tab-errors"]') as HTMLButtonElement;
    expect(selected.getAttribute("aria-selected")).toBe("true");
    const other = el.querySelector('[data-testid="tab-patch"]') as HTMLButtonElement;
    expect(other.getAttribute("aria-selected")).toBe("false");
  });

  it("clicking a tab selects it and the chevron toggles the drawer", () => {
    const selected: string[] = [];
    let toggles = 0;
    const el = mount(
      <Drawer tabs={TABS} active="patch" open={false} onSelect={(id) => selected.push(id)} onToggle={() => (toggles += 1)}>
        <p>body</p>
      </Drawer>,
    );
    act(() => {
      (el.querySelector('[data-testid="tab-conflicts"]') as HTMLButtonElement).click();
    });
    expect(selected).toEqual(["conflicts"]);
    expect(toggles).toBe(0);
    const toggle = el.querySelector('[data-testid="panel"] button[aria-label]') as HTMLButtonElement;
    act(() => {
      toggle.click();
    });
    expect(toggles).toBe(1);
  });

  it("Ctrl+J toggles from a capture listener, including when the grid host has focus", () => {
    let toggles = 0;
    mount(<Drawer tabs={TABS} active="patch" open={false} onSelect={() => {}} onToggle={() => (toggles += 1)}><p>body</p></Drawer>);
    const gridHost = document.createElement("div");
    gridHost.className = "univer-root";
    document.body.appendChild(gridHost);
    try {
      const event = press("j", { ctrl: true, target: gridHost });
      expect(toggles).toBe(1);
      expect(event.defaultPrevented).toBe(true);
      press("j", { ctrl: true, meta: true, target: gridHost });
      expect(toggles).toBe(1);
      const input = document.createElement("input");
      document.body.appendChild(input);
      try {
        press("j", { ctrl: true, target: input });
        expect(toggles).toBe(1);
      } finally {
        input.remove();
      }
    } finally {
      gridHost.remove();
    }
  });

  it("Esc collapses an open drawer but yields to overlays that consumed the key first", () => {
    let toggles = 0;
    const el = mount(
      <Drawer tabs={TABS} active="patch" open onSelect={() => {}} onToggle={() => (toggles += 1)}>
        <p>body</p>
      </Drawer>,
    );
    press("Escape");
    expect(toggles).toBe(1);
    // 弹层(Dialog/Menu)先处理 Esc 并 preventDefault,抽屉不动。
    press("Escape", { prePrevented: true });
    expect(toggles).toBe(1);
    act(() => {
      root!.render(
        <Drawer tabs={TABS} active="patch" open={false} onSelect={() => {}} onToggle={() => (toggles += 1)}>
          <p>body</p>
        </Drawer>,
      );
    });
    press("Escape");
    expect(toggles).toBe(1);
    expect(el).toBeTruthy();
  });

  it("arrow keys move tab selection like the Tabs primitive", () => {
    const selected: string[] = [];
    const el = mount(
      <Drawer tabs={TABS} active="patch" open={false} onSelect={(id) => selected.push(id)} onToggle={() => {}}>
        <p>body</p>
      </Drawer>,
    );
    const list = el.querySelector('[role="tablist"]') as HTMLElement;
    act(() => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(selected).toEqual(["errors"]);
    act(() => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(selected).toEqual(["errors", "export"]);
  });
});

import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs, type TabItem } from "../src/components/ui/Tabs";

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

const items: TabItem[] = [
  { id: "all", label: "All" },
  { id: "conflict", label: "Conflict", count: 2, tone: "conflict" },
  { id: "danger", label: "Danger", count: 1, tone: "danger" },
];

function tab(el: HTMLElement, id: string): HTMLButtonElement {
  return el.querySelector(`[data-tab-id="${id}"]`) as HTMLButtonElement;
}

function ControlledTabs({ onChange }: { onChange(id: string): void }) {
  const [active, setActive] = useState("all");
  return (
    <Tabs
      items={items}
      active={active}
      onChange={(id) => {
        setActive(id);
        onChange(id);
      }}
    />
  );
}

describe("Tabs", () => {
  it("renders a tablist with one role=tab per item", () => {
    const el = mount(<Tabs items={items} active="all" onChange={() => {}} />);
    expect(el.querySelector('[role="tablist"]')).not.toBeNull();
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
  });

  it("marks only the active tab as selected", () => {
    const el = mount(<Tabs items={items} active="conflict" onChange={() => {}} />);
    expect(tab(el, "all").getAttribute("aria-selected")).toBe("false");
    expect(tab(el, "conflict").getAttribute("aria-selected")).toBe("true");
    expect(tab(el, "danger").getAttribute("aria-selected")).toBe("false");
  });

  it("renders the count badge and tone classes when provided", () => {
    const el = mount(<Tabs items={items} active="all" onChange={() => {}} />);
    const conflict = tab(el, "conflict");
    expect(conflict.querySelector(".tabs__count")?.textContent).toBe("2");
    expect(conflict.className).toContain("tabs__item--conflict");
    expect(tab(el, "danger").className).toContain("tabs__item--danger");
    expect(tab(el, "all").querySelector(".tabs__count")).toBeNull();
    expect(tab(el, "all").className).not.toContain("tabs__item--");
  });

  it("calls onChange with the clicked tab id and ignores clicks on the active tab", () => {
    const onChange = vi.fn();
    const el = mount(<ControlledTabs onChange={onChange} />);
    act(() => {
      tab(el, "danger").click();
    });
    expect(onChange).toHaveBeenCalledWith("danger");
    act(() => {
      tab(el, "danger").click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ArrowRight moves to the next tab and focuses it", () => {
    const onChange = vi.fn();
    const el = mount(<Tabs items={items} active="all" onChange={onChange} />);
    act(() => {
      tab(el, "all").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("conflict");
    expect(document.activeElement).toBe(tab(el, "conflict"));
  });

  it("ArrowRight wraps from the last tab to the first", () => {
    const onChange = vi.fn();
    const el = mount(<Tabs items={items} active="danger" onChange={onChange} />);
    act(() => {
      tab(el, "danger").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("ArrowLeft moves to the previous tab and wraps from the first to the last", () => {
    const onChange = vi.fn();
    const el = mount(<Tabs items={items} active="all" onChange={onChange} />);
    act(() => {
      tab(el, "all").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("danger");
  });

  it("keeps a roving tabindex with the active tab in the tab order", () => {
    const el = mount(<Tabs items={items} active="conflict" onChange={() => {}} />);
    expect(tab(el, "all").tabIndex).toBe(-1);
    expect(tab(el, "conflict").tabIndex).toBe(0);
    expect(tab(el, "danger").tabIndex).toBe(-1);
  });
});

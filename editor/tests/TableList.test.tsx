import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { TableList } from "../src/panels/TableList";
import { ToastProvider } from "../src/components/ui/Toast";
import { COPY } from "../src/app/copy";

const ONBOARDING_KEY = "lumio-config-editor:onboarded";

const TABLES = [
  { name: "skills", rowCount: 4, dirtyCount: 3, conflictCount: 0 },
  { name: "effects", rowCount: 12, dirtyCount: 0, conflictCount: 2 },
  { name: "items", rowCount: 0, dirtyCount: 0, conflictCount: 0 },
];

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

function mountList(props: Partial<Parameters<typeof TableList>[0]> = {}) {
  return mount(
    <ToastProvider>
      <TableList
        tables={TABLES}
        active="skills"
        collapsed={false}
        onSelect={() => {}}
        onToggleCollapse={() => {}}
        {...props}
      />
    </ToastProvider>,
  );
}

function input(node: HTMLElement, value: string) {
  const field = node.querySelector<HTMLInputElement>('[data-testid="table-list-search"]');
  if (!field) {
    throw new Error("search input not found");
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  localStorage.clear();
});

describe("TableList", () => {
  it("renders every table with row counts and keeps table-<name> testids", () => {
    const el = mountList();
    for (const table of TABLES) {
      const item = el.querySelector(`[data-testid="table-${table.name}"]`);
      expect(item, table.name).not.toBeNull();
    }
    expect(el.querySelector('[data-testid="table-skills"]')?.textContent).toContain(
      COPY.sidebar.rowCount(4),
    );
    expect(el.querySelector('[data-testid="table-effects"]')?.textContent).toContain(
      COPY.sidebar.rowCount(12),
    );
  });

  it("filters tables by the search query", () => {
    const el = mountList();
    input(el, "ski");
    expect(el.querySelector('[data-testid="table-skills"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="table-effects"]')).toBeNull();
    expect(el.querySelector('[data-testid="table-items"]')).toBeNull();

    input(el, "");
    expect(el.querySelector('[data-testid="table-effects"]')).not.toBeNull();
  });

  it("marks the active table with is-active and aria-current", () => {
    const el = mountList({ active: "effects" });
    const active = el.querySelector<HTMLButtonElement>('[data-testid="table-effects"]');
    const other = el.querySelector<HTMLButtonElement>('[data-testid="table-skills"]');
    expect(active?.className).toContain("is-active");
    expect(active?.getAttribute("aria-current")).toBe("true");
    expect(other?.className).not.toContain("is-active");
    expect(other?.getAttribute("aria-current")).toBeNull();
  });

  it("shows a dirty badge with count and a conflict badge with reasons", () => {
    const el = mountList();
    const dirty = el.querySelector('[data-testid="table-skills"] .table-list__badge--dirty');
    expect(dirty?.textContent).toBe("3");
    expect(dirty?.getAttribute("title")).toBe(COPY.phase.dirty(3));

    const conflict = el.querySelector('[data-testid="table-effects"] .table-list__badge--conflict');
    expect(conflict?.textContent).toBe(COPY.sidebar.conflictBadge);
    expect(conflict?.getAttribute("title")).toBe(COPY.sidebar.conflictBadgeTitle);

    expect(el.querySelector('[data-testid="table-items"] .table-list__badge--dirty')).toBeNull();
    expect(el.querySelector('[data-testid="table-items"] .table-list__badge--conflict')).toBeNull();
  });

  it("calls onSelect with the table name on click", () => {
    const selected: string[] = [];
    const el = mountList({ onSelect: (name) => selected.push(name) });
    act(() => {
      (el.querySelector('[data-testid="table-effects"]') as HTMLButtonElement).click();
    });
    expect(selected).toEqual(["effects"]);
  });

  it("collapsed rail shows initials with dirty dots, keeps testids, hides search", () => {
    const el = mountList({ collapsed: true });
    expect(el.querySelector('[data-testid="table-list-search"]')).toBeNull();

    const skills = el.querySelector<HTMLButtonElement>('[data-testid="table-skills"]');
    expect(skills?.textContent).toContain("S");
    expect(skills?.getAttribute("title")).toBe("skills");
    expect(skills?.querySelector(".table-list__rail-dot")).not.toBeNull();

    const effects = el.querySelector<HTMLButtonElement>('[data-testid="table-effects"]');
    expect(effects?.textContent).toContain("E");
    expect(effects?.querySelector(".table-list__rail-dot")).toBeNull();

    const items = el.querySelector<HTMLButtonElement>('[data-testid="table-items"]');
    expect(items?.textContent).toContain("I");
  });

  it("keeps selection working in collapsed mode", () => {
    const selected: string[] = [];
    const el = mountList({ collapsed: true, onSelect: (name) => selected.push(name) });
    act(() => {
      (el.querySelector('[data-testid="table-items"]') as HTMLButtonElement).click();
    });
    expect(selected).toEqual(["items"]);
  });

  it("toggle button calls onToggleCollapse in both states", () => {
    let toggles = 0;
    const el = mountList({ onToggleCollapse: () => (toggles += 1) });
    act(() => {
      (el.querySelector('[data-testid="sidebar-toggle"]') as HTMLButtonElement).click();
    });
    expect(toggles).toBe(1);
  });

  it("toggle button in collapsed state also calls onToggleCollapse", () => {
    let toggles = 0;
    const el = mountList({ collapsed: true, onToggleCollapse: () => (toggles += 1) });
    act(() => {
      (el.querySelector('[data-testid="sidebar-toggle"]') as HTMLButtonElement).click();
    });
    expect(toggles).toBe(1);
  });

  it("shows the onboarding toast exactly once via localStorage", () => {
    localStorage.removeItem(ONBOARDING_KEY);
    const first = mountList();
    const region = first.querySelector(".toast-region");
    expect(region?.textContent).toBe(COPY.onboardingToast);
    expect(localStorage.getItem(ONBOARDING_KEY)).not.toBeNull();

    act(() => root!.unmount());
    first.remove();

    const second = mountList();
    expect(second.querySelector(".toast-region")?.textContent).toBe("");
  });

  it("skips the onboarding toast when the localStorage key is already set", () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    const el = mountList();
    expect(el.querySelector(".toast-region")?.textContent).toBe("");
  });
});

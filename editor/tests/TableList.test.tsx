import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableList } from "../src/panels/TableList";
import { ToastProvider } from "../src/components/ui/Toast";
import { COPY } from "../src/app/copy";
import { isStorageFallback, safeStorage } from "../src/app/storage";

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
  safeStorage("local").clear();
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

  it("shows the onboarding toast exactly once via safeStorage", () => {
    safeStorage("local").removeItem(ONBOARDING_KEY);
    const first = mountList();
    const region = first.querySelector(".toast-region");
    expect(region?.textContent).toBe(COPY.onboardingToast);
    expect(safeStorage("local").getItem(ONBOARDING_KEY)).not.toBeNull();

    act(() => root!.unmount());
    first.remove();

    const second = mountList();
    expect(second.querySelector(".toast-region")?.textContent).toBe("");
  });

  it("skips the onboarding toast when the storage key is already set", () => {
    safeStorage("local").setItem(ONBOARDING_KEY, "1");
    const el = mountList();
    expect(el.querySelector(".toast-region")?.textContent).toBe("");
  });

  it("degrades to prompting on every mount when storage falls back to the shim", async () => {
    // M7-K S04:隐私模式 / 存储被禁 / Node 26 遮蔽时 storage 取不到。
    // 组件不得抛异常,onboarding toast 退化为每次都提示(不静默吞)。
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => undefined,
    });
    try {
      // 重置模块注册表并动态引入,保证 storage 探测在"取不到"的环境下进行,
      // 不依赖 safeStorage 实现是否缓存探测结果。
      vi.resetModules();
      const { act: freshAct } = await import("react");
      const { createRoot: freshCreateRoot } = await import("react-dom/client");
      const { TableList: FreshTableList } = await import("../src/panels/TableList");
      const { ToastProvider: FreshToastProvider } = await import("../src/components/ui/Toast");
      const { isStorageFallback: freshIsFallback } = await import("../src/app/storage");
      expect(freshIsFallback("local")).toBe(true);

      const mountFresh = () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const freshRoot = freshCreateRoot(host);
        freshAct(() => {
          freshRoot.render(
            <FreshToastProvider>
              <FreshTableList
                tables={TABLES}
                active="skills"
                collapsed={false}
                onSelect={() => {}}
                onToggleCollapse={() => {}}
              />
            </FreshToastProvider>,
          );
        });
        return { host, freshRoot };
      };

      const first = mountFresh();
      expect(first.host.querySelector(".toast-region")?.textContent).toBe(COPY.onboardingToast);
      freshAct(() => first.freshRoot.unmount());
      first.host.remove();

      // 垫片无法持久化「已提示」标记:再次挂载仍要提示,而不是崩或静默。
      const second = mountFresh();
      expect(second.host.querySelector(".toast-region")?.textContent).toBe(COPY.onboardingToast);
      freshAct(() => second.freshRoot.unmount());
      second.host.remove();
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "localStorage", descriptor);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    }
  });

  it("isStorageFallback is false under a working jsdom localStorage", () => {
    // 本机(Node 24)对照组:真实 storage 可用时不应落入垫片。
    expect(isStorageFallback("local")).toBe(false);
  });
});

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

  /**
   * M7-E §4 / S03:右键菜单。右键 / Shift+F10 / ContextMenu 键三入口,↑↓ Enter Esc
   * 键盘操作,第三项(reveal)按 revealEnabled===true 整项渲染,否则整项不渲染。
   */

  function menuEl(): HTMLElement | null {
    return document.querySelector('[role="menu"]');
  }

  function menuItems(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }

  function contextMenu(target: HTMLElement, x = 12, y = 24) {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  }

  function press(target: HTMLElement, k: string, shift = false) {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true }),
      );
    });
  }

  function pressMenu(k: string) {
    const menu = menuEl();
    if (!menu) {
      throw new Error("menu not open");
    }
    press(menu, k);
  }

  function rowOf(el: HTMLElement, name: string): HTMLElement {
    return el.querySelector(`[data-testid="table-${name}"]`) as HTMLElement;
  }

  it("右键表名打开菜单:查看源文件/查看 Schema 两项带路径,并抑制浏览器默认菜单(M7-E S03)", () => {
    const el = mountList();
    const event = contextMenu(rowOf(el, "skills"));
    expect(event.defaultPrevented).toBe(true);
    const items = menuItems();
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain(COPY.tableMenu.viewSource);
    expect(items[0]!.textContent).toContain("tables/skills.txt");
    expect(items[1]!.textContent).toContain(COPY.tableMenu.viewSchema);
    expect(items[1]!.textContent).toContain("schemas/skills.json");
  });

  it("Shift+F10 与 ContextMenu 键都能打开菜单(键盘入口,S03)", () => {
    const el = mountList();
    press(rowOf(el, "effects"), "F10", true);
    expect(menuEl()).not.toBeNull();
    pressMenu("Escape");
    expect(menuEl()).toBeNull();

    press(rowOf(el, "items"), "ContextMenu");
    expect(menuEl()).not.toBeNull();
  });

  it("菜单键盘操作:↓ 高亮第二项,Enter 执行 onViewSource(kind=schema),Esc 关闭(S03)", () => {
    const viewed: Array<[string, string]> = [];
    const el = mountList({ onViewSource: (table, kind) => viewed.push([table, kind]) });
    press(rowOf(el, "skills"), "F10", true);
    pressMenu("ArrowDown");
    expect(menuItems()[1]!.className).toContain("is-active");
    pressMenu("Enter");
    expect(viewed).toEqual([["skills", "schema"]]);
    expect(menuEl()).toBeNull();

    // 重开后默认高亮第一项,Enter → 查看源文件(kind=table)
    press(rowOf(el, "skills"), "F10", true);
    pressMenu("Enter");
    expect(viewed).toEqual([
      ["skills", "schema"],
      ["skills", "table"],
    ]);

    press(rowOf(el, "skills"), "F10", true);
    pressMenu("Escape");
    expect(menuEl()).toBeNull();
  });

  it("revealEnabled 缺省或 false:第三项整项不渲染,不是禁用态(S03)", () => {
    const el = mountList();
    contextMenu(rowOf(el, "skills"));
    expect(menuItems()).toHaveLength(2);
    expect(menuItems().some((item) => item.textContent?.includes(COPY.tableMenu.reveal))).toBe(false);
    pressMenu("Escape");

    const el2 = mountList({ revealEnabled: false });
    contextMenu(rowOf(el2, "skills"));
    expect(menuItems().some((item) => item.textContent?.includes(COPY.tableMenu.reveal))).toBe(false);
  });

  it("revealEnabled=true:第三项渲染,点击调 onReveal;未传 onReveal 时点击为 noop(M7-G 预留)", () => {
    const revealed: string[] = [];
    const el = mountList({ revealEnabled: true, onReveal: (table) => revealed.push(table) });
    contextMenu(rowOf(el, "skills"));
    const items = menuItems();
    expect(items).toHaveLength(3);
    expect(items[2]!.textContent).toContain(COPY.tableMenu.reveal);
    act(() => {
      items[2]!.click();
    });
    expect(revealed).toEqual(["skills"]);
    expect(menuEl()).toBeNull();

    // Host 端点未上线(M7-G):未接 onReveal 时点击不得抛。
    const el2 = mountList({ revealEnabled: true });
    contextMenu(rowOf(el2, "effects"));
    const third = menuItems()[2]!;
    expect(() =>
      act(() => {
        third.click();
      }),
    ).not.toThrow();
  });

  it("折叠态 rail 项右键同样出菜单(M7-E §4)", () => {
    const el = mountList({ collapsed: true });
    contextMenu(rowOf(el, "effects"));
    const items = menuItems();
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("tables/effects.txt");
  });
});

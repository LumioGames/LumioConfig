import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu, type MenuItem } from "../src/components/ui/Menu";

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

function menuEl(): HTMLElement {
  return document.querySelector('[role="menu"]') as HTMLElement;
}

function itemEls(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('[role="menuitem"]');
}

function press(key: string) {
  act(() => {
    menuEl().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

const onSelectA = vi.fn();
const onSelectB = vi.fn();
const onSelectC = vi.fn();
const onClose = vi.fn();

const items: MenuItem[] = [
  { id: "a", label: "Alpha", onSelect: onSelectA },
  {
    id: "b",
    label: "Beta",
    shortcut: "Ctrl+B",
    disabled: true,
    disabledReason: "Not available now",
    onSelect: onSelectB,
  },
  { id: "c", label: "Gamma", group: "extra", onSelect: onSelectC },
];

function mountMenu(anchor = { x: 10, y: 10 }) {
  mount(<Menu items={items} anchor={anchor} open onClose={onClose} />);
}

beforeEach(() => {
  onSelectA.mockClear();
  onSelectB.mockClear();
  onSelectC.mockClear();
  onClose.mockClear();
});

describe("Menu", () => {
  it("renders nothing while closed", () => {
    mount(<Menu items={items} anchor={{ x: 0, y: 0 }} open={false} onClose={onClose} />);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("renders a menu with one menuitem per item, shortcuts and group captions", () => {
    mountMenu();
    const menu = menuEl();
    expect(menu.className).toContain("menu");
    expect(itemEls().length).toBe(3);
    expect(menu.textContent).toContain("Ctrl+B");
    expect(menu.querySelectorAll(".menu__group").length).toBe(1);
    expect(menu.querySelector(".menu__group")?.textContent).toBe("extra");
  });

  it("exposes disabledReason as title with aria-disabled on disabled items", () => {
    mountMenu();
    const beta = itemEls()[1];
    expect(beta.getAttribute("title")).toBe("Not available now");
    expect(beta.getAttribute("aria-disabled")).toBe("true");
    expect(itemEls()[0].getAttribute("aria-disabled")).toBeNull();
  });

  it("focuses the menu root and highlights the first enabled item on open", () => {
    mountMenu();
    expect(document.activeElement).toBe(menuEl());
    expect(itemEls()[0].className).toContain("is-active");
  });

  it("Enter activates the highlighted item and closes", () => {
    mountMenu();
    press("Enter");
    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown skips disabled items; Enter activates the reached item", () => {
    mountMenu();
    press("ArrowDown");
    expect(itemEls()[2].className).toContain("is-active");
    press("Enter");
    expect(onSelectC).toHaveBeenCalledTimes(1);
    expect(onSelectB).not.toHaveBeenCalled();
  });

  it("ArrowUp from the first item wraps to the last enabled item", () => {
    mountMenu();
    press("ArrowUp");
    expect(itemEls()[2].className).toContain("is-active");
  });

  it("Escape closes the menu", () => {
    mountMenu();
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("activates an item on click and ignores clicks on disabled items", () => {
    mountMenu();
    act(() => {
      itemEls()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectB).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      itemEls()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clamps the anchored position to the viewport edges", () => {
    mountMenu({ x: 5000, y: 5000 });
    const menu = menuEl();
    expect(menu.style.left).toBe(`${window.innerWidth}px`);
    expect(menu.style.top).toBe(`${window.innerHeight}px`);
  });

  it("never positions the menu at negative coordinates", () => {
    mountMenu({ x: -50, y: -50 });
    const menu = menuEl();
    expect(menu.style.left).toBe("0px");
    expect(menu.style.top).toBe("0px");
  });
});

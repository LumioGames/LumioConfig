import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHotkeys, type HotkeyMap } from "../src/components/ui/useHotkeys";

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

function rerender(node: ReactElement) {
  act(() => {
    root!.render(node);
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

function Harness({ map, enabled }: { map: HotkeyMap; enabled?: boolean }) {
  useHotkeys(map, enabled === undefined ? undefined : { enabled });
  return null;
}

function pressOn(target: EventTarget, key: string, modifiers?: { ctrl?: boolean; shift?: boolean }) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: modifiers?.ctrl ?? false,
      shiftKey: modifiers?.shift ?? false,
    }),
  );
}

describe("useHotkeys", () => {
  it("invokes the handler whose combo exactly matches the event", () => {
    const ctrlEnter = vi.fn();
    const ctrlShiftEnter = vi.fn();
    const escape = vi.fn();
    mount(
      <Harness
        map={{ "Ctrl+Enter": ctrlEnter, "Ctrl+Shift+Enter": ctrlShiftEnter, Escape: escape }}
      />,
    );
    pressOn(window, "Enter", { ctrl: true });
    expect(ctrlEnter).toHaveBeenCalledTimes(1);
    expect(ctrlShiftEnter).not.toHaveBeenCalled();
    expect(escape).not.toHaveBeenCalled();
  });

  it("matches Escape and Ctrl+Shift+Enter without cross-firing", () => {
    const ctrlEnter = vi.fn();
    const ctrlShiftEnter = vi.fn();
    const escape = vi.fn();
    mount(
      <Harness
        map={{ "Ctrl+Enter": ctrlEnter, "Ctrl+Shift+Enter": ctrlShiftEnter, Escape: escape }}
      />,
    );
    pressOn(window, "Escape");
    expect(escape).toHaveBeenCalledTimes(1);
    pressOn(window, "Enter", { ctrl: true, shift: true });
    expect(ctrlShiftEnter).toHaveBeenCalledTimes(1);
    expect(ctrlEnter).not.toHaveBeenCalled();
  });

  it("does not fire when modifiers are missing or extra", () => {
    const ctrlEnter = vi.fn();
    mount(<Harness map={{ "Ctrl+Enter": ctrlEnter }} />);
    pressOn(window, "Enter");
    pressOn(window, "Enter", { shift: true });
    expect(ctrlEnter).not.toHaveBeenCalled();
  });

  it("passes the keyboard event to the handler", () => {
    const handler = vi.fn();
    mount(<Harness map={{ Escape: handler }} />);
    pressOn(window, "Escape");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent);
  });

  it("ignores events typed inside input, textarea and contenteditable targets", () => {
    const ctrlEnter = vi.fn();
    mount(<Harness map={{ "Ctrl+Enter": ctrlEnter }} />);
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    for (const node of [input, textarea, editable]) {
      document.body.appendChild(node);
      pressOn(node, "Enter", { ctrl: true });
      node.remove();
    }
    expect(ctrlEnter).not.toHaveBeenCalled();
  });

  it("ignores events originating inside the Univer editor host", () => {
    const escape = vi.fn();
    mount(<Harness map={{ Escape: escape }} />);
    const host = document.createElement("div");
    host.className = "univer-root";
    const cell = document.createElement("span");
    host.appendChild(cell);
    document.body.appendChild(host);
    pressOn(cell, "Escape");
    expect(escape).not.toHaveBeenCalled();
    host.remove();
  });

  it("detaches when enabled is false and reattaches when re-enabled", () => {
    const escape = vi.fn();
    mount(<Harness map={{ Escape: escape }} enabled={false} />);
    pressOn(window, "Escape");
    expect(escape).not.toHaveBeenCalled();
    rerender(<Harness map={{ Escape: escape }} enabled={true} />);
    pressOn(window, "Escape");
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it("stops listening after unmount", () => {
    const escape = vi.fn();
    mount(<Harness map={{ Escape: escape }} />);
    act(() => root!.unmount());
    root = null;
    pressOn(window, "Escape");
    expect(escape).not.toHaveBeenCalled();
  });
});

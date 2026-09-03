import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../src/app/copy";
import { SubmitConfirm } from "../src/panels/SubmitConfirm";

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

const CONFIRM_TEXT = COPY.submitConfirm(3, "main", "a10eb3f", "skills", "update skills", true, false);

function confirm(open: boolean, onConfirm = vi.fn(), onCancel = vi.fn()) {
  return <SubmitConfirm open={open} text={CONFIRM_TEXT} onConfirm={onConfirm} onCancel={onCancel} />;
}

function press(node: EventTarget, key: string) {
  node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("SubmitConfirm", () => {
  it("renders nothing when closed", () => {
    const el = mount(confirm(false));
    expect(el.querySelector('[data-testid="submit-confirm-text"]')).toBeNull();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows the confirm text inside a dialog with 确认 / 取消 actions", () => {
    const el = mount(confirm(true));
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(el.querySelector('[data-testid="submit-confirm-text"]')?.textContent).toBe(CONFIRM_TEXT);
    expect(el.querySelector('[data-testid="submit-confirm-ok"]')?.textContent).toBe("确认");
    expect(el.querySelector('[data-testid="submit-confirm-cancel"]')?.textContent).toBe("取消");
  });

  it("focuses the confirm button so Enter confirms without touching the mouse", () => {
    mount(confirm(true));
    expect(document.activeElement?.getAttribute("data-testid")).toBe("submit-confirm-ok");
  });

  it("Enter on the focused confirm button calls onConfirm and not onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    mount(confirm(true, onConfirm, onCancel));
    const focused = document.activeElement as HTMLElement;
    act(() => {
      press(focused, "Enter");
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Escape cancels", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    mount(confirm(true, onConfirm, onCancel));
    const focused = document.activeElement as HTMLElement;
    act(() => {
      press(focused, "Escape");
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking 确认 / 取消 triggers the respective callback", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const el = mount(confirm(true, onConfirm, onCancel));
    act(() => {
      (el.querySelector('[data-testid="submit-confirm-cancel"]') as HTMLElement).click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => {
      (el.querySelector('[data-testid="submit-confirm-ok"]') as HTMLElement).click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

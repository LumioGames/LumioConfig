import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../src/components/ui/Dialog";

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

function press(el: Element, key: string, shiftKey = false) {
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
  );
}

const actions = (
  <>
    <button type="button">Cancel</button>
    <button type="button">Confirm</button>
  </>
);

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    const el = mount(
      <Dialog open={false} title="Confirm" onClose={() => {}}>
        body
      </Dialog>,
    );
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders role=dialog with aria-modal, the title, body and actions", () => {
    const el = mount(
      <Dialog open title="Confirm" onClose={() => {}} actions={actions}>
        <p>Are you sure?</p>
      </Dialog>,
    );
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(el.querySelector(".dialog__backdrop")?.contains(dialog)).toBe(true);
    expect(dialog.querySelector(".dialog__title")?.textContent).toBe("Confirm");
    expect(dialog.querySelector(".dialog__body")?.textContent).toContain("Are you sure?");
    const buttons = dialog.querySelectorAll(".dialog__actions button");
    expect(buttons.length).toBe(2);
  });

  it("moves focus into the dialog on open, preferring the first focusable element", () => {
    mount(
      <Dialog open title="Confirm" onClose={() => {}} actions={actions}>
        <p>Are you sure?</p>
      </Dialog>,
    );
    const buttons = document.querySelectorAll(".dialog__actions button");
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("focuses the dialog container itself when nothing inside is focusable", () => {
    mount(
      <Dialog open title="Notice" onClose={() => {}}>
        <p>Plain text only</p>
      </Dialog>,
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(dialog);
  });

  it("traps Tab focus in a cycle inside the dialog", () => {
    mount(
      <Dialog open title="Confirm" onClose={() => {}} actions={actions}>
        <p>Are you sure?</p>
      </Dialog>,
    );
    const buttons = document.querySelectorAll(
      ".dialog__actions button",
    ) as NodeListOf<HTMLButtonElement>;
    const first = buttons[0];
    const second = buttons[1];

    press(first, "Tab");
    expect(document.activeElement).toBe(second);

    press(second, "Tab");
    expect(document.activeElement).toBe(first);

    press(first, "Tab", true);
    expect(document.activeElement).toBe(second);

    press(second, "Tab", true);
    expect(document.activeElement).toBe(first);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    mount(
      <Dialog open title="Confirm" onClose={onClose}>
        <p>Are you sure?</p>
      </Dialog>,
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    press(dialog.querySelector(".dialog__body") as Element, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the previously focused element after close", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const dialog = (
      <Dialog open title="Confirm" onClose={() => {}}>
        <p>Are you sure?</p>
      </Dialog>
    );
    mount(dialog);
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
    rerender(
      <Dialog open={false} title="Confirm" onClose={() => {}}>
        <p>Are you sure?</p>
      </Dialog>,
    );
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

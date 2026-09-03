import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../src/components/ui/Toast";

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
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function PushButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(text)}>
      push
    </button>
  );
}

function pushOnce(el: HTMLElement) {
  act(() => {
    (el.querySelector("button") as HTMLButtonElement).click();
  });
}

function region(): HTMLElement {
  return document.querySelector('[role="status"]') as HTMLElement;
}

function PushMany({ texts }: { texts: string[] }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => texts.forEach(toast)}>
      push
    </button>
  );
}

function Outside() {
  useToast();
  return null;
}

describe("Toast", () => {
  it("shows a role=status toast region with the pushed text", () => {
    const el = mount(
      <ToastProvider>
        <PushButton text="Saved" />
      </ToastProvider>,
    );
    pushOnce(el);
    expect(region()).not.toBeNull();
    expect(region().className).toContain("toast-region");
    expect(region().querySelector(".toast")?.textContent).toBe("Saved");
  });

  it("removes the toast after 2600ms", () => {
    const el = mount(
      <ToastProvider>
        <PushButton text="Saved" />
      </ToastProvider>,
    );
    pushOnce(el);
    act(() => {
      vi.advanceTimersByTime(2599);
    });
    expect(region().querySelectorAll(".toast").length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().querySelectorAll(".toast").length).toBe(0);
  });

  it("keeps at most three toasts, dropping the oldest", () => {
    const el = mount(
      <ToastProvider>
        <PushMany texts={["one", "two", "three", "four"]} />
      </ToastProvider>,
    );
    pushOnce(el);
    const toasts = region().querySelectorAll(".toast");
    expect(toasts.length).toBe(3);
    expect(region().textContent).not.toContain("one");
    expect(region().textContent).toContain("two");
    expect(region().textContent).toContain("three");
    expect(region().textContent).toContain("four");
  });

  it("throws when useToast is used outside the provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => mount(<Outside />)).toThrow(/ToastProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});

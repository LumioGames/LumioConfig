import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Panel } from "../src/components/ui/Panel";

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

describe("Panel", () => {
  it("renders a <section> with the base panel class by default", () => {
    const el = mount(
      <Panel data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.tagName).toBe("SECTION");
    expect(node.className).toBe("panel");
  });

  it("adds panel--boxed for variant=boxed", () => {
    const el = mount(
      <Panel variant="boxed" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.className).toBe("panel panel--boxed");
  });

  it("adds panel--warning for tone=warning", () => {
    const el = mount(
      <Panel tone="warning" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.className).toBe("panel panel--warning");
  });

  it("renders as the requested tag via `as`", () => {
    const el = mount(
      <Panel as="ul" data-testid="p">
        <li>item</li>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.tagName).toBe("UL");
  });

  it("renders an optional title as an <h2> before children", () => {
    const el = mount(
      <Panel title="提交冲突" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.firstElementChild?.tagName).toBe("H2");
    expect(node.firstElementChild?.textContent).toBe("提交冲突");
  });

  it("renders no <h2> when title is omitted", () => {
    const el = mount(
      <Panel data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.querySelector("h2")).toBeNull();
  });

  it("merges a caller-provided className after the modifier classes", () => {
    const el = mount(
      <Panel tone="warning" className="conflict-panel" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.className).toBe("panel panel--warning conflict-panel");
  });
});

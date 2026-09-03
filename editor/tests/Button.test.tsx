import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "../src/components/ui/Button";

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

describe("Button", () => {
  it("defaults to variant=default and type=button", () => {
    const el = mount(<Button data-testid="btn">Go</Button>);
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.className).toBe("btn btn--default");
    expect(button.textContent).toBe("Go");
  });

  it("applies the requested variant class", () => {
    const el = mount(
      <Button variant="primary" data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--primary");
  });

  it("adds is-active only when active is true", () => {
    const el = mount(
      <Button variant="nav" active data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--nav is-active");
  });

  it("does not add is-active when active is false", () => {
    const el = mount(
      <Button variant="nav" data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--nav");
  });

  it("merges a caller-provided className after the variant class", () => {
    const el = mount(
      <Button className="conflict-panel" data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--default conflict-panel");
  });

  it("forwards native button attributes like disabled and onClick", () => {
    let clicks = 0;
    const el = mount(
      <Button data-testid="btn" onClick={() => (clicks += 1)} disabled={false}>
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    act(() => {
      button.click();
    });
    expect(clicks).toBe(1);
  });
});

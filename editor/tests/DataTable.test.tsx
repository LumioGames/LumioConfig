import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable } from "../src/components/ui/DataTable";

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

interface Row {
  id: string;
  name: string;
}

describe("DataTable", () => {
  const rows: Row[] = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
  ];

  it("renders one header cell per column and one row per item, in order", () => {
    const el = mount(
      <DataTable
        data-testid="dt"
        rowKey={(row) => row.id}
        rows={rows}
        columns={[
          { key: "id", header: "ID", render: (row) => row.id },
          { key: "name", header: "Name", render: (row) => row.name },
        ]}
      />,
    );
    const table = el.querySelector('[data-testid="dt"]') as HTMLTableElement;
    expect(table.tagName).toBe("TABLE");
    expect(table.className).toBe("data-table");
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toEqual(["ID", "Name"]);
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].textContent).toBe("aAlpha");
    expect(bodyRows[1].textContent).toBe("bBeta");
  });

  it("renders an empty tbody when rows is empty", () => {
    const el = mount(
      <DataTable
        data-testid="dt"
        rowKey={(row) => row.id}
        rows={[] as Row[]}
        columns={[{ key: "id", header: "ID", render: (row) => row.id }]}
      />,
    );
    const table = el.querySelector('[data-testid="dt"]') as HTMLTableElement;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(table.querySelectorAll("thead th")).toHaveLength(1);
  });
});

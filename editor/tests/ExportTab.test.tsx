import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportTab, type ExportRequest, type ExportResult } from "../src/panels/drawer/ExportTab";

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

function result(files: ExportResult["files"]): ExportResult {
  return { exportId: "e1", files };
}

function byTestId(el: HTMLElement, id: string): HTMLElement {
  const node = el.querySelector(`[data-testid="${id}"]`);
  if (!node) {
    throw new Error(`missing [data-testid="${id}"]`);
  }
  return node as HTMLElement;
}

/** react-dom 下驱动受控 <select>:改值 + 派发 change。 */
function selectValue(el: HTMLElement, id: string, value: string) {
  act(() => {
    const select = byTestId(el, id) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickExport(el: HTMLElement) {
  await act(async () => {
    byTestId(el, "btn-export").click();
  });
}

describe("ExportTab(§8 导出页签)", () => {
  it("sends the default request: all tables, csv, repo, no targets key", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(<ExportTab tables={["skills", "cost"]} onExport={onExport} />);
    await clickExport(el);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0][0]).toStrictEqual({
      tables: ["skills", "cost"],
      format: "csv",
      source: "repo",
    });
  });

  it("maps multi-select tables, format, source and target column onto the request", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(<ExportTab tables={["skills", "cost", "tags"]} onExport={onExport} />);
    act(() => {
      byTestId(el, "export-table-cost").click(); // 取消勾选 cost
    });
    selectValue(el, "export-format", "tsv");
    selectValue(el, "export-source", "draft");
    selectValue(el, "export-target", "C");
    await clickExport(el);
    expect(onExport.mock.calls[0][0]).toStrictEqual({
      tables: ["skills", "tags"],
      format: "tsv",
      source: "draft",
      targets: ["C"],
    });
  });

  it("disables btn-export while no table is selected", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(<ExportTab tables={["skills"]} onExport={onExport} />);
    act(() => {
      byTestId(el, "export-table-skills").click();
    });
    const button = byTestId(el, "btn-export") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await clickExport(el);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("lists returned files including README.txt as export-link anchors", async () => {
    const onExport = vi.fn((_req: ExportRequest) =>
      Promise.resolve(
        result([
          { table: "skills", href: "/api/export/e7/skills.csv" },
          { table: null, href: "/api/export/e7/README.txt" },
        ]),
      ),
    );
    const el = mount(<ExportTab tables={["skills"]} onExport={onExport} />);
    await clickExport(el);
    const links = Array.from(el.querySelectorAll('[data-testid="export-link"]')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/api/export/e7/skills.csv",
      "/api/export/e7/README.txt",
    ]);
    // README.txt 行没有表名,链接文字回退为文件名本身。
    expect(links[1].textContent).toContain("README.txt");
  });

  it("shows the failure message in export-hint when onExport rejects", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.reject(new Error("导出服务不可用")));
    const el = mount(<ExportTab tables={["skills"]} onExport={onExport} />);
    await clickExport(el);
    expect(byTestId(el, "export-hint").textContent).toContain("导出服务不可用");
    expect(el.querySelectorAll('[data-testid="export-link"]').length).toBe(0);
  });

  it("renders the one-way note from COPY, never 'autoCommit' or 'local.json'", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(<ExportTab tables={["skills"]} onExport={onExport} />);
    expect(el.textContent).toContain("单向生成物，不会导回仓库");
    expect(el.textContent).not.toContain("autoCommit");
    expect(el.textContent).not.toContain("local.json");
  });

  // M7-F S03:格式选项从 capabilities(formats prop)渲染,Host 说了算,不写死三项。
  it("renders format options from the formats prop (capabilities), with the TXT label from COPY", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(
      <ExportTab tables={["skills"]} onExport={onExport} formats={["csv", "tsv", "txt"]} />,
    );
    const options = Array.from(byTestId(el, "export-format").querySelectorAll("option"));
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual(["csv", "tsv", "txt"]);
    expect(options[2].textContent).toContain("TXT");
    expect(options[2].textContent).toContain("权威文本格式");
  });

  it("omits the txt option when the host capabilities do not include it", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(
      <ExportTab tables={["skills"]} onExport={onExport} formats={["csv", "tsv"]} />,
    );
    const options = Array.from(byTestId(el, "export-format").querySelectorAll("option"));
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual(["csv", "tsv"]);
    expect(el.textContent).not.toContain("权威文本格式");
  });

  it("appends the txt note when TXT is selected, and the draft note on top of it for source=draft", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(<ExportTab tables={["skills"]} onExport={onExport} />);
    expect(el.textContent).toContain("单向生成物，不会导回仓库"); // exportNote 常驻
    expect(el.textContent).not.toContain("只读快照");
    selectValue(el, "export-format", "txt");
    expect(el.textContent).toContain("TXT 是源表格式的只读快照，不能拷回仓库覆盖");
    expect(el.textContent).not.toContain("含未提交草稿");
    selectValue(el, "export-source", "draft");
    expect(el.textContent).toContain("含未提交草稿，与仓库不一致");
    expect(el.textContent).toContain("单向生成物，不会导回仓库"); // exportNote 仍在,TXT 段是追加
  });

  // Owner 闸门选项 A:TXT 只出全列 → 目标列选择器禁用 + 原因文案 + 请求不带 targets。
  it("disables target filtering with a reason under TXT and omits targets from the request", async () => {
    const onExport = vi.fn((_req: ExportRequest) => Promise.resolve(result([])));
    const el = mount(<ExportTab tables={["skills"]} onExport={onExport} />);
    selectValue(el, "export-target", "C"); // 先在 CSV 下选了 C,再切 TXT
    selectValue(el, "export-format", "txt");
    const target = byTestId(el, "export-target") as HTMLSelectElement;
    expect(target.disabled).toBe(true);
    expect(target.title).not.toBe("");
    expect(target.value).toBe(""); // 显示回落「全部」,不残留 C
    await clickExport(el);
    expect(onExport.mock.calls[0][0]).toStrictEqual({
      tables: ["skills"],
      format: "txt",
      source: "repo",
    });
  });
});

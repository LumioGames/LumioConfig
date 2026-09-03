import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffTab, type DiffBasis, type MyChange } from "../src/panels/drawer/DiffTab";
import type { HistoryEntry } from "../src/api/types";

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

const MINE: MyChange[] = [
  { row: 3, rowId: "40001", column: "damage", from: "120", to: "130" },
];

const HISTORY: HistoryEntry[] = [
  {
    revision: "a10eb3f",
    message: "config(skills): rename frostbolt",
    time: "2026-09-01T10:00:00+08:00",
    author: "Editor Test",
    cells: [{ row: "frostbolt", rowId: "40002", column: "name", from: "frostbolt", to: "frost_bolt" }],
    created: ["40003"],
    deleted: [],
    schemaChanged: false,
  },
];

interface MountOptions {
  enabled?: boolean;
  mine?: MyChange[];
  history?: HistoryEntry[];
  basis?: DiffBasis;
  mark?: boolean;
  onBasisChange?: (basis: DiffBasis) => void;
  onMarkChange?: (mark: boolean) => void;
  onJump?: (row: number | string, column: string) => void;
}

function mountTab(options: MountOptions = {}): HTMLDivElement {
  const onBasisChange = vi.fn();
  const onMarkChange = vi.fn();
  const onJump = vi.fn();
  const el = mount(
    <DiffTab
      enabled={options.enabled ?? true}
      mine={options.mine ?? MINE}
      history={options.history ?? HISTORY}
      basis={options.basis ?? "last-seen"}
      onBasisChange={options.onBasisChange ?? onBasisChange}
      mark={options.mark ?? false}
      onMarkChange={options.onMarkChange ?? onMarkChange}
      onJump={options.onJump ?? onJump}
    />,
  );
  return el;
}

describe("DiffTab", () => {
  it("enabled=false(无 history 能力)时不渲染任何内容", () => {
    const el = mountTab({ enabled: false });
    expect(el.querySelector('[data-testid="diff-tab"]')).toBeNull();
    expect(el.textContent).toBe("");
  });

  it("渲染「我的」(琥珀)与「AI」(靛蓝)分组,AI 条目头为 rev · message · 时间", () => {
    const el = mountTab();
    const mine = el.querySelector('[data-testid="diff-group-mine"]') as HTMLElement;
    const ai = el.querySelector('[data-testid="diff-group-ai"]') as HTMLElement;
    expect(mine).not.toBeNull();
    expect(ai).not.toBeNull();
    expect(mine.textContent).toContain("我的");
    expect(mine.textContent).toContain("3 · damage · 120 → 130");
    expect(ai.textContent).toContain("AI");
    expect(ai.textContent).toContain("a10eb3f · config(skills): rename frostbolt · 2026-09-01T10:00:00+08:00");
    expect(ai.textContent).toContain("frostbolt · name · frostbolt → frost_bolt");
    expect(ai.textContent).toContain("新增行：40003");
    // 分组色只用 tokens:我的=琥珀(--color-dirty),AI=靛蓝(--color-ai)。
    expect(mine.querySelector('[data-testid="diff-group-mine-title"]')?.getAttribute("style")).toContain(
      "var(--color-dirty)",
    );
    expect(ai.querySelector('[data-testid="diff-group-ai-title"]')?.getAttribute("style")).toContain(
      "var(--color-ai)",
    );
  });

  it("schemaChanged 的修订显示「表结构已变化」,不伪造格级差异", () => {
    const el = mountTab({
      history: [
        { ...HISTORY[0], revision: "deadbee", schemaChanged: true, cells: [], created: [], deleted: [] },
      ],
    });
    const revision = el.querySelector('[data-testid="diff-revision"]') as HTMLElement;
    expect(revision.textContent).toContain("表结构已变化");
    expect(revision.querySelectorAll('[data-testid="diff-cell"]').length).toBe(0);
  });

  it("切换对比基准会回调 onBasisChange", () => {
    const onBasisChange = vi.fn();
    const el = mountTab({ onBasisChange });
    const select = el.querySelector('[data-testid="diff-basis"]') as HTMLSelectElement;
    expect(select.value).toBe("last-seen");
    act(() => {
      select.value = "mine-only";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onBasisChange).toHaveBeenCalledWith("mine-only");
  });

  it("basis=mine-only 时只显示「我的」分组,AI 分组不渲染", () => {
    const el = mountTab({ basis: "mine-only" });
    expect(el.querySelector('[data-testid="diff-group-mine"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="diff-group-ai"]')).toBeNull();
  });

  it("点击我的/AI 条目都会带着 行 · 列 回调 onJump", () => {
    const onJump = vi.fn();
    const el = mountTab({ onJump });
    const mineCell = el.querySelector('[data-testid="diff-group-mine"] [data-testid="diff-cell"]') as HTMLElement;
    act(() => {
      mineCell.click();
    });
    expect(onJump).toHaveBeenCalledWith(3, "damage");
    const aiCell = el.querySelector('[data-testid="diff-group-ai"] [data-testid="diff-cell"]') as HTMLElement;
    act(() => {
      aiCell.click();
    });
    expect(onJump).toHaveBeenCalledWith("40002", "name");
  });

  it("「在表格中标记」开关回调 onMarkChange", () => {
    const onMarkChange = vi.fn();
    const el = mountTab({ onMarkChange });
    const box = el.querySelector('[data-testid="diff-mark"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => {
      box.click();
    });
    expect(onMarkChange).toHaveBeenCalledWith(true);
  });

  it("我的 / AI 均为空时显示空态", () => {
    const el = mountTab({ mine: [], history: [] });
    expect(el.querySelector('[data-testid="diff-mine-empty"]')?.textContent).toBe("还没有未提交改动");
    expect(el.querySelector('[data-testid="diff-ai-empty"]')?.textContent).toBe("还没有修订记录");
  });
});

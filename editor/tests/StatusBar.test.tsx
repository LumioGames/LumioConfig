import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "../src/panels/StatusBar";
import { ToastProvider } from "../src/components/ui/Toast";
import { COPY } from "../src/app/copy";

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let writeText: ReturnType<typeof vi.fn>;

function mount(node: ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

function mountBar(node: ReactElement): HTMLDivElement {
  return mount(<ToastProvider>{node}</ToastProvider>);
}

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

const FINGERPRINT = "47f6f165" + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    tableName: "skills",
    rowCount: 4,
    draftVersion: 2,
    dirtyCount: 3,
    uncommittedMerges: 0,
    fingerprint: FINGERPRINT,
    online: true,
    liveText: "",
    onOpenPatchTab: vi.fn(),
    ...overrides,
  };
}

function q(el: HTMLElement, testid: string): HTMLElement {
  const node = el.querySelector(`[data-testid="${testid}"]`);
  if (!node) {
    throw new Error(`missing [data-testid="${testid}"]`);
  }
  return node as HTMLElement;
}

describe("StatusBar 状态条(§2/原型 README)", () => {
  it("表 · 行数 · 草稿 vN · N 格未提交 · 指纹 8 位(title 全文) · 在线", () => {
    const el = mountBar(<StatusBar {...baseProps()} />);
    expect(el.querySelector('[data-testid="status-bar"]')).not.toBeNull();
    expect(q(el, "status-table").textContent).toBe("skills");
    expect(q(el, "status-rows").textContent).toBe("4 行");
    expect(q(el, "status-draft").textContent).toBe("草稿 v2");
    expect(q(el, "status-dirty").textContent).toBe(COPY.phase.dirty(3));
    const fingerprint = q(el, "status-fingerprint");
    expect(fingerprint.textContent).toBe(FINGERPRINT.slice(0, 8));
    expect(fingerprint.getAttribute("title")).toBe(FINGERPRINT);
    expect(q(el, "status-online").textContent).toContain("在线");
  });

  it("M7-D S04:status-table 的 title 含源文件路径(下发优先,未接线按表名推导)", () => {
    // 未下发 sourcePath:按表名推导。
    const derived = mountBar(<StatusBar {...baseProps()} />);
    expect(q(derived, "status-table").getAttribute("title")).toBe("skills · tables/skills.txt");
    // Host 下发 sourcePath:逐字使用。
    const given = mountBar(
      <StatusBar {...baseProps({ tableName: "effects", sourcePath: "tables/effects.txt" })} />,
    );
    expect(q(given, "status-table").getAttribute("title")).toBe("effects · tables/effects.txt");
  });

  it("dirtyCount=0:显示 无未提交改动,点击不打开补丁页签", () => {
    const props = baseProps({ dirtyCount: 0 });
    const el = mountBar(<StatusBar {...props} />);
    expect(q(el, "status-dirty").textContent).toBe(COPY.status.noUncommitted);
    act(() => {
      q(el, "status-dirty").click();
    });
    expect(props.onOpenPatchTab).not.toHaveBeenCalled();
  });

  it("dirtyCount>0:点击 N 格未提交 打开补丁页签", () => {
    const props = baseProps({ dirtyCount: 5 });
    const el = mountBar(<StatusBar {...props} />);
    expect(q(el, "status-dirty").textContent).toBe(COPY.phase.dirty(5));
    act(() => {
      q(el, "status-dirty").click();
    });
    expect(props.onOpenPatchTab).toHaveBeenCalledTimes(1);
  });

  it("uncommittedMerges>0 显示 N 次合入未 commit,0 不显示", () => {
    const withMerges = mountBar(<StatusBar {...baseProps({ uncommittedMerges: 1 })} />);
    expect(q(withMerges, "status-merges").textContent).toBe(COPY.status.uncommittedMerges(1));
    const without = mountBar(<StatusBar {...baseProps()} />);
    expect(without.querySelector('[data-testid="status-merges"]')).toBeNull();
  });

  it("离线:红点 离线", () => {
    const el = mountBar(<StatusBar {...baseProps({ online: false })} />);
    expect(q(el, "status-online").textContent).toContain("离线");
  });
});

describe("StatusBar 指纹复制", () => {
  it("点击调用 navigator.clipboard.writeText(全文) 并 toast", async () => {
    const el = mountBar(<StatusBar {...baseProps()} />);
    await act(async () => {
      q(el, "status-fingerprint").click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(FINGERPRINT);
    const toasts = Array.from(document.querySelectorAll(".toast"));
    expect(toasts.some((toast) => toast.textContent === FINGERPRINT)).toBe(true);
  });
});

describe("StatusBar live region", () => {
  it("status-hint 是视觉隐藏的 aria-live=polite 区,渲染 liveText", () => {
    const el = mountBar(<StatusBar {...baseProps({ liveText: "已合入仓库 3 处改动" })} />);
    const hint = q(el, "status-hint");
    expect(hint.getAttribute("aria-live")).toBe("polite");
    expect(hint.textContent).toBe("已合入仓库 3 处改动");
    const style = hint.style;
    expect(style.position).toBe("absolute");
    expect(style.width).toBe("1px");
    expect(style.height).toBe("1px");
    expect(style.overflow).toBe("hidden");
  });

  it("liveText 为空时不渲染占位文案(不再有「就绪」兜底)", () => {
    const el = mountBar(<StatusBar {...baseProps()} />);
    expect(q(el, "status-hint").textContent).toBe("");
  });
});

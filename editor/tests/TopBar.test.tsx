import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar, type TopBarRevision } from "../src/panels/TopBar";
import { phaseView, type PhaseView } from "../src/app/phaseView";
import { INITIAL_EDITOR_STATE, type EditorState } from "../src/app/state";
import { COPY } from "../src/app/copy";
import { ToastProvider } from "../src/components/ui/Toast";

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let writeText: ReturnType<typeof vi.fn>;

function mount(node: ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ToastProvider>{node}</ToastProvider>);
  });
  return container;
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

function at(phase: EditorState["phase"], overrides: Partial<EditorState> = {}): EditorState {
  return { ...INITIAL_EDITOR_STATE, phase, online: true, dirtyCount: 2, ...overrides };
}

const FULL_SHA = "a10eb3f9c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8";

function baseProps(view: PhaseView) {
  return {
    tableName: "skills",
    revision: { vcs: "git", id: FULL_SHA, branch: "main" } as TopBarRevision,
    view,
    dirtyCount: 2,
    inspectorOpen: false,
    onToggleSidebar: vi.fn(),
    onOpenPalette: vi.fn(),
    onExport: vi.fn(),
    onValidate: vi.fn(),
    onSubmit: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onToggleInspector: vi.fn(),
  };
}

function q(el: HTMLElement, testid: string): HTMLElement {
  const node = el.querySelector(`[data-testid="${testid}"]`);
  if (!node) {
    throw new Error(`missing [data-testid="${testid}"]`);
  }
  return node as HTMLElement;
}

describe("TopBar 修订段", () => {
  it("git:显示 分支 · 7 位短 sha,title 为全 sha", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} />);
    const revision = q(el, "top-revision");
    expect(revision.textContent).toBe(`main · ${FULL_SHA.slice(0, 7)}`);
    expect(revision.getAttribute("title")).toBe(FULL_SHA);
  });

  it("git 无分支:只显示短 sha", () => {
    const props = baseProps(phaseView(at("ReadyDirty")));
    props.revision = { vcs: "git", id: FULL_SHA, branch: null };
    const el = mount(<TopBar {...props} />);
    expect(q(el, "top-revision").textContent).toBe(FULL_SHA.slice(0, 7));
    expect(q(el, "top-revision").getAttribute("title")).toBe(FULL_SHA);
  });

  it("svn:显示 r<id>", () => {
    const props = baseProps(phaseView(at("ReadyDirty")));
    props.revision = { vcs: "svn", id: "1841", branch: null };
    const el = mount(<TopBar {...props} />);
    expect(q(el, "top-revision").textContent).toBe("r1841");
  });

  it("vcs=none 与 null:不渲染修订段", () => {
    const none = baseProps(phaseView(at("ReadyDirty")));
    none.revision = { vcs: "none", id: "", branch: null };
    const el = mount(<TopBar {...none} />);
    expect(el.querySelector('[data-testid="top-revision"]')).toBeNull();
    const el2 = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} revision={null} />);
    expect(el2.querySelector('[data-testid="top-revision"]')).toBeNull();
  });
});

describe("TopBar 状态胶囊", () => {
  it("渲染中文文案,English 阶段名只进 title / data-phase", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} />);
    const pill = q(el, "status-phase");
    expect(pill.textContent).toBe(COPY.phase.dirty(2));
    expect(pill.getAttribute("data-phase")).toBe("ReadyDirty");
    expect(pill.getAttribute("title")).toBe("ReadyDirty");
  });

  it("Opening / Conflicted / Failed·SCHEMA_CHANGED / 离线派生态的 data-phase", () => {
    const cases: Array<[EditorState, string]> = [
      [at("Opening"), "Opening"],
      [at("Conflicted"), "Conflicted"],
      [at("Failed", { failKind: "SCHEMA_CHANGED" }), "Failed"],
      [at("ReadyDirty", { online: false }), "Offline"],
    ];
    for (const [state, expected] of cases) {
      const el = mount(<TopBar {...baseProps(phaseView(state))} />);
      expect(q(el, "status-phase").getAttribute("data-phase")).toBe(expected);
    }
  });
});

describe("TopBar 按钮可用性(§5 可用动作列)", () => {
  it("ReadyClean:导出可用;预检禁用(tooltip 没有改动可预检),提交禁用(tooltip 先预检通过)", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyClean", { dirtyCount: 0 })))} />);
    expect((q(el, "btn-export-top") as HTMLButtonElement).disabled).toBe(false);
    const validate = q(el, "btn-validate") as HTMLButtonElement;
    expect(validate.disabled).toBe(true);
    expect(validate.getAttribute("title")).toBe(COPY.tooltip.nothingToValidate);
    const submit = q(el, "btn-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("title")).toBe(COPY.tooltip.validateBeforeSubmit);
  });

  it("ReadyDirty:预检可用,提交禁用,导出可用", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} />);
    expect((q(el, "btn-validate") as HTMLButtonElement).disabled).toBe(false);
    expect((q(el, "btn-submit") as HTMLButtonElement).disabled).toBe(true);
    expect((q(el, "btn-export-top") as HTMLButtonElement).disabled).toBe(false);
  });

  it("ReadyToSubmit:提交可用,导出禁用", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyToSubmit")))} />);
    expect((q(el, "btn-submit") as HTMLButtonElement).disabled).toBe(false);
    expect((q(el, "btn-export-top") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("TopBar 回调", () => {
  it("侧栏折叠 / 表名(命令面板) / 检查器开关", () => {
    const props = baseProps(phaseView(at("ReadyDirty")));
    const el = mount(<TopBar {...props} />);
    act(() => {
      q(el, "topbar-sidebar").click();
    });
    expect(props.onToggleSidebar).toHaveBeenCalledTimes(1);
    act(() => {
      q(el, "topbar-table").click();
    });
    expect(props.onOpenPalette).toHaveBeenCalledTimes(1);
    act(() => {
      q(el, "topbar-inspector").click();
    });
    expect(props.onToggleInspector).toHaveBeenCalledTimes(1);
    expect(q(el, "topbar-inspector").getAttribute("aria-pressed")).toBe("false");
  });

  it("导出 / 预检(ReadyDirty 可用)与提交(ReadyToSubmit 可用)分派回调", () => {
    const dirty = baseProps(phaseView(at("ReadyDirty")));
    const dirtyEl = mount(<TopBar {...dirty} />);
    act(() => {
      q(dirtyEl, "btn-export-top").click();
    });
    expect(dirty.onExport).toHaveBeenCalledTimes(1);
    act(() => {
      q(dirtyEl, "btn-validate").click();
    });
    expect(dirty.onValidate).toHaveBeenCalledTimes(1);
    const ready = baseProps(phaseView(at("ReadyToSubmit")));
    const readyEl = mount(<TopBar {...ready} />);
    act(() => {
      q(readyEl, "btn-submit").click();
    });
    expect(ready.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("inspectorOpen=true 时检查器开关 aria-pressed=true", () => {
    const props = baseProps(phaseView(at("ReadyDirty")));
    props.inspectorOpen = true;
    const el = mount(<TopBar {...props} />);
    expect(q(el, "topbar-inspector").getAttribute("aria-pressed")).toBe("true");
  });

  it("⋯ 菜单:命令面板 / 设置 / 快捷键", () => {
    const props = baseProps(phaseView(at("ReadyDirty")));
    const el = mount(<TopBar {...props} />);
    function openMenuAndClickItem(index: number) {
      act(() => {
        q(el, "topbar-more").click();
      });
      const items = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      expect(items).toHaveLength(3);
      act(() => {
        items[index]!.click();
      });
    }
    act(() => {
      q(el, "topbar-more").click();
    });
    const labels = Array.from(el.querySelectorAll('[role="menuitem"] .menu__label'));
    expect(labels.map((label) => label.textContent)).toEqual(["命令面板", "设置", "快捷键"]);
    openMenuAndClickItem(1);
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    openMenuAndClickItem(2);
    expect(props.onOpenShortcuts).toHaveBeenCalledTimes(1);
    openMenuAndClickItem(0);
    expect(props.onOpenPalette).toHaveBeenCalledTimes(1);
  });
});

describe("TopBar 表名 ⌄ 菜单路径(M7-D)", () => {
  const PATH_PROPS = { sourcePath: "tables/skills.txt", schemaPath: "schemas/skills.json" };

  function openTableMenu(el: HTMLElement): Array<HTMLElement> {
    act(() => {
      q(el, "topbar-table-menu").click();
    });
    return Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }

  it("两条目文本与传入的 sourcePath / schemaPath 逐字一致(S02)", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} {...PATH_PROPS} />);
    const items = openTableMenu(el);
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe(COPY.paths.sourceFile("tables/skills.txt"));
    expect(items[1]!.textContent).toBe(COPY.paths.schemaFile("schemas/skills.json"));
  });

  it("点击条目调用 navigator.clipboard.writeText(路径) 并 toast 已复制路径(S03)", async () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} {...PATH_PROPS} />);
    act(() => {
      q(el, "topbar-table-menu").click();
    });
    const source = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'))[0]!;
    await act(async () => {
      source.click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("tables/skills.txt");
    act(() => {
      q(el, "topbar-table-menu").click();
    });
    const schema = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'))[1]!;
    await act(async () => {
      schema.click();
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenCalledWith("schemas/skills.json");
    const toasts = Array.from(document.querySelectorAll(".toast"));
    expect(toasts.some((toast) => toast.textContent === COPY.paths.copied)).toBe(true);
  });

  it("表名按钮 title 为 <表名> · <源文件路径>(S04;status-table 在 StatusBar 不在本卡文件集,落点为此处)", () => {
    const el = mount(<TopBar {...baseProps(phaseView(at("ReadyDirty")))} {...PATH_PROPS} />);
    expect(q(el, "topbar-table").getAttribute("title")).toBe("skills · tables/skills.txt");
  });

  it("未传路径:不渲染 ⌄ 菜单按钮,title 退化为按表名推导", () => {
    const props = baseProps(phaseView(at("ReadyDirty")));
    props.tableName = "items";
    const el = mount(<TopBar {...props} />);
    expect(el.querySelector('[data-testid="topbar-table-menu"]')).toBeNull();
    expect(q(el, "topbar-table").getAttribute("title")).toBe("items · tables/items.txt");
  });
});

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Banner } from "../src/panels/Banner";
import { phaseView, type PhaseViewBanner } from "../src/app/phaseView";
import { INITIAL_EDITOR_STATE, type EditorState } from "../src/app/state";
import { COPY } from "../src/app/copy";

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

function at(phase: EditorState["phase"], overrides: Partial<EditorState> = {}): EditorState {
  return { ...INITIAL_EDITOR_STATE, phase, online: true, dirtyCount: 2, ...overrides };
}

function bannerOf(state: EditorState): PhaseViewBanner {
  const view = phaseView(state);
  if (!view.banner) {
    throw new Error(`phase ${state.phase} has no banner`);
  }
  return view.banner;
}

function clickByText(el: HTMLElement, text: string) {
  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-testid="banner"] button'));
  const target = buttons.find((button) => button.textContent === text);
  if (!target) {
    throw new Error(`banner button ${text} not found`);
  }
  act(() => {
    target.click();
  });
}

describe("Banner", () => {
  it("banner 未定义时不渲染任何节点", () => {
    const el = mount(<Banner banner={undefined} onAction={vi.fn()} />);
    expect(el.innerHTML).toBe("");
    expect(el.querySelector('[data-testid="banner"]')).toBeNull();
  });

  it("Conflicted:文案 + 处理冲突/取消本次提交,分派 resolve/cancel", () => {
    const onAction = vi.fn();
    const el = mount(<Banner banner={bannerOf(at("Conflicted"))} onAction={onAction} />);
    const banner = el.querySelector('[data-testid="banner"]') as HTMLElement;
    expect(banner.textContent).toContain(COPY.banner.conflicted(2));
    clickByText(el, COPY.bannerActions.resolve);
    expect(onAction).toHaveBeenCalledWith("resolve");
    clickByText(el, COPY.bannerActions.cancelSubmit);
    expect(onAction).toHaveBeenCalledWith("cancel");
  });

  it("Failed·DRAFT_VERSION_CONFLICT:刷新按钮带 draft-refresh testid,分派 refresh", () => {
    const onAction = vi.fn();
    const el = mount(
      <Banner banner={bannerOf(at("Failed", { failKind: "DRAFT_VERSION_CONFLICT" }))} onAction={onAction} />,
    );
    const banner = el.querySelector('[data-testid="banner"]') as HTMLElement;
    expect(banner.textContent).toContain(COPY.banner.failedDraftConflict);
    const refresh = banner.querySelector('[data-testid="draft-refresh"]') as HTMLButtonElement;
    expect(refresh.textContent).toBe(COPY.bannerActions.refresh);
    expect(refresh.disabled).toBe(false);
    act(() => {
      refresh.click();
    });
    expect(onAction).toHaveBeenCalledWith("refresh");
  });

  it("Failed·SCHEMA_CHANGED:刷新按钮同样带 draft-refresh testid", () => {
    const onAction = vi.fn();
    const el = mount(
      <Banner banner={bannerOf(at("Failed", { failKind: "SCHEMA_CHANGED" }))} onAction={onAction} />,
    );
    const banner = el.querySelector('[data-testid="banner"]') as HTMLElement;
    expect(banner.textContent).toContain(COPY.banner.failedSchemaChanged);
    const refresh = banner.querySelector('[data-testid="draft-refresh"]') as HTMLButtonElement;
    act(() => {
      refresh.click();
    });
    expect(onAction).toHaveBeenCalledWith("refresh");
  });

  it("Failed·VCS:查看详情/重试,分派 details/retry", () => {
    const onAction = vi.fn();
    const el = mount(<Banner banner={bannerOf(at("Failed", { failKind: "VCS" }))} onAction={onAction} />);
    const banner = el.querySelector('[data-testid="banner"]') as HTMLElement;
    expect(banner.textContent).toContain(COPY.banner.failedVcs);
    clickByText(el, COPY.bannerActions.details);
    expect(onAction).toHaveBeenCalledWith("details");
    clickByText(el, COPY.bannerActions.retry);
    expect(onAction).toHaveBeenCalledWith("retry");
  });

  it("Stale:只有文案,无动作按钮", () => {
    const el = mount(<Banner banner={bannerOf(at("Stale"))} onAction={vi.fn()} />);
    const banner = el.querySelector('[data-testid="banner"]') as HTMLElement;
    expect(banner.textContent).toContain(COPY.banner.stale(2, null));
    expect(banner.querySelectorAll("button")).toHaveLength(0);
  });

  it("色调:Conflicted 紫 / Stale 蓝 / Failed 红(动作推断)", () => {
    const conflicted = mount(<Banner banner={bannerOf(at("Conflicted"))} onAction={vi.fn()} />);
    expect(conflicted.querySelector('[data-testid="banner"]')!.getAttribute("data-tone")).toBe("purple");
    const stale = mount(<Banner banner={bannerOf(at("Stale"))} onAction={vi.fn()} />);
    expect(stale.querySelector('[data-testid="banner"]')!.getAttribute("data-tone")).toBe("blue");
    const failed = mount(
      <Banner banner={bannerOf(at("Failed", { failKind: "VCS" }))} onAction={vi.fn()} />,
    );
    expect(failed.querySelector('[data-testid="banner"]')!.getAttribute("data-tone")).toBe("red");
  });
});

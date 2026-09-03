import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { COPY } from "../src/app/copy";
import { Blocked } from "../src/panels/Blocked";

/**
 * Task 18 · F2:整页阻断页(R-00382 S03,设计稿 §5 表末两行 + 原型 README「弹层」段)。
 * - kind=offline:online=false 派生态;kind=closed:Closed 阶段。
 * - rgba(246,247,249,.92) 覆盖 + 420px 卡片,两步重连指引全部取自 COPY(§5/§12)。
 */

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

// 一个用例里可能挂两棵树(有 / 无 onRetry 对比),全部登记,afterEach 统一卸载,
// 否则泄漏的遮罩会污染后续 document.querySelector 断言。
function mount(node: ReactElement): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  mounted.push({ root, container: host });
  return host;
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function overlay(): HTMLElement {
  const el = document.querySelector('[data-testid="blocked"]');
  if (!(el instanceof HTMLElement)) {
    throw new Error("blocked overlay missing");
  }
  return el;
}

describe("Blocked", () => {
  it("renders a fixed full-page alertdialog with aria-modal", () => {
    mount(<Blocked kind="offline" />);
    const el = overlay();
    expect(el.getAttribute("role")).toBe("alertdialog");
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).not.toBe("");
  });

  it("offline kind shows the offline capsule copy as title and the two-step reconnect guidance", () => {
    mount(<Blocked kind="offline" />);
    const el = overlay();
    const heading = el.querySelector("h2");
    expect(heading?.textContent).toBe(COPY.phase.offline);
    expect(heading?.textContent).toBe("无法连接本机服务");
    expect(el.textContent).toContain(COPY.banner.offline);
    expect(el.textContent).toContain("重新运行 serve");
    expect(el.textContent).toContain("打开新链接");
  });

  it("closed kind shows the closed capsule copy as title and its reconnect guidance", () => {
    mount(<Blocked kind="closed" />);
    const el = overlay();
    const heading = el.querySelector("h2");
    expect(heading?.textContent).toBe(COPY.phase.closed);
    expect(heading?.textContent).toBe("会话已结束");
    expect(el.textContent).toContain(COPY.banner.closed);
    expect(el.textContent).toContain("重新运行 serve 后打开新链接");
  });

  it("wires aria-labelledby / aria-describedby to the title and guidance", () => {
    mount(<Blocked kind="offline" />);
    const el = overlay();
    const heading = el.querySelector("h2");
    const body = el.querySelector('[data-testid="blocked-guidance"]');
    expect(heading?.id).toBeTruthy();
    expect(body?.id).toBeTruthy();
    expect(el.getAttribute("aria-labelledby")).toBe(heading?.id ?? null);
    expect(el.getAttribute("aria-describedby")).toBe(body?.id ?? null);
  });

  it("covers the page with --color-bg-app at 92% and centers a 420px token-styled card", () => {
    mount(<Blocked kind="offline" />);
    const el = overlay();
    // rgba(246,247,249,.92):#f6f7f9 即 --color-bg-app;panels/** 不写字面色 / rgb(),
    // 与 ui.css .dialog__backdrop 同法,用 color-mix 由令牌混合出 92% 半透明。
    expect(el.style.background).toBe("color-mix(in srgb, var(--color-bg-app) 92%, transparent)");
    const card = el.querySelector('[data-testid="blocked-card"]');
    expect(card).toBeTruthy();
    expect((card as HTMLElement).style.width).toBe("420px");
    expect((card as HTMLElement).style.background).toBe("var(--color-bg-surface)");
    expect((card as HTMLElement).style.borderRadius).toBe("var(--radius-4)");
    expect((card as HTMLElement).style.boxShadow).toBe("var(--shadow-dialog)");
  });

  it("shows a retry button only when onRetry is provided, and forwards clicks", () => {
    let retries = 0;
    const withRetry = mount(<Blocked kind="offline" onRetry={() => (retries += 1)} />);
    const button = withRetry.querySelector<HTMLButtonElement>('button[data-testid="blocked-retry"]');
    expect(button).toBeTruthy();
    expect(button!.textContent).toBe(COPY.bannerActions.retry);
    act(() => {
      button!.click();
    });
    expect(retries).toBe(1);

    const withoutRetry = mount(<Blocked kind="closed" />);
    expect(withoutRetry.querySelector('[data-testid="blocked-retry"]')).toBeNull();
  });

  it("moves focus into the dialog on mount and restores the previous focus on unmount", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const localRoot = createRoot(host);
    act(() => {
      localRoot.render(<Blocked kind="offline" onRetry={() => undefined} />);
    });
    expect(overlay().contains(document.activeElement)).toBe(true);

    act(() => {
      localRoot.unmount();
    });
    expect(document.activeElement).toBe(outside);
    host.remove();
    outside.remove();
  });

  it("falls back to focusing the dialog itself when there is no retry action", () => {
    mount(<Blocked kind="closed" />);
    const el = overlay();
    expect(document.activeElement).toBe(el);
  });

  it("traps Tab / Shift+Tab within the dialog", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const localRoot = createRoot(host);
    act(() => {
      localRoot.render(
        <>
          <Blocked kind="offline" onRetry={() => undefined} />
          <button type="button" data-testid="blocked-outside">
            outside
          </button>
        </>,
      );
    });
    const el = overlay();
    const retry = el.querySelector<HTMLButtonElement>('[data-testid="blocked-retry"]');
    const outside = document.querySelector('[data-testid="blocked-outside"]');
    expect(retry).toBeTruthy();
    expect(outside).toBeTruthy();
    expect(document.activeElement).toBe(retry);

    // Tab / Shift+Tab 在唯一可聚焦项上循环,不落到遮罩外的按钮。
    act(() => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(el.contains(document.activeElement)).toBe(true);
    act(() => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(el.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(outside);
    act(() => {
      localRoot.unmount();
    });
    host.remove();
  });
});

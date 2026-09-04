import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceViewDialog, type SourceViewDialogProps } from "../src/panels/SourceViewDialog";
import { ToastProvider } from "../src/components/ui/Toast";
import { COPY } from "../src/app/copy";
import type { SourceFileResponse } from "../src/api/types";

/**
 * M7-E §5 / S04:只读查看器三态(loading / tooLarge(413) / failed)、全文 + 行号、
 * 只读提示在显著位置、复制全文(mock clipboard + toast)、Esc 关闭、焦点还原、
 * 每次打开重新拉取(不缓存)。数据获取经注入的 load(),不 import client.ts。
 */

const FILE: SourceFileResponse = {
  table: "skills",
  kind: "table",
  path: "tables/skills.txt",
  text: "table: skills\nschema: schemas/skills.json\nrows:\n",
  bytes: 45,
};

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

const BASE: SourceViewDialogProps = {
  open: true,
  table: "skills",
  kind: "table",
  load: () => Promise.resolve(FILE),
  onClose: () => {},
};

function mountDialog(overrides: Partial<SourceViewDialogProps> = {}) {
  return mount(
    <ToastProvider>
      <SourceViewDialog {...BASE} {...overrides} />
    </ToastProvider>,
  );
}

function rerenderDialog(overrides: Partial<SourceViewDialogProps> = {}) {
  act(() => {
    root!.render(
      <ToastProvider>
        <SourceViewDialog {...BASE} {...overrides} />
      </ToastProvider>,
    );
  });
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

describe("SourceViewDialog", () => {
  it("加载中显示 loading 文案,标题用按 kind 推导的路径,无正文/复制按钮", () => {
    mountDialog({ load: () => new Promise(() => {}) });
    expect(document.querySelector('[data-testid="source-view-loading"]')?.textContent).toBe(
      COPY.sourceView.loading,
    );
    expect(document.querySelector(".dialog__title")?.textContent).toBe(
      COPY.sourceView.title("tables/skills.txt"),
    );
    expect(document.querySelector('[data-testid="source-view-text"]')).toBeNull();
    expect(document.querySelector('[data-testid="source-view-copy"]')).toBeNull();

    rerenderDialog({ kind: "schema", load: () => new Promise(() => {}) });
    expect(document.querySelector(".dialog__title")?.textContent).toBe(
      COPY.sourceView.title("schemas/skills.json"),
    );
  });

  it("就绪后显示全文、行号与 Host 下发路径(S04)", async () => {
    mountDialog();
    await act(async () => {});
    expect(document.querySelector('[data-testid="source-view-text"]')?.textContent).toBe(FILE.text);
    // 3 行(结尾换行不产生幻影行号)
    expect(document.querySelector('[data-testid="source-view-lines"]')?.textContent).toBe("123");
    expect(document.querySelector(".dialog__title")?.textContent).toBe(
      COPY.sourceView.title(FILE.path),
    );
  });

  it("只读提示放在正文上方的显著位置(S04)", () => {
    mountDialog({ load: () => new Promise(() => {}) });
    const note = document.querySelector('[data-testid="source-view-note"]');
    expect(note?.textContent).toBe(COPY.sourceView.readOnlyNote);
    expect(note?.previousElementSibling).toBeNull();
  });

  it("413 PAYLOAD_TOO_LARGE 显示过大文案,而非失败文案(S04)", async () => {
    mountDialog({
      load: () => Promise.reject(Object.assign(new Error("too large"), { code: "PAYLOAD_TOO_LARGE" })),
    });
    await act(async () => {});
    expect(document.querySelector('[data-testid="source-view-too-large"]')?.textContent).toBe(
      COPY.sourceView.tooLarge,
    );
    expect(document.querySelector('[data-testid="source-view-failed"]')).toBeNull();
    expect(document.querySelector('[data-testid="source-view-text"]')).toBeNull();
  });

  it("其余错误显示失败文案", async () => {
    mountDialog({ load: () => Promise.reject(new Error("boom")) });
    await act(async () => {});
    expect(document.querySelector('[data-testid="source-view-failed"]')?.textContent).toBe(
      COPY.sourceView.failed,
    );
  });

  it("复制全文按钮走 clipboard 写全文并 toast 已复制(S04)", async () => {
    mountDialog();
    await act(async () => {});
    await act(async () => {
      (document.querySelector('[data-testid="source-view-copy"]') as HTMLButtonElement).click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(FILE.text);
    const toasts = Array.from(document.querySelectorAll(".toast"));
    expect(toasts.some((toast) => toast.textContent === COPY.sourceView.copied)).toBe(true);
  });

  it("Esc 关闭(走 ui/Dialog 的 Esc 处理)", () => {
    const onClose = vi.fn();
    mountDialog({ onClose, load: () => new Promise(() => {}) });
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("打开时焦点入框,关闭后还原到先前聚焦的元素(走 ui/Dialog)", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    mountDialog({ load: () => new Promise(() => {}) });
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
    rerenderDialog({ open: false, load: () => new Promise(() => {}) });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("每次打开都重新拉取,结果不缓存(M7-E 明确不做缓存)", async () => {
    const load = vi.fn().mockResolvedValue(FILE);
    mountDialog({ load });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    rerenderDialog({ open: false, load });
    rerenderDialog({ load });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
  });
});

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog, type EditorSettings } from "../src/panels/SettingsDialog";
import { ToastProvider } from "../src/components/ui";

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

function mountDialog(props: {
  open?: boolean;
  settings?: EditorSettings;
  onChange?: (next: EditorSettings) => Promise<void>;
  onClose?: () => void;
}): HTMLDivElement {
  const {
    open = true,
    settings = { autoCommit: true, autoExport: false },
    onChange = (_next: EditorSettings) => Promise.resolve(),
    onClose = () => undefined,
  } = props;
  return mount(
    <ToastProvider>
      <SettingsDialog open={open} settings={settings} onChange={onChange} onClose={onClose} />
    </ToastProvider>,
  );
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

function byTestId(id: string): HTMLElement {
  const node = document.querySelector(`[data-testid="${id}"]`);
  if (!node) {
    throw new Error(`missing [data-testid="${id}"]`);
  }
  return node as HTMLElement;
}

describe("SettingsDialog(§12 设置)", () => {
  it("renders nothing while closed", () => {
    const el = mountDialog({ open: false });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-testid="setting-autocommit"]')).toBeNull();
  });

  it("toggles 提交后自动 commit and fires onChange with both flags, then toasts 已保存到本机设置", async () => {
    const onChange = vi.fn((_next: EditorSettings) => Promise.resolve());
    mountDialog({ settings: { autoCommit: true, autoExport: false }, onChange });
    const box = byTestId("setting-autocommit") as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => {
      box.click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ autoCommit: false, autoExport: false });
    expect(byTestId("setting-autocommit").textContent ?? "").toBe("");
    // toast「已保存到本机设置」(§12),不常驻。
    expect(document.querySelector('[role="status"]')?.textContent).toContain("已保存到本机设置");
  });

  it("toggles 提交后自动导表 via setting-autoexport", async () => {
    const onChange = vi.fn((_next: EditorSettings) => Promise.resolve());
    mountDialog({ settings: { autoCommit: false, autoExport: false }, onChange });
    await act(async () => {
      byTestId("setting-autoexport").click();
    });
    expect(onChange).toHaveBeenCalledWith({ autoCommit: false, autoExport: true });
    expect(document.querySelector('[role="status"]')?.textContent).toContain("已保存到本机设置");
  });

  it("reverts the checkbox and surfaces the message when onChange rejects", async () => {
    const onChange = vi.fn((_next: EditorSettings) => Promise.reject(new Error("写入失败")));
    mountDialog({ settings: { autoCommit: true, autoExport: false }, onChange });
    await act(async () => {
      byTestId("setting-autocommit").click();
    });
    const box = byTestId("setting-autocommit") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(byTestId("settings-message").textContent).toContain("写入失败");
    expect(document.querySelector('[role="status"]')?.textContent ?? "").not.toContain("已保存到本机设置");
  });

  it("shows labels from COPY only — never autoCommit / autoExport / local.json in the UI", () => {
    mountDialog({});
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("提交后自动 commit 到当前分支");
    expect(dialog.textContent).toContain("提交后自动导表");
    expect(dialog.textContent).not.toContain("autoCommit");
    expect(dialog.textContent).not.toContain("autoExport");
    expect(dialog.textContent).not.toContain("local.json");
  });

  it("closes via the close action and Esc", async () => {
    const onClose = vi.fn();
    mountDialog({ onClose });
    act(() => {
      (document.querySelector(".dialog__actions button") as HTMLButtonElement).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // 重新打开走 Esc(Dialog 自带焦点圈)。
    act(() => {
      root!.render(
        <ToastProvider>
          <SettingsDialog
            open
            settings={{ autoCommit: true, autoExport: false }}
            onChange={(_next: EditorSettings) => Promise.resolve()}
            onClose={onClose}
          />
        </ToastProvider>,
      );
    });
    act(() => {
      document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

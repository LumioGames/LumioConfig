import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HOTKEYS,
  hotkeyLabel,
  useHotkeys,
  type HotkeyMap,
} from "../src/components/ui/useHotkeys";
import { CommandPalette, type PaletteCommand } from "../src/panels/CommandPalette";

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

function rerender(node: ReactElement) {
  act(() => {
    root!.render(node);
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

const COMMANDS: PaletteCommand[] = [
  { group: "表", label: "打开 skills", shortcut: "Ctrl+K", run: vi.fn() },
  { group: "表", label: "打开 effects", run: vi.fn() },
  { group: "命令", label: "预检", shortcut: "Ctrl+Enter", run: vi.fn() },
  { group: "命令", label: "提交补丁", shortcut: "Ctrl+Shift+Enter", run: vi.fn() },
];

function palette(open: boolean, commands: PaletteCommand[] = COMMANDS, onClose = vi.fn()) {
  return <CommandPalette open={open} commands={commands} onClose={onClose} />;
}

function queryPalette(el: HTMLElement = container!) {
  return el.querySelector('[data-testid="command-palette"]') as HTMLElement | null;
}

function options(el: HTMLElement = container!) {
  return Array.from(el.querySelectorAll('[role="option"]')) as HTMLElement[];
}

function input(el: HTMLElement = container!) {
  return el.querySelector('[role="combobox"]') as HTMLInputElement;
}

function press(node: EventTarget, key: string, modifiers?: { ctrl?: boolean; shift?: boolean; meta?: boolean }) {
  node.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: modifiers?.ctrl ?? false,
      shiftKey: modifiers?.shift ?? false,
      metaKey: modifiers?.meta ?? false,
    }),
  );
}

/** React 受控 input 的 jsdom 打字路径:原生 value setter + input 事件。 */
function typeQuery(value: string) {
  const node = input();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const el = mount(palette(false));
    expect(queryPalette(el)).toBeNull();
  });

  it("renders a dialog with grouped entries and shortcut hints when open", () => {
    const el = mount(palette(true));
    const dialog = queryPalette(el)!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const groups = Array.from(el.querySelectorAll('[role="presentation"]')).map((n) => n.textContent);
    expect(groups).toEqual(["表", "命令"]);
    expect(options(el).map((o) => o.textContent)).toEqual(
      expect.arrayContaining(["打开 skillsCtrl+K", "打开 effects", "预检Ctrl+Enter", "提交补丁Ctrl+Shift+Enter"]),
    );
  });

  it("filters entries fuzzily by label and shows the empty state", () => {
    const el = mount(palette(true));
    act(() => typeQuery("sk"));
    expect(options(el).map((o) => o.textContent)).toEqual(["打开 skillsCtrl+K"]);
    act(() => typeQuery("zzz"));
    expect(options(el)).toHaveLength(0);
    expect(el.textContent).toContain("没有匹配的命令");
  });

  it("moves the active option with ArrowDown / ArrowUp and keeps aria-activedescendant in sync", () => {
    const el = mount(palette(true));
    const node = input(el);
    act(() => press(node, "ArrowDown"));
    expect(node.getAttribute("aria-activedescendant")).toBe("command-palette-option-1");
    expect(options(el)[1].getAttribute("aria-selected")).toBe("true");
    expect(options(el)[0].getAttribute("aria-selected")).toBe("false");
    // 走到底后再按下,循环回第一项。
    act(() => press(node, "ArrowDown"));
    act(() => press(node, "ArrowDown"));
    expect(node.getAttribute("aria-activedescendant")).toBe(`command-palette-option-${COMMANDS.length - 1}`);
    act(() => press(node, "ArrowDown"));
    expect(node.getAttribute("aria-activedescendant")).toBe("command-palette-option-0");
    // 在第一项上向上,循环到最后一项。
    act(() => press(node, "ArrowUp"));
    expect(node.getAttribute("aria-activedescendant")).toBe(`command-palette-option-${COMMANDS.length - 1}`);
  });

  it("Enter runs the active command and closes; Escape only closes", () => {
    const onClose = vi.fn();
    const el = mount(palette(true, COMMANDS, onClose));
    const node = input(el);
    act(() => press(node, "ArrowDown"));
    act(() => press(node, "Enter"));
    expect(COMMANDS[1].run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => press(node, "Escape"));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(COMMANDS[0].run).not.toHaveBeenCalled();
  });

  it("runs the clicked entry and closes", () => {
    const onClose = vi.fn();
    const el = mount(palette(true, COMMANDS, onClose));
    act(() => {
      options(el)[2].click();
    });
    expect(COMMANDS[2].run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets the query when reopened", () => {
    const el = mount(palette(true));
    act(() => typeQuery("skills"));
    rerender(palette(false));
    rerender(palette(true));
    expect(input(el).value).toBe("");
    expect(options(el)).toHaveLength(COMMANDS.length);
  });

  it("focuses the filter input on open and restores focus on close", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    mount(palette(true));
    expect(document.activeElement).toBe(input());
    rerender(palette(false));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("HOTKEYS 全量键表(§11)", () => {
  it("contains exactly the ten combos with the specified actions", () => {
    expect(HOTKEYS.map((item) => [item.action, item.combo])).toEqual([
      ["saveDraft", "Ctrl+S"],
      ["precheck", "Ctrl+Enter"],
      ["submit", "Ctrl+Shift+Enter"],
      ["palette", "Ctrl+K"],
      ["collapseSidebar", "Ctrl+B"],
      ["drawer", "Ctrl+J"],
      ["inspector", "Ctrl+M"],
      ["editCell", "F2"],
      ["contextMenu", "Shift+F10"],
      ["close", "Escape"],
    ]);
    expect(HOTKEYS.map((item) => item.label)).toEqual([
      "保存草稿",
      "预检",
      "提交",
      "命令面板",
      "折叠表列表",
      "抽屉",
      "检查器",
      "编辑格",
      "右键",
      "关闭弹层 / 收起抽屉",
    ]);
  });

  it("never registers the browser-reserved Ctrl+Shift+I / Ctrl+Shift+J", () => {
    const combos = HOTKEYS.map((item) => item.combo);
    expect(combos).not.toContain("Ctrl+Shift+I");
    expect(combos).not.toContain("Ctrl+Shift+J");
  });

  it("flags the seven app keys that must also work inside the Univer grid", () => {
    // App.tsx Ctrl+M 先例:Univer 宿主 DIV 是 contenteditable,useHotkeys 的
    // .univer-root 保留规则会吞表格内按键,这些键接线时须走捕获监听。
    const gridActions = HOTKEYS.filter((item) => item.worksInGrid).map((item) => item.action);
    expect(gridActions).toEqual([
      "saveDraft",
      "precheck",
      "submit",
      "palette",
      "collapseSidebar",
      "drawer",
      "inspector",
    ]);
    // F2 / Shift+F10 是 Univer 内置键,应用不接管。
    expect(HOTKEYS.filter((item) => item.owner === "univer").map((item) => item.action)).toEqual([
      "editCell",
      "contextMenu",
    ]);
  });

  it("maps Ctrl to the mac glyph for display but never maps Cmd to Ctrl", () => {
    expect(hotkeyLabel("Ctrl+Shift+Enter", "Win32")).toBe("Ctrl+Shift+Enter");
    expect(hotkeyLabel("Ctrl+Shift+Enter", "")).toBe("Ctrl+Shift+Enter");
    expect(hotkeyLabel("Ctrl+Shift+Enter", "MacIntel")).toBe("⌃⇧Enter");
    expect(hotkeyLabel("Ctrl+K", "MacIntel")).toBe("⌃K");
    expect(hotkeyLabel("Escape", "MacIntel")).toBe("Escape");
    // 匹配侧:metaKey(Cmd)不得触发 Ctrl 注册名。
    const onPalette = vi.fn();
    function Harness({ map }: { map: HotkeyMap }) {
      useHotkeys(map);
      return null;
    }
    mount(<Harness map={{ "Ctrl+K": onPalette }} />);
    press(window, "k", { meta: true });
    expect(onPalette).not.toHaveBeenCalled();
    press(window, "k", { ctrl: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
  });
});

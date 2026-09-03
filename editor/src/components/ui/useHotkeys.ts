import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export interface UseHotkeysOptions {
  enabled?: boolean;
}

function comboOf(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  // 大小写归一:真实浏览器的字母键是按下时的字面 key(Ctrl+M 通常是小写 "m"),
  // 与注册名 "Ctrl+M" 必须同侧比较(M6-G 快审 P2-1)。
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  return parts.join("+");
}

function normalizeCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) =>
      part.length === 1
        ? part.toLowerCase()
        : part === "Ctrl" || part === "Alt" || part === "Shift"
          ? part.toLowerCase()
          : part,
    )
    .join("+");
}

/**
 * 文本输入类目标(input / textarea / [contenteditable])与 Univer 编辑器宿主
 * (.univer-root,App.tsx 中表格容器)内 origin 的事件一律不处理,
 * 避免吞掉 Univer 的键盘事件。
 */
function isReservedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest("input, textarea, [contenteditable], .univer-root") !== null
  );
}

function normalizeMap(map: HotkeyMap): HotkeyMap {
  const normalized: HotkeyMap = {};
  for (const [combo, handler] of Object.entries(map)) {
    normalized[normalizeCombo(combo)] = handler;
  }
  return normalized;
}

export function useHotkeys(map: HotkeyMap, opts?: UseHotkeysOptions) {
  const mapRef = useRef(normalizeMap(map));

  useEffect(() => {
    mapRef.current = normalizeMap(map);
  }, [map]);

  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (isReservedTarget(event.target)) return;
      mapRef.current[comboOf(event)]?.(event);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}

/* ------------------------------------------------------------------ */
/* §11 全量键表(ADR 0005 / univer-surface.md §5 核定)。               */
/* ------------------------------------------------------------------ */

export type HotkeyAction =
  | "saveDraft"
  | "precheck"
  | "submit"
  | "palette"
  | "collapseSidebar"
  | "drawer"
  | "inspector"
  | "editCell"
  | "contextMenu"
  | "close";

export interface HotkeyDef {
  readonly action: HotkeyAction;
  /** 注册名组合键(Ctrl+S 形态,大小写经 normalizeCombo 归一)。 */
  readonly combo: string;
  /** §11 动作名(中文),ShortcutsDialog / 命令面板展示用。 */
  readonly label: string;
  /** app = 应用级键(主 loop 接线);univer = Univer 内置键,应用不接管。 */
  readonly owner: "app" | "univer";
  /**
   * 「表格内也要生效」的 app 键。Univer 宿主 DIV 是 contenteditable,
   * useHotkeys 的 .univer-root 保留规则会吞掉表格内按键——这些键接线时
   * 必须走捕获阶段监听并只避开真文本输入(App.tsx 里 Ctrl+M 的先例)。
   */
  readonly worksInGrid: boolean;
}

/**
 * 全量键表:Ctrl+S 保存草稿、Ctrl+Enter 预检、Ctrl+Shift+Enter 提交、
 * Ctrl+K 命令面板、Ctrl+B 折叠表列表、Ctrl+J 抽屉、检查器键 Ctrl+M、
 * F2 编辑格、Shift+F10 右键、Escape 关闭弹层 / 收起抽屉。
 * 禁用浏览器已占用的 Ctrl+Shift+I / Ctrl+Shift+J;查找 / 替换(Ctrl+F/H)
 * 与撤销 / 重做(Ctrl+Z/Y)是 Univer 内置,不在应用键表(见 GridToolbar)。
 * Escape 分层关闭:弹层(命令面板 / 确认框 / 对话框)各自先消化,
 * 主 loop 只兜底「无弹层时收抽屉」,故不标 worksInGrid。
 */
export const HOTKEYS: readonly HotkeyDef[] = [
  { action: "saveDraft", combo: "Ctrl+S", label: "保存草稿", owner: "app", worksInGrid: true },
  { action: "precheck", combo: "Ctrl+Enter", label: "预检", owner: "app", worksInGrid: true },
  { action: "submit", combo: "Ctrl+Shift+Enter", label: "提交", owner: "app", worksInGrid: true },
  { action: "palette", combo: "Ctrl+K", label: "命令面板", owner: "app", worksInGrid: true },
  { action: "collapseSidebar", combo: "Ctrl+B", label: "折叠表列表", owner: "app", worksInGrid: true },
  { action: "drawer", combo: "Ctrl+J", label: "抽屉", owner: "app", worksInGrid: true },
  { action: "inspector", combo: "Ctrl+M", label: "检查器", owner: "app", worksInGrid: true },
  { action: "editCell", combo: "F2", label: "编辑格", owner: "univer", worksInGrid: false },
  { action: "contextMenu", combo: "Shift+F10", label: "右键", owner: "univer", worksInGrid: false },
  { action: "close", combo: "Escape", label: "关闭弹层 / 收起抽屉", owner: "app", worksInGrid: false },
];

/** 按动作取键定义(接线与 ShortcutsDialog 用)。 */
export function hotkeyOf(action: HotkeyAction): HotkeyDef {
  const def = HOTKEYS.find((item) => item.action === action);
  if (!def) {
    throw new Error(`unknown hotkey action: ${action}`);
  }
  return def;
}

/* ------------------------------------------------------------------ */
/* macOS 修饰键映射(仅展示;匹配侧永不映射 Cmd)。                     */
/* ------------------------------------------------------------------ */

/**
 * §11 硬约束:macOS 下 `Ctrl` 就是 Control 键(⌃),不映射 Cmd——
 * 匹配只看 event.ctrlKey(comboOf),metaKey 永远不触发注册名。
 * 本表仅用于快捷键的 mac 展示形(ShortcutsDialog / 命令面板快捷键列)。
 */
export const MAC_MODIFIERS: Readonly<Record<string, string>> = {
  Ctrl: "⌃",
  Shift: "⇧",
  Alt: "⌥",
};

export function isMacPlatform(platform: string): boolean {
  return /mac/i.test(platform);
}

/** 展示形组合键:非 mac 原样返回;mac 把修饰键换成符号,键名不动。 */
export function hotkeyLabel(combo: string, platform: string = navigator.platform): string {
  if (!isMacPlatform(platform)) {
    return combo;
  }
  return combo
    .split("+")
    .map((part) => MAC_MODIFIERS[part] ?? part)
    .join("");
}

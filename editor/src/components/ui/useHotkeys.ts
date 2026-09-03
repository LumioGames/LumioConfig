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

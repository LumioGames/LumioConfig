import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export interface UseHotkeysOptions {
  enabled?: boolean;
}

function comboOf(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.key);
  return parts.join("+");
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

export function useHotkeys(map: HotkeyMap, opts?: UseHotkeysOptions) {
  const mapRef = useRef(map);

  useEffect(() => {
    mapRef.current = map;
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

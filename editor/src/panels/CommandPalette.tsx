import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { hotkeyLabel } from "../components/ui/useHotkeys";

/**
 * 命令面板(设计稿 §11,ADR 0005):宽 480、顶部 80px,模糊匹配过滤,
 * ↑↓ 导航、Enter 执行、Esc 关闭;role=dialog + combobox/aria-activedescendant
 * 键盘模型;打开即聚焦输入框,关闭时归还焦点。
 * 条目(打开 <表>×N、预检、提交补丁、保存本地草稿、导出、新增行、查找 / 替换、
 * 折叠表列表、打开补丁预览、快捷键、设置)由主 loop 经 commands 传入。
 * 样式全部走 tokens.css 变量(panels/** 不写字面色)。
 */

export interface PaletteCommand {
  group: string;
  label: string;
  shortcut?: string;
  run(): void;
}

export interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose(): void;
}

const LIST_ID = "command-palette-list";
const optionId = (index: number) => `command-palette-option-${index}`;

/** 子序列模糊匹配:查询串的字符按序出现在目标文本里即命中(大小写不敏感)。 */
function fuzzyMatch(query: string, text: string): boolean {
  if (!query) {
    return true;
  }
  const q = query.toLowerCase();
  let cursor = 0;
  for (const ch of text.toLowerCase()) {
    if (ch === q[cursor]) {
      cursor += 1;
      if (cursor === q.length) {
        return true;
      }
    }
  }
  return false;
}

const BACKDROP_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 80,
  /* 遮罩只用令牌:由正文色混合出的半透明墨色(同 ui.css .dialog__backdrop) */
  background: "color-mix(in srgb, var(--color-text) 32%, transparent)",
};

const PANEL_STYLE: CSSProperties = {
  width: 480,
  maxWidth: "calc(100vw - 48px)",
  maxHeight: "calc(100vh - 120px)",
  display: "flex",
  flexDirection: "column",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  boxShadow: "var(--shadow-dialog)",
  overflow: "hidden",
};

const INPUT_ROW_STYLE: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border-subtle)",
  flex: "0 0 auto",
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-4)",
  background: "var(--color-bg-app)",
  color: "var(--color-text)",
  font: "var(--font-size-14) var(--font-sans)",
  outline: "none",
};

const LIST_STYLE: CSSProperties = {
  overflowY: "auto",
  padding: "2px 0 8px",
  flex: "1 1 auto",
};

const GROUP_STYLE: CSSProperties = {
  padding: "8px 12px 4px",
  fontSize: "var(--font-size-11)",
  color: "var(--color-text-faint)",
};

const OPTION_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 12px",
  fontSize: "var(--font-size-13)",
  color: "var(--color-text)",
  cursor: "pointer",
};

const ACTIVE_OPTION_STYLE: CSSProperties = {
  ...OPTION_STYLE,
  background: "var(--color-accent-bg)",
  color: "var(--color-accent)",
};

const SHORTCUT_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-11)",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
};

const EMPTY_STYLE: CSSProperties = {
  padding: "16px 12px",
  fontSize: "var(--font-size-13)",
  color: "var(--color-text-muted)",
};

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const filtered = commands.filter(
    (command) => fuzzyMatch(query, command.label) || fuzzyMatch(query, command.group),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  /* 过滤后条目变少时收拢激活下标。 */
  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  /* 激活项滚动进可视区(jsdom 无 scrollIntoView,容错)。 */
  useEffect(() => {
    if (!open) {
      return;
    }
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (filtered.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + delta + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter") {
      const command = filtered[activeIndex];
      if (!command) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      command.run();
      onClose();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div style={BACKDROP_STYLE} onMouseDown={handleBackdropMouseDown}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        data-testid="command-palette"
        style={PANEL_STYLE}
        onKeyDown={handleKeyDown}
      >
        <div style={INPUT_ROW_STYLE}>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={LIST_ID}
            aria-activedescendant={filtered.length > 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-label="搜索命令"
            placeholder="输入命令或表名…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            style={INPUT_STYLE}
          />
        </div>
        <div ref={listRef} id={LIST_ID} role="listbox" aria-label="命令列表" style={LIST_STYLE}>
          {filtered.length === 0 ? <div style={EMPTY_STYLE}>没有匹配的命令</div> : null}
          {filtered.map((command, index) => {
            const showGroup = index === 0 || command.group !== filtered[index - 1].group;
            return (
              <Fragment key={`${command.group}:${command.label}`}>
                {showGroup ? (
                  <div role="presentation" style={GROUP_STYLE}>
                    {command.group}
                  </div>
                ) : null}
                <div
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-index={index}
                  style={index === activeIndex ? ACTIVE_OPTION_STYLE : OPTION_STYLE}
                  onMouseEnter={() => setActiveIndex(index)}
                  /* 阻止点击抢焦点:键盘模型以输入框 + aria-activedescendant 为准。 */
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    command.run();
                    onClose();
                  }}
                >
                  <span>{command.label}</span>
                  {command.shortcut ? <span style={SHORTCUT_STYLE}>{hotkeyLabel(command.shortcut)}</span> : null}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

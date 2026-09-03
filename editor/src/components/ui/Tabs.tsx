import { useRef, type KeyboardEvent } from "react";

export type TabTone = "danger" | "conflict";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  tone?: TabTone;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange(id: string): void;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Tabs({ items, active, onChange }: TabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function focusTab(id: string) {
    tabRefs.current.get(id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const currentIndex = items.findIndex((item) => item.id === active);
    if (currentIndex === -1) return;
    const total = items.length;
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = items[(currentIndex + delta + total) % total];
    event.preventDefault();
    onChange(next.id);
    focusTab(next.id);
  }

  return (
    <div role="tablist" className="tabs" onKeyDown={handleKeyDown}>
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) {
                tabRefs.current.set(item.id, node);
              } else {
                tabRefs.current.delete(item.id);
              }
            }}
            type="button"
            role="tab"
            data-tab-id={item.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cx(
              "tabs__item",
              item.tone && `tabs__item--${item.tone}`,
              selected && "is-active",
            )}
            onClick={() => {
              if (!selected) onChange(item.id);
            }}
          >
            <span className="tabs__label">{item.label}</span>
            {item.count !== undefined ? (
              <span className="tabs__count">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

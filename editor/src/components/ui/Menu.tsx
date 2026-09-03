import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  group?: string;
  onSelect(): void;
}

export interface MenuProps {
  items: MenuItem[];
  anchor: { x: number; y: number };
  open: boolean;
  onClose(): void;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function firstEnabledIndex(items: MenuItem[]): number {
  const index = items.findIndex((item) => !item.disabled);
  return index === -1 ? 0 : index;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function Menu({ items, anchor, open, onClose }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(() => firstEnabledIndex(items));
  const [position, setPosition] = useState({ x: anchor.x, y: anchor.y });

  useEffect(() => {
    if (!open) return;
    setActiveIndex(firstEnabledIndex(items));
    menuRef.current?.focus();
    const node = menuRef.current;
    if (!node) return;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    setPosition({
      x: clamp(anchor.x, 0, Math.max(0, window.innerWidth - width)),
      y: clamp(anchor.y, 0, Math.max(0, window.innerHeight - height)),
    });
  }, [open, anchor.x, anchor.y]);

  if (!open) return null;

  function moveActive(delta: number) {
    const total = items.length;
    let index = activeIndex;
    for (let step = 0; step < total; step += 1) {
      index = (index + delta + total) % total;
      if (!items[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      const item = items[activeIndex];
      if (!item || item.disabled) return;
      event.preventDefault();
      item.onSelect();
      onClose();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      className="menu"
      style={{ position: "fixed", left: position.x, top: position.y }}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 && item.group !== undefined && item.group !== items[index - 1].group ? (
            <div className="menu__group">{item.group}</div>
          ) : null}
          <div
            role="menuitem"
            aria-disabled={item.disabled ? "true" : undefined}
            title={item.disabledReason}
            className={cx(
              "menu__item",
              item.disabled && "is-disabled",
              index === activeIndex && "is-active",
            )}
            onMouseEnter={() => {
              if (!item.disabled) setActiveIndex(index);
            }}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            <span className="menu__label">{item.label}</span>
            {item.shortcut ? <span className="menu__shortcut">{item.shortcut}</span> : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

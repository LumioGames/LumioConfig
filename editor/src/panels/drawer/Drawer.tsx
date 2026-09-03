import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

/**
 * 底部抽屉壳(设计稿 §8、原型 README「抽屉」段):收起 30px 页签条 / 展开 240px,
 * 高度不做过渡。页签条复用 Tabs(ui.css `.tabs__*`)的视觉与键盘语义,另加
 * `data-testid=tab-<id>`(Tabs 组件无 testid 透传,且不在本卡文件集)。
 *
 * 键盘:Ctrl+J 切换(应用级键,焦点在表格内也要生效——照 App.tsx Ctrl+M 先例走
 * window 捕获监听,只忽略真文本输入,不走 useHotkeys 的 .univer-root 保留规则);
 * Esc 先关弹层再收抽屉(冒泡监听:Dialog/Menu 已 preventDefault 的 Esc 不再收抽屉)。
 *
 * 开合与页签由 App 记入 viewState(localStorage),组件本身受控无状态。
 */
export type DrawerTabId = "patch" | "errors" | "conflicts" | "export" | "diff";

export interface DrawerTab {
  id: DrawerTabId;
  label: string;
  count?: number;
  tone?: "danger" | "conflict";
}

export interface DrawerProps {
  tabs: DrawerTab[];
  active: string;
  open: boolean;
  onSelect(id: string): void;
  onToggle(): void;
  children: ReactNode;
}

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  flex: "0 0 auto",
  background: "var(--color-bg-surface)",
  borderTop: "1px solid var(--color-border)",
  overflow: "hidden",
};

const STRIP_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  height: 30,
  padding: "0 6px",
  flex: "none",
  background: "var(--color-bg-app)",
};

const TAB_BASE_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  height: 24,
  padding: "0 8px",
  border: 0,
  borderRadius: "var(--radius-4)",
  background: "transparent",
  cursor: "pointer",
  fontSize: "var(--font-size-12)",
  color: "var(--color-text-muted)",
};

const TAB_ACTIVE_STYLE: CSSProperties = {
  ...TAB_BASE_STYLE,
  background: "var(--color-bg-surface)",
  boxShadow: "0 0 0 1px var(--color-border)",
  fontWeight: 600,
  color: "var(--color-text)",
};

const COUNT_STYLE: CSSProperties = {
  fontSize: "var(--font-size-10)",
  lineHeight: "15px",
  minWidth: 16,
  textAlign: "center",
  padding: "0 4px",
  borderRadius: 8,
  background: "var(--color-border-subtle)",
  color: "var(--color-text-muted)",
  fontWeight: 600,
};

const COUNT_TONE_STYLE: Record<"danger" | "conflict", CSSProperties> = {
  danger: { ...COUNT_STYLE, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" },
  conflict: { ...COUNT_STYLE, background: "var(--color-conflict-bg)", color: "var(--color-conflict)" },
};

const SPACER_STYLE: CSSProperties = { flex: 1 };

const TOGGLE_STYLE: CSSProperties = {
  width: 24,
  height: 24,
  border: 0,
  borderRadius: "var(--radius-4)",
  background: "transparent",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  color: "var(--color-text-muted)",
};

const BODY_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "10px 12px",
};

function IconChevron(open: boolean) {
  return open ? (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 7.5l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Drawer({ tabs, active, open, onSelect, onToggle, children }: DrawerProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  // 监听器只挂一次,回调经 ref 转发,避免每次渲染反复解绑。
  const onToggleRef = useRef(onToggle);
  const openRef = useRef(open);
  onToggleRef.current = onToggle;
  openRef.current = open;

  // Ctrl+J:应用级键,捕获阶段注册(Univer 画布会拦冒泡 keydown),只忽略真文本输入。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "j") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      event.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Esc:冒泡监听,弹层(Dialog/Menu)先处理并 preventDefault 的 Esc 到这里已被标记。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !openRef.current) {
        return;
      }
      event.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function focusTab(id: string) {
    tabRefs.current.get(id)?.focus();
  }

  function handleStripKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    if (currentIndex === -1) return;
    const total = tabs.length;
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(currentIndex + delta + total) % total];
    event.preventDefault();
    onSelect(next.id);
    focusTab(next.id);
  }

  return (
    <section
      data-testid="panel"
      aria-expanded={open}
      style={{ ...PANEL_STYLE, height: open ? 240 : 30 }}
    >
      <div role="tablist" aria-label="抽屉" style={{ ...STRIP_STYLE, borderBottom: open ? "1px solid var(--color-border)" : 0 }} onKeyDown={handleStripKeyDown}>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(tab.id, node);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              data-testid={`tab-${tab.id}`}
              data-tab-id={tab.id}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              style={isActive ? TAB_ACTIVE_STYLE : TAB_BASE_STYLE}
              onClick={() => {
                // 原型语义:页签点击同时展开抽屉,由 App 的 onSelect 接线完成(组件保持单回调)。
                onSelect(tab.id);
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined ? (
                <span style={tab.tone ? COUNT_TONE_STYLE[tab.tone] : COUNT_STYLE}>{tab.count}</span>
              ) : null}
            </button>
          );
        })}
        <span style={SPACER_STYLE} />
        <button
          type="button"
          style={TOGGLE_STYLE}
          aria-label={open ? "收起面板" : "展开面板"}
          aria-expanded={open}
          title={open ? "收起（Esc）" : "展开"}
          onClick={onToggle}
        >
          {IconChevron(open)}
        </button>
      </div>
      {open ? (
        <div role="tabpanel" style={BODY_STYLE}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

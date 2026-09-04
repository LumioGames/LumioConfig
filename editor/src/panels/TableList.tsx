import { useEffect, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Button, Menu, useToast, type MenuItem } from "../components/ui";
import { COPY } from "../app/copy";
import { isStorageFallback, safeStorage } from "../app/storage";
import type { SourceViewKind } from "./SourceViewDialog";

/** §10:首次打开 toast 只出一次的标记键(任务书 Task 12 逐字)。 */
const ONBOARDING_KEY = "lumio-config-editor:onboarded";

export interface TableListEntry {
  name: string;
  rowCount: number;
  dirtyCount: number;
  conflictCount: number;
}

export interface TableListProps {
  tables: TableListEntry[];
  active: string;
  collapsed: boolean;
  onSelect(name: string): void;
  onToggleCollapse(): void;
  /** M7-E §4:右键菜单「查看源文件 / 查看 Schema」。未接线时菜单仍可开,选择为 noop。 */
  onViewSource?(table: string, kind: SourceViewKind): void;
  /** M7-G:capabilities.reveal 透传;仅 === true 渲染第三项(整项不渲染,不是禁用态)。 */
  revealEnabled?: boolean;
  /** M7-G:第三项回调;Host 端点未上线,缺省 noop(实际调用归 M7-G 接线)。 */
  onReveal?(table: string): void;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * M7-E:侧栏 nav 与表格区都是静态流,position:fixed 的菜单若不抬层会被后画的
 * Univer 画布盖住(点不中)。ui/Menu 无 style 形参、ui.css 不在本卡文件集,
 * 用定位包裹层建立 stacking context 抬到与 toast 同层(1000);包裹层零尺寸,
 * 菜单仍是 fixed 定位,视口夹紧逻辑不受影响。
 */
const MENU_LAYER_STYLE: CSSProperties = {
  position: "relative",
  zIndex: 1000,
};

interface TableMenuState {
  table: string;
  anchor: { x: number; y: number };
}

export function TableList({
  tables,
  active,
  collapsed,
  onSelect,
  onToggleCollapse,
  onViewSource,
  revealEnabled,
  onReveal,
}: TableListProps) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<TableMenuState | null>(null);
  const pushToast = useToast();

  useEffect(() => {
    // M7-K:存储一律走 safeStorage(隐私模式 / 存储被禁 / Node 26 遮蔽都不会抛);
    // 垫片模式下标记无法持久化,退化为每次都提示,而不是崩或静默吞。
    const storage = safeStorage("local");
    if (isStorageFallback("local")) {
      pushToast(COPY.onboardingToast);
      return;
    }
    if (storage.getItem(ONBOARDING_KEY) === null) {
      storage.setItem(ONBOARDING_KEY, "1");
      pushToast(COPY.onboardingToast);
    }
  }, [pushToast]);

  const keyword = query.trim();
  const visible = keyword ? tables.filter((table) => table.name.includes(keyword)) : tables;

  /** M7-E §4:右键 / Shift+F10 / ContextMenu 键共用的菜单打开入口。 */
  function openMenuAt(table: string, anchor: { x: number; y: number }) {
    setMenu({ table, anchor });
  }

  function handleContextMenu(event: MouseEvent<HTMLElement>, table: string) {
    event.preventDefault();
    openMenuAt(table, { x: event.clientX, y: event.clientY });
  }

  function handleMenuKey(event: KeyboardEvent<HTMLElement>, table: string) {
    // S03:键盘入口;锚点落在本行下缘(同 TopBar ⌄ 菜单口径),视口夹紧由 ui/Menu 负责。
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenuAt(table, { x: rect.left, y: rect.bottom + 4 });
    }
  }

  /** M7-E §4 的三条菜单项;第三项按 capabilities.reveal 整项渲染/不渲染。 */
  const menuItems: MenuItem[] = [];
  if (menu) {
    menuItems.push(
      {
        id: "view-source",
        label: COPY.tableMenu.viewSource,
        shortcut: `tables/${menu.table}.txt`,
        onSelect: () => onViewSource?.(menu.table, "table"),
      },
      {
        id: "view-schema",
        label: COPY.tableMenu.viewSchema,
        shortcut: `schemas/${menu.table}.json`,
        onSelect: () => onViewSource?.(menu.table, "schema"),
      },
    );
    if (revealEnabled === true) {
      // group 空串:与上两条只读项之间出组分隔(同 TopBar 路径菜单口径)。
      menuItems.push({
        id: "reveal",
        group: "",
        label: COPY.tableMenu.reveal,
        onSelect: () => onReveal?.(menu.table),
      });
    }
  }

  return (
    <nav
      className={cx("table-list", collapsed && "table-list--collapsed")}
      data-testid="table-list"
      aria-label={COPY.sidebar.ariaLabel}
    >
      {collapsed ? (
        <>
          <button
            type="button"
            className="table-list__toggle"
            data-testid="sidebar-toggle"
            aria-label={COPY.sidebar.expand}
            title={COPY.sidebar.expand}
            onClick={onToggleCollapse}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
          <ul className="table-list__rail">
            {visible.map((table) => (
              <li key={table.name}>
                <button
                  type="button"
                  className={cx("table-list__rail-item", table.name === active && "is-active")}
                  data-testid={`table-${table.name}`}
                  title={table.name}
                  aria-current={table.name === active ? "true" : undefined}
                  onClick={() => onSelect(table.name)}
                  onContextMenu={(event) => handleContextMenu(event, table.name)}
                  onKeyDown={(event) => handleMenuKey(event, table.name)}
                >
                  {table.name.charAt(0).toUpperCase()}
                  {table.dirtyCount > 0 ? (
                    <span className="table-list__rail-dot" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="table-list__top">
            <div className="table-list__search-box">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5L14 14" />
              </svg>
              <input
                type="search"
                className="table-list__search"
                data-testid="table-list-search"
                placeholder={COPY.sidebar.searchPlaceholder}
                aria-label={COPY.sidebar.searchPlaceholder}
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="table-list__toggle"
              data-testid="sidebar-toggle"
              aria-label={COPY.sidebar.collapse}
              title={COPY.sidebar.collapse}
              onClick={onToggleCollapse}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 3L5 8l5 5" />
              </svg>
            </button>
          </div>
          <ul className="table-list__items">
            {visible.map((table) => (
              <li key={table.name}>
                <Button
                  variant="nav"
                  active={table.name === active}
                  data-testid={`table-${table.name}`}
                  aria-current={table.name === active ? "true" : undefined}
                  onClick={() => onSelect(table.name)}
                  onContextMenu={(event) => handleContextMenu(event, table.name)}
                  onKeyDown={(event) => handleMenuKey(event, table.name)}
                >
                  <span className="table-list__name">{table.name}</span>
                  <span className="table-list__rows">{COPY.sidebar.rowCount(table.rowCount)}</span>
                  {table.conflictCount > 0 ? (
                    <span
                      className="table-list__badge table-list__badge--conflict"
                      title={COPY.sidebar.conflictBadgeTitle}
                    >
                      {COPY.sidebar.conflictBadge}
                    </span>
                  ) : null}
                  {table.dirtyCount > 0 ? (
                    <span
                      className="table-list__badge table-list__badge--dirty"
                      title={COPY.phase.dirty(table.dirtyCount)}
                    >
                      {table.dirtyCount}
                    </span>
                  ) : null}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div style={MENU_LAYER_STYLE}>
        <Menu
          open={menu !== null}
          anchor={menu?.anchor ?? { x: 0, y: 0 }}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      </div>
    </nav>
  );
}

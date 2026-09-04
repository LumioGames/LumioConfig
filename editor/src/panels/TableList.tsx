import { useEffect, useState, type ChangeEvent } from "react";
import { Button, useToast } from "../components/ui";
import { COPY } from "../app/copy";
import { isStorageFallback, safeStorage } from "../app/storage";

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
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function TableList({ tables, active, collapsed, onSelect, onToggleCollapse }: TableListProps) {
  const [query, setQuery] = useState("");
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
    </nav>
  );
}

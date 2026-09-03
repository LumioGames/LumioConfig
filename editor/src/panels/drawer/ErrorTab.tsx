import type { CSSProperties } from "react";
import { COPY } from "../../app/copy";
import type { ValidationError } from "../../spreadsheet/cellMeta";

/**
 * 抽屉「错误」页签(设计稿 §8「错误」):按表 / 行分组红头卡,每项
 * `列 · message · 建议 · code`,点击跳格并选中;空态区分
 * 没改动(no-changes)/ 未预检(not-validated)/ 预检通过(clean)。
 * 样式只走 tokens 变量(panels/** 不写字面色)。
 */

export type ErrorTabState = "no-changes" | "not-validated" | "clean" | "errors";

export interface ErrorTabProps {
  errors: ValidationError[];
  state: ErrorTabState;
  /** not-validated 空态文案「有 N 处改动（尚未预检）」的 N,接线方传 state.dirtyCount。 */
  dirtyCount?: number;
  onJump(row: string, column: string): void;
}

/** Host 预检错误(ApiErrorItem)带 table 字段,ValidationError 未声明但结构兼容;用于按表分组。 */
type ErrorItem = ValidationError & { table?: string };

interface ErrorGroup {
  key: string;
  label: string;
  items: ErrorItem[];
}

const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const GROUP_STYLE: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-4)",
  overflow: "hidden",
  background: "var(--color-bg-surface)",
};

const GROUP_HEADER_STYLE: CSSProperties = {
  padding: "4px 8px",
  fontSize: "var(--font-size-11)",
  fontWeight: 600,
  background: "var(--color-danger-bg)",
  color: "var(--color-danger-text)",
};

const ITEM_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 8px",
  border: 0,
  borderTop: "1px solid var(--color-border-subtle)",
  background: "transparent",
  color: "var(--color-text)",
  fontSize: "var(--font-size-12)",
  lineHeight: 1.5,
  cursor: "pointer",
};

const EMPTY_STYLE: CSSProperties = {
  margin: 0,
  padding: "12px 4px",
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-12)",
};

const SUGGESTION_STYLE: CSSProperties = { color: "var(--color-text-muted)" };
const CODE_STYLE: CSSProperties = {
  color: "var(--color-text-faint)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-11)",
};

function groupErrors(errors: ValidationError[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const error of errors as ErrorItem[]) {
    const table = error.table ?? "";
    const row = error.row ?? error.rowId ?? "";
    const key = `${table}\u0000${row}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: [table, row].filter(Boolean).join(" · "), items: [] };
      groups.set(key, group);
    }
    group.items.push(error);
  }
  return [...groups.values()];
}

/** 每项文本 `列 · message · 建议 · code`,建议缺失时跳过该段。 */
function itemParts(error: ErrorItem): Array<{ text: string; style?: CSSProperties }> {
  const parts: Array<{ text: string; style?: CSSProperties }> = [
    { text: error.column },
    { text: error.message },
  ];
  if (error.suggestion) {
    parts.push({ text: error.suggestion, style: SUGGESTION_STYLE });
  }
  parts.push({ text: error.code, style: CODE_STYLE });
  return parts;
}

export function ErrorTab({ errors, state, dirtyCount, onJump }: ErrorTabProps) {
  if (state !== "errors" || errors.length === 0) {
    if (state === "errors") {
      return null;
    }
    const empty =
      state === "not-validated"
        ? COPY.drawer.errorsEmpty.dirty(dirtyCount ?? 0)
        : state === "clean"
          ? COPY.drawer.errorsEmpty.validated
          : COPY.drawer.errorsEmpty.clean;
    return <p style={EMPTY_STYLE}>{empty}</p>;
  }
  return (
    <ul style={LIST_STYLE}>
      {groupErrors(errors).map((group) => (
        <li key={group.key} style={GROUP_STYLE}>
          {group.label ? (
            <div data-group-header="" style={GROUP_HEADER_STYLE}>
              {group.label}
            </div>
          ) : null}
          {group.items.map((error, index) => (
            <button
              key={`${error.code}-${error.column}-${index}`}
              type="button"
              data-error-item=""
              style={ITEM_STYLE}
              onClick={() => onJump(error.row ?? error.rowId ?? "", error.column)}
            >
              {itemParts(error).map((part, partIndex) => (
                <span key={partIndex}>
                  {partIndex > 0 ? " · " : null}
                  <span style={part.style}>{part.text}</span>
                </span>
              ))}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}

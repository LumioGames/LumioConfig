import type { CSSProperties } from "react";
import { COPY } from "../app/copy";
import { Button } from "../components/ui";
import type { CellState, CellToken } from "../api/types";
import { invalidReason, type CellMeta } from "../spreadsheet/cellMeta";
import { FOUR_STATE_MENU, tokenForDeleteKey, type FourStateKind } from "../spreadsheet/fourState";
import { columnTypeLabel } from "../spreadsheet/projection";
import { tokenEqual } from "../spreadsheet/tokens";

/**
 * 只读检查器(设计稿 §7;R-00380 S01)。不改值——改值一律格内(双击 / F2 /
 * 直接输入);本组件只展示与动作入口。挂载与 Ctrl+M 开合由 App 接线(主 loop)。
 *
 * 样式约束:panels/** 不写字面色,全部走 styles/tokens.css 的 --color-* 变量。
 */

export interface InspectorProps {
  open: boolean;
  selection: { row: number; column: string } | null;
  meta: CellMeta | null;
  onFourState(kind: FourStateKind): void;
  onRevert(): void;
  onDeleteRow(): void;
  onUndeleteRow(): void;
  onGoToConflicts(): void;
  onClose(): void;
}

const PANEL_STYLE: CSSProperties = {
  width: 260,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "8px 10px",
  overflowY: "auto",
  background: "var(--color-bg-surface)",
  borderLeft: "1px solid var(--color-border)",
  fontSize: "var(--font-size-12)",
  color: "var(--color-text)",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
};

const SECTION_TITLE_STYLE: CSSProperties = {
  fontSize: "var(--font-size-11)",
  color: "var(--color-text-muted)",
};

const BLOCK_STYLE: CSSProperties = {
  padding: "6px 8px",
  borderRadius: "var(--radius-4)",
  border: "1px solid var(--color-border-subtle)",
  background: "var(--color-bg-app)",
};

const INVALID_BLOCK_STYLE: CSSProperties = {
  ...BLOCK_STYLE,
  border: "1px solid var(--color-danger-text)",
  background: "var(--color-danger-bg)",
  color: "var(--color-danger-text)",
};

const CONFLICT_BLOCK_STYLE: CSSProperties = {
  ...BLOCK_STYLE,
  border: "1px solid var(--color-conflict)",
  background: "var(--color-conflict-bg)",
  color: "var(--color-conflict)",
};

const BUTTON_ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const TAG_STYLE: CSSProperties = {
  fontSize: "var(--font-size-11)",
  color: "var(--color-text-faint)",
};

const VALUE_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
};

function stateLabel(state: CellState): string {
  return COPY.inspector.stateLabels[state];
}

function displayText(token: CellToken): string {
  if (token.effective === null || token.effective === undefined) {
    return "";
  }
  return typeof token.effective === "string" ? token.effective : String(token.effective);
}

/** 四态键禁用原因(§7「不可用项给 tooltip 原因」;口径与右键菜单一致)。 */
function fourStateDisabledReason(kind: FourStateKind, meta: CellMeta): string | undefined {
  if (kind === "missing" && meta.column.required === true) {
    return COPY.validation.requiredMissingColumn;
  }
  if (kind === "default" && meta.column.default === undefined) {
    return COPY.inspector.noDefaultReason;
  }
  return undefined;
}

function deleteRuleText(meta: CellMeta): string {
  const result = tokenForDeleteKey(meta.column);
  if (result.token) {
    return `${COPY.inspector.deleteRulePrefix}${stateLabel(result.token.state)}`;
  }
  return COPY.validation.requiredNoDefault(meta.column.name);
}

function ConstraintRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={SECTION_TITLE_STYLE}>{label}</span>
      <span style={VALUE_STYLE}>{value}</span>
    </div>
  );
}

export function Inspector({
  open,
  selection,
  meta,
  onFourState,
  onRevert,
  onDeleteRow,
  onUndeleteRow,
  onGoToConflicts,
  onClose,
}: InspectorProps) {
  if (!open) {
    return null;
  }
  if (!meta) {
    return (
      <aside data-testid="inspector" style={PANEL_STYLE} aria-label={COPY.inspector.constraintTitle}>
        <header style={HEADER_STYLE}>
          <span style={TAG_STYLE}>
            {selection ? selection.column : COPY.inspector.emptyHint}
          </span>
          <Button onClick={onClose}>{COPY.inspector.close}</Button>
        </header>
        <p style={{ margin: 0, color: "var(--color-text-faint)" }}>{COPY.inspector.emptyHint}</p>
      </aside>
    );
  }

  const column = meta.column;
  const readOnly = column.readOnly === true || column.name === "id";
  const invalid = invalidReason(column, meta.current, meta.remoteErrors ?? []);
  const drifted =
    meta.baseline !== undefined && !tokenEqual(meta.baseline, meta.current);
  const labels = COPY.inspector.constraintLabels;
  const enumValues = column.enumValues ?? [];
  const hasRange = column.minimum !== undefined || column.maximum !== undefined;
  const rangeText =
    column.minimum !== undefined && column.maximum !== undefined
      ? `≥${column.minimum} 且 ≤${column.maximum}`
      : column.minimum !== undefined
        ? `≥${column.minimum}`
        : `≤${column.maximum}`;

  return (
    <aside data-testid="inspector" style={PANEL_STYLE} aria-label={COPY.inspector.constraintTitle}>
      {/* 面包屑(表 · 行名) */}
      <header style={HEADER_STYLE}>
        <span>
          {meta.table} · {meta.rowName}
        </span>
        <Button onClick={onClose}>{COPY.inspector.close}</Button>
      </header>

      {/* 列名 + 必填 / 只读 */}
      <div style={HEADER_STYLE}>
        <strong style={{ fontWeight: 600 }}>{column.name}</strong>
        <span style={TAG_STYLE}>
          {column.required === true ? COPY.inspector.requiredTag : ""}
          {readOnly ? ` ${COPY.inspector.readonlyTag}` : ""}
        </span>
      </div>

      {/* 无效原因块 */}
      {invalid ? (
        <div data-testid="invalid-reason" style={INVALID_BLOCK_STYLE}>
          <div>{invalid.message}</div>
          {invalid.suggestion ? <div>{invalid.suggestion}</div> : null}
          <div style={VALUE_STYLE}>{invalid.code}</div>
        </div>
      ) : null}

      {/* 冲突块 + 去冲突面板 */}
      {meta.conflict ? (
        <div style={CONFLICT_BLOCK_STYLE}>
          <div>{meta.conflict.message}</div>
          <Button onClick={onGoToConflicts}>{COPY.inspector.goToConflicts}</Button>
        </div>
      ) : null}

      {/* 当前值(只读展示 + 四态标签) */}
      <section>
        <div style={SECTION_TITLE_STYLE}>{COPY.inspector.currentValue}</div>
        <div style={VALUE_STYLE}>
          {displayText(meta.current)} <span style={TAG_STYLE}>{stateLabel(meta.current.state)}</span>
        </div>
      </section>

      {/* 基线 → 当前 + 还原 */}
      {drifted ? (
        <section data-testid="cell-baseline">
          <div style={SECTION_TITLE_STYLE}>{COPY.inspector.baseline}</div>
          <div style={HEADER_STYLE}>
            <span style={VALUE_STYLE}>
              {meta.baseline?.raw} → {meta.current.raw}
            </span>
            <Button onClick={onRevert}>{COPY.inspector.revert}</Button>
          </div>
        </section>
      ) : null}

      {/* 四态四键(不可用项给 tooltip 原因;不改值,写入走格内同一管线) */}
      <section>
        <div style={BUTTON_ROW_STYLE}>
          {FOUR_STATE_MENU.map((item) => {
            const reason = fourStateDisabledReason(item.kind, meta);
            return (
              <Button
                key={item.kind}
                data-testid={`four-state-${item.kind}`}
                data-source="inspector"
                disabled={reason !== undefined}
                disabledReason={reason}
                onClick={() => onFourState(item.kind)}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      </section>

      {/* Delete 规则说明 */}
      <section style={TAG_STYLE}>{deleteRuleText(meta)}</section>

      {/* 列约束 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={SECTION_TITLE_STYLE}>{COPY.inspector.constraintTitle}</div>
        <ConstraintRow label={labels.type} value={columnTypeLabel(column)} />
        <ConstraintRow
          label={labels.required}
          value={column.required === true ? COPY.inspector.constraintValues.yes : COPY.inspector.constraintValues.no}
        />
        <ConstraintRow
          label={labels.default}
          value={column.default !== undefined ? String(column.default) : COPY.inspector.constraintValues.none}
        />
        {enumValues.length ? <ConstraintRow label={labels.enum} value={enumValues.join(" / ")} /> : null}
        {hasRange ? <ConstraintRow label={labels.range} value={rangeText} /> : null}
        <ConstraintRow
          label={labels.visibility}
          value={column.visibility ?? COPY.inspector.constraintValues.none}
        />
        {/* TableColumn 暂无描述字段(Host 侧 schema 未提供),占位「无」待补。 */}
        <ConstraintRow label={labels.description} value={COPY.inspector.constraintValues.none} />
      </section>

      {/* 行(已有 / 新行 / 已删;删除行 / 撤销删除) */}
      <section>
        <div style={SECTION_TITLE_STYLE}>{COPY.inspector.rowStatus[meta.rowStatus]}</div>
        <div style={BUTTON_ROW_STYLE}>
          {meta.rowStatus === "deleted" ? (
            <Button onClick={onUndeleteRow}>{COPY.inspector.undeleteRow}</Button>
          ) : (
            <Button onClick={onDeleteRow}>{COPY.inspector.deleteRow}</Button>
          )}
        </div>
      </section>
    </aside>
  );
}

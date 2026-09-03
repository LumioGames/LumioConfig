import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { RebaseConflict } from "../../api/types";
import { COPY } from "../../app/copy";
import { Button } from "../../components/ui";

/**
 * 抽屉「冲突」页签(设计稿 §8「冲突」、0-8 §4):进度「已解决 N / M」+ 进度条;
 * 每卡三列(打开时 / 仓库当前 / 我的草稿)+ 单选组(采仓库值 / 采我的值 /
 * 手工输入(内联输入框,Enter 确认)/ 恢复默认 / 设为 ∅);`DELETED_ROW_CONFLICT`
 * 只有「放弃我的改动」;底部「取消本次提交」「重新预检并提交」(全部解决后可用)。
 * 点卡跳格(格上 ⚑ 由投影层渲染)。手工输入走内联输入框,不弹浏览器对话框。
 * 样式只走 tokens 变量(panels/** 不写字面色)。
 */

export type Conflict = RebaseConflict;

export interface Resolution {
  kind: "repo" | "mine" | "input" | "default" | "null" | "drop";
  value?: string;
}

export interface ConflictTabProps {
  conflicts: Conflict[];
  resolved: Record<string, Resolution>;
  onResolve(key: string, r: Resolution): void;
  onResubmit(): void;
  onCancel(): void;
  /** 点卡跳格(接线方提供;不传则卡头不可点)。 */
  onJump?: (conflict: Conflict) => void;
}

/** 与原 ConflictPanel DataTable rowKey 同构的稳定键。 */
export function conflictKey(conflict: Conflict): string {
  return `${conflict.rowId ?? conflict.row}-${conflict.column}-${conflict.code}`;
}

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const PROGRESS_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "var(--font-size-12)",
  color: "var(--color-text)",
};

const PROGRESS_TEXT_STYLE: CSSProperties = { fontWeight: 600, whiteSpace: "nowrap" };

const PROGRESS_TRACK_STYLE: CSSProperties = {
  flex: "1 1 auto",
  height: 6,
  borderRadius: "var(--radius-12)",
  background: "var(--color-border-subtle)",
  overflow: "hidden",
};

const PROGRESS_FILL_STYLE: CSSProperties = {
  height: "100%",
  background: "var(--color-conflict)",
  transition: "width 0.2s ease",
};

const CARD_STYLE: CSSProperties = {
  border: "1px solid var(--color-conflict)",
  borderRadius: "var(--radius-4)",
  background: "var(--color-bg-surface)",
  overflow: "hidden",
};

const CARD_HEADER_BASE_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "4px 8px",
  border: 0,
  fontSize: "var(--font-size-11)",
  fontWeight: 600,
  background: "var(--color-conflict-bg)",
  color: "var(--color-conflict)",
};

const CARD_BODY_STYLE: CSSProperties = { padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 };

const VALUES_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 6,
};

const VALUE_CELL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const VALUE_LABEL_STYLE: CSSProperties = {
  fontSize: "var(--font-size-10)",
  color: "var(--color-text-faint)",
  whiteSpace: "nowrap",
};

const VALUE_TEXT_STYLE: CSSProperties = {
  fontSize: "var(--font-size-12)",
  fontFamily: "var(--font-mono)",
  color: "var(--color-text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const OPTIONS_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "4px 12px",
  margin: 0,
  padding: 0,
  border: 0,
};

const OPTION_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  margin: 0,
  fontSize: "var(--font-size-12)",
  color: "var(--color-text)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const INPUT_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const INPUT_FIELD_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  height: 24,
  padding: "0 6px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-4)",
  background: "var(--color-bg-surface)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-12)",
  fontFamily: "var(--font-mono)",
};

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 4,
  borderTop: "1px solid var(--color-border-subtle)",
};

const FOOTER_BUTTON_BASE_STYLE: CSSProperties = {
  height: 26,
  padding: "0 10px",
  fontSize: "var(--font-size-12)",
  whiteSpace: "nowrap",
};

const isDeletedRow = (conflict: Conflict): boolean =>
  conflict.code === "DELETED_ROW_CONFLICT" || !conflict.column;

function cardTitle(conflict: Conflict): string {
  const row = conflict.rowId ? `${conflict.row}（${conflict.rowId}）` : conflict.row;
  return [row, conflict.column || conflict.code].filter(Boolean).join(" · ");
}

export function ConflictTab({ conflicts, resolved, onResolve, onResubmit, onCancel, onJump }: ConflictTabProps) {
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  if (conflicts.length === 0) {
    return null;
  }
  const resolvedCount = conflicts.filter((conflict) => conflictKey(conflict) in resolved).length;
  const allResolved = resolvedCount === conflicts.length;
  const percent = `${(resolvedCount / conflicts.length) * 100}%`;

  function chooseOther(key: string, kind: Resolution["kind"]): void {
    setDraftInputs((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
    onResolve(key, { kind });
  }

  return (
    <section data-testid="conflict-panel" style={PANEL_STYLE}>
      <div style={PROGRESS_ROW_STYLE}>
        <span style={PROGRESS_TEXT_STYLE}>{COPY.drawer.conflict.resolved(resolvedCount, conflicts.length)}</span>
        <div
          role="progressbar"
          aria-label={COPY.drawer.conflict.progressLabel}
          aria-valuemin={0}
          aria-valuenow={resolvedCount}
          aria-valuemax={conflicts.length}
          style={PROGRESS_TRACK_STYLE}
        >
          <div data-progress-fill="" style={{ ...PROGRESS_FILL_STYLE, width: percent }} />
        </div>
      </div>
      {conflicts.map((conflict) => {
        const key = conflictKey(conflict);
        const resolution = resolved[key];
        const selected = resolution?.kind;
        const inputPending = key in draftInputs;
        const inputVisible = selected === "input" || inputPending;
        const inputValue = draftInputs[key] ?? resolution?.value ?? conflict.draft ?? "";
        const inputLabelId = `conflict-option-input-${key}`;
        return (
          <article key={key} style={CARD_STYLE}>
            {onJump ? (
              <button
                type="button"
                data-conflict-jump=""
                title={COPY.drawer.conflict.jumpTitle}
                style={{ ...CARD_HEADER_BASE_STYLE, cursor: "pointer" }}
                onClick={() => onJump(conflict)}
              >
                {cardTitle(conflict)}
              </button>
            ) : (
              <div style={CARD_HEADER_BASE_STYLE}>{cardTitle(conflict)}</div>
            )}
            <div style={CARD_BODY_STYLE}>
              <div style={VALUES_STYLE}>
                <div style={VALUE_CELL_STYLE}>
                  <span style={VALUE_LABEL_STYLE}>{COPY.drawer.conflict.colBase}</span>
                  <span style={VALUE_TEXT_STYLE} title={conflict.base ?? ""}>
                    {conflict.base ?? ""}
                  </span>
                </div>
                <div style={VALUE_CELL_STYLE}>
                  <span style={VALUE_LABEL_STYLE}>{COPY.drawer.conflict.colCurrent}</span>
                  <span style={VALUE_TEXT_STYLE} title={conflict.current ?? ""}>
                    {conflict.current ?? ""}
                  </span>
                </div>
                <div style={VALUE_CELL_STYLE}>
                  <span style={VALUE_LABEL_STYLE}>{COPY.drawer.conflict.colDraft}</span>
                  <span style={VALUE_TEXT_STYLE} title={conflict.draft ?? ""}>
                    {conflict.draft ?? ""}
                  </span>
                </div>
              </div>
              {isDeletedRow(conflict) ? (
                <Button
                  data-testid="conflict-drop"
                  onClick={() => onResolve(key, { kind: "drop" })}
                  style={{ ...FOOTER_BUTTON_BASE_STYLE, alignSelf: "flex-start" }}
                >
                  {COPY.drawer.conflict.drop}
                </Button>
              ) : (
                <>
                  <fieldset style={OPTIONS_STYLE} role="radiogroup" aria-label={conflict.column}>
                    <label style={OPTION_STYLE}>
                      <input
                        type="radio"
                        data-testid="conflict-warehouse"
                        name={key}
                        checked={selected === "repo"}
                        onChange={() => chooseOther(key, "repo")}
                      />
                      {COPY.drawer.conflict.pickRepo}
                    </label>
                    <label style={OPTION_STYLE}>
                      <input
                        type="radio"
                        data-testid="conflict-mine"
                        name={key}
                        checked={selected === "mine"}
                        onChange={() => chooseOther(key, "mine")}
                      />
                      {COPY.drawer.conflict.pickMine}
                    </label>
                    <label style={OPTION_STYLE} id={inputLabelId}>
                      <input
                        type="radio"
                        data-testid="conflict-input"
                        name={key}
                        checked={inputVisible}
                        onChange={() =>
                          setDraftInputs((prev) =>
                            key in prev ? prev : { ...prev, [key]: resolution?.value ?? conflict.draft ?? "" },
                          )
                        }
                      />
                      {COPY.drawer.conflict.pickInput}
                    </label>
                    <label style={OPTION_STYLE}>
                      <input
                        type="radio"
                        data-testid="conflict-default"
                        name={key}
                        checked={selected === "default"}
                        onChange={() => chooseOther(key, "default")}
                      />
                      {COPY.drawer.conflict.pickDefault}
                    </label>
                    <label style={OPTION_STYLE}>
                      <input
                        type="radio"
                        data-testid="conflict-null"
                        name={key}
                        checked={selected === "null"}
                        onChange={() => chooseOther(key, "null")}
                      />
                      {COPY.drawer.conflict.pickNull}
                    </label>
                  </fieldset>
                  {inputVisible ? (
                    <div style={INPUT_ROW_STYLE}>
                      <input
                        type="text"
                        data-testid="conflict-input-field"
                        aria-labelledby={inputLabelId}
                        placeholder={COPY.drawer.conflict.inputPlaceholder}
                        value={inputValue}
                        style={INPUT_FIELD_STYLE}
                        onChange={(event) =>
                          setDraftInputs((prev) => ({ ...prev, [key]: event.target.value }))
                        }
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            const value = (draftInputs[key] ?? "").trim();
                            if (value) {
                              onResolve(key, { kind: "input", value });
                            }
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </article>
        );
      })}
      <div style={FOOTER_STYLE}>
        <Button
          data-testid="conflict-cancel"
          onClick={onCancel}
          style={{
            ...FOOTER_BUTTON_BASE_STYLE,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-surface)",
            color: "var(--color-text)",
          }}
        >
          {COPY.bannerActions.cancelSubmit}
        </Button>
        <Button
          data-testid="conflict-resubmit"
          disabled={!allResolved}
          onClick={onResubmit}
          style={{
            ...FOOTER_BUTTON_BASE_STYLE,
            border: `1px solid ${allResolved ? "var(--color-accent)" : "var(--color-border)"}`,
            background: allResolved ? "var(--color-accent)" : "var(--color-bg-app)",
            color: allResolved ? "var(--color-bg-surface)" : "var(--color-text-faint)",
            fontWeight: 600,
          }}
        >
          {COPY.drawer.conflict.resubmit}
        </Button>
      </div>
    </section>
  );
}

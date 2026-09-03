import type { HistoryEntry } from "../../api/types";

/**
 * 「改动」页签(设计稿 §8「改动」、§9;Task 19 / C3)。
 *
 * 文案缺口:app/copy.ts 不在本卡文件集(主 loop / E 阵列并行收口),本文件的
 * DIFF_COPY 是过渡落点,待主 loop 迁入 COPY.drawer.diff(见 task-19-report.md)。
 */
const DIFF_COPY = {
  basisLabel: "对比基准",
  basis: {
    lastSeen: "上次打开",
    revision: "某修订之前",
    mineOnly: "仅我的未提交改动",
  },
  markLabel: "在表格中标记",
  groupMine: "我的",
  groupAi: "AI",
  mineEmpty: "还没有未提交改动",
  aiEmpty: "还没有修订记录",
  schemaChanged: "表结构已变化",
  createdRows: (rowIds: string[]) => `新增行：${rowIds.join("、")}`,
  deletedRows: (rowIds: string[]) => `删除行：${rowIds.join("、")}`,
} as const;

export type DiffBasis = "last-seen" | "revision" | "mine-only";

/** 我的未提交改动:由接线方对比当前 tokens 与 ProjectionMap.baseCells 得出。 */
export interface MyChange {
  row: number;
  rowId: string;
  column: string;
  from: string;
  to: string;
}

export interface DiffTabProps {
  /** 无 capabilities.history 时页签不渲染。 */
  enabled: boolean;
  mine: MyChange[];
  /** 接线方按 basis 拉取后传入的修订列表(last-seen/revision → since 过滤,mine-only → 空表)。 */
  history: HistoryEntry[];
  basis: DiffBasis;
  onBasisChange: (basis: DiffBasis) => void;
  /** 「在表格中标记」开关:开时接线方在网格里高亮改动格。 */
  mark: boolean;
  onMarkChange: (mark: boolean) => void;
  /** 历史条目传出 rowId(与 ProjectionMap.rowKeys 同域);「我的改动」传 1 基行号。 */
  onJump: (row: number | string, column: string) => void;
}

function cellLine(row: number | string, column: string, from: string, to: string): string {
  return `${row} · ${column} · ${from} → ${to}`;
}

export function DiffTab({
  enabled,
  mine,
  history,
  basis,
  onBasisChange,
  mark,
  onMarkChange,
  onJump,
}: DiffTabProps) {
  if (!enabled) {
    return null;
  }
  return (
    <section className="diff-tab" data-testid="diff-tab">
      <div className="diff-tab__controls">
        <label className="diff-tab__basis">
          {DIFF_COPY.basisLabel}
          <select
            data-testid="diff-basis"
            value={basis}
            onChange={(event) => onBasisChange(event.target.value as DiffBasis)}
          >
            <option value="last-seen">{DIFF_COPY.basis.lastSeen}</option>
            <option value="revision">{DIFF_COPY.basis.revision}</option>
            <option value="mine-only">{DIFF_COPY.basis.mineOnly}</option>
          </select>
        </label>
        <label className="diff-tab__mark">
          <input
            type="checkbox"
            data-testid="diff-mark"
            checked={mark}
            onChange={(event) => onMarkChange(event.target.checked)}
          />
          {DIFF_COPY.markLabel}
        </label>
      </div>
      <div className="diff-tab__group diff-tab__group--mine" data-testid="diff-group-mine">
        <h4
          className="diff-tab__group-title"
          data-testid="diff-group-mine-title"
          style={{ color: "var(--color-dirty)" }}
        >
          {DIFF_COPY.groupMine}
          <span className="diff-tab__count">{mine.length}</span>
        </h4>
        {mine.length === 0 ? (
          <p className="diff-tab__empty" data-testid="diff-mine-empty">
            {DIFF_COPY.mineEmpty}
          </p>
        ) : (
          <ul className="diff-tab__cells">
            {mine.map((change) => (
              <li key={`${change.rowId}:${change.column}`}>
                <button
                  type="button"
                  className="diff-tab__cell"
                  data-testid="diff-cell"
                  onClick={() => onJump(change.row, change.column)}
                >
                  {cellLine(change.row, change.column, change.from, change.to)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {basis !== "mine-only" ? (
        <div className="diff-tab__group diff-tab__group--ai" data-testid="diff-group-ai">
          <h4
            className="diff-tab__group-title"
            data-testid="diff-group-ai-title"
            style={{ color: "var(--color-ai)" }}
          >
            {DIFF_COPY.groupAi}
            <span className="diff-tab__count">{history.length}</span>
          </h4>
          {history.length === 0 ? (
            <p className="diff-tab__empty" data-testid="diff-ai-empty">
              {DIFF_COPY.aiEmpty}
            </p>
          ) : (
            history.map((entry) => (
              <article key={entry.revision} className="diff-tab__revision" data-testid="diff-revision">
                <header
                  className="diff-tab__revision-head"
                  style={{ background: "var(--color-ai-bg)", color: "var(--color-ai)" }}
                >
                  {entry.revision} · {entry.message} · {entry.time}
                </header>
                {entry.schemaChanged ? (
                  <p className="diff-tab__schema-note" data-testid="diff-schema-changed">
                    {DIFF_COPY.schemaChanged}
                  </p>
                ) : null}
                {entry.created.length > 0 ? (
                  <p className="diff-tab__row-note" data-testid="diff-created">
                    {DIFF_COPY.createdRows(entry.created)}
                  </p>
                ) : null}
                {entry.deleted.length > 0 ? (
                  <p className="diff-tab__row-note" data-testid="diff-deleted">
                    {DIFF_COPY.deletedRows(entry.deleted)}
                  </p>
                ) : null}
                <ul className="diff-tab__cells">
                  {entry.cells.map((cell) => (
                    <li key={`${entry.revision}:${cell.rowId}:${cell.column}`}>
                      <button
                        type="button"
                        className="diff-tab__cell"
                        data-testid="diff-cell"
                        onClick={() => onJump(cell.rowId, cell.column)}
                      >
                        {cellLine(cell.row, cell.column, cell.from, cell.to)}
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

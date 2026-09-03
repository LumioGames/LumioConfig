import { useState, type MouseEvent } from "react";
import type { FUniver } from "@univerjs/core/facade";
import { Menu, type MenuItem } from "../components/ui";
import { COPY } from "../app/copy";
import { COMMAND } from "../spreadsheet/commands";

/**
 * 自建 32px 表格区工具栏(ADR 0004:白名单动作不走 Univer 原生工具栏)。
 * 全部动作经 univerAPI.executeCommand(COMMAND.x);复制行是 lumio 复合操作
 * (commands.ts 注:无独立 Univer id),经 window.__lumioPoc.copyRow 走
 * App 层实现,四态 token 不丢。
 */

/** 图标内联 SVG path(16 viewBox,1.5px 描边,currentColor;CSP 下不引外链)。 */
const ICONS = {
  undo: "M6 4L2.5 7.5 6 11M3 7.5h6.5a4 4 0 010 8H8",
  redo: "M10 4l3.5 3.5L10 11M13 7.5H6.5a4 4 0 000 8H8",
  find: "M7 11.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.5 10.5L14 14",
  filter: "M2 3h12L9.5 8.5V13l-3 1V8.5z",
  sort: "M4 2v12M4 14l-2-2M4 14l2-2M10 2h4M10 6h3M10 10h2",
  freeze: "M2 6h12M6 2v12M2 2h12v12H2z",
  insert: "M8 3v10M3 8h10",
  copy: "M5 5h8v8H5zM3 11V3h8",
  del: "M3 4h10M6 4V2.5h4V4M4 4l1 10h6l1-10",
  zoom: "M7 11.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.5 10.5L14 14M5 7h4M7 5v4",
} as const;

/** 冻结首行(表头)+ 首列(id 列);SetFrozenCommand 参数实核 0.25.1。 */
const FREEZE_ON = { startRow: 1, startColumn: 1, ySplit: 1, xSplit: 1 };
/** 解冻 = 同命令的 -1 形态(与内置 cancel-frozen 的 mutation 参数一致)。 */
const FREEZE_OFF = { startRow: -1, startColumn: -1, ySplit: 0, xSplit: 0 };

const ZOOM_PRESETS = [1, 1.25, 1.5, 0.75];

export interface GridToolbarProps {
  univerAPI: FUniver | null;
  columnCount: number;
  canEdit: boolean;
}

/** FUniver facade 的选区读取链(App.tsx selectionRowColumn 同款结构口径)。 */
type SelectionHost = {
  getActiveWorkbook?: () => {
    getActiveSheet?: () => {
      getSelection?: () => {
        getActiveRange?: () => { getRow?: () => number } | null;
      } | null;
    } | null;
  } | null;
};

/** 返回当前选中的数据行 sheet 行号(0 是表头,不算;无选区返回 null)。 */
function readSelectionRow(univerAPI: FUniver | null): number | null {
  if (!univerAPI) {
    return null;
  }
  const host = univerAPI as unknown as SelectionHost;
  const row = host.getActiveWorkbook?.()?.getActiveSheet?.()?.getSelection?.()?.getActiveRange?.()?.getRow?.();
  return typeof row === "number" && row >= 1 ? row : null;
}

interface ToolbarButtonProps {
  testid: string;
  label: string;
  title: string;
  icon: string;
  /** 有值 = 禁用,并作为 title 给出原因。 */
  reason?: string;
  text?: string;
  onClick(event: MouseEvent<HTMLButtonElement>): void;
}

function ToolbarButton({ testid, label, title, icon, reason, text, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="grid-toolbar__button"
      data-testid={testid}
      aria-label={label}
      title={reason ?? title}
      aria-disabled={reason !== undefined ? true : undefined}
      disabled={reason !== undefined}
      onClick={onClick}
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
        <path d={icon} />
      </svg>
      {text ? <span className="grid-toolbar__button-text">{text}</span> : null}
    </button>
  );
}

export function GridToolbar({ univerAPI, columnCount, canEdit }: GridToolbarProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<{ x: number; y: number } | null>(null);

  const run = (id: string, params?: object) => {
    if (univerAPI) {
      void univerAPI.executeCommand(id, params);
    }
  };

  const selectionRow = readSelectionRow(univerAPI);
  const bridgeMap = window.__lumioPoc?.map() ?? null;

  const notReadyReason = univerAPI ? undefined : COPY.toolbar.notReady;
  const editReason = notReadyReason ?? (canEdit ? undefined : COPY.toolbar.notEditable);
  const rowReason = editReason ?? (selectionRow === null ? COPY.toolbar.noSelection : undefined);
  const copyReason = rowReason ?? (bridgeMap ? undefined : COPY.toolbar.noBridge);

  const sortItems: MenuItem[] = [
    { id: "sort-asc", label: COPY.toolbar.sortAsc, onSelect: () => run(COMMAND.sortAsc) },
    { id: "sort-desc", label: COPY.toolbar.sortDesc, onSelect: () => run(COMMAND.sortDesc) },
  ];

  const onInsertRow = () => {
    const row = readSelectionRow(univerAPI);
    if (row === null) {
      return;
    }
    run(COMMAND.insertRowAfter, { range: { startRow: row, endRow: row } });
  };

  const onDeleteRow = () => {
    const row = readSelectionRow(univerAPI);
    if (row === null) {
      return;
    }
    run(COMMAND.removeRowConfirm, { range: { startRow: row, endRow: row } });
  };

  const onCopyRow = () => {
    const row = readSelectionRow(univerAPI);
    const rowKey = row === null ? undefined : window.__lumioPoc?.map()?.rowKeys[row - 1];
    if (!rowKey) {
      return;
    }
    void window.__lumioPoc?.copyRow(rowKey);
  };

  const onToggleFreeze = () => {
    const next = !frozen;
    setFrozen(next);
    run(COMMAND.freeze, next ? FREEZE_ON : FREEZE_OFF);
  };

  const onZoom = () => {
    const next = (zoomIndex + 1) % ZOOM_PRESETS.length;
    setZoomIndex(next);
    run(COMMAND.zoom, { zoomRatio: ZOOM_PRESETS[next] });
  };

  return (
    <div
      role="region"
      aria-label={COPY.toolbar.ariaLabel}
      className="grid-toolbar"
      data-testid="grid-toolbar"
    >
      <ToolbarButton
        testid="tb-undo"
        label={COPY.toolbar.undo}
        title={COPY.toolbar.undoTitle}
        icon={ICONS.undo}
        reason={editReason}
        onClick={() => run(COMMAND.undo)}
      />
      <ToolbarButton
        testid="tb-redo"
        label={COPY.toolbar.redo}
        title={COPY.toolbar.redoTitle}
        icon={ICONS.redo}
        reason={editReason}
        onClick={() => run(COMMAND.redo)}
      />
      <span className="grid-toolbar__sep" aria-hidden="true" />
      <ToolbarButton
        testid="tb-find"
        label={COPY.toolbar.find}
        title={COPY.toolbar.findTitle}
        icon={ICONS.find}
        reason={notReadyReason}
        onClick={() => run(COMMAND.find)}
      />
      <span className="grid-toolbar__sep" aria-hidden="true" />
      <ToolbarButton
        testid="tb-filter"
        label={COPY.toolbar.filter}
        title={COPY.toolbar.filterTitle}
        icon={ICONS.filter}
        reason={notReadyReason}
        onClick={() => run(COMMAND.filterToggle)}
      />
      <ToolbarButton
        testid="tb-sort"
        label={COPY.toolbar.sort}
        title={COPY.toolbar.sortTitle}
        icon={ICONS.sort}
        reason={notReadyReason}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setSortAnchor({ x: rect.left, y: rect.bottom + 2 });
        }}
      />
      <ToolbarButton
        testid="tb-freeze"
        label={COPY.toolbar.freeze}
        title={COPY.toolbar.freezeTitle}
        icon={ICONS.freeze}
        reason={notReadyReason}
        onClick={onToggleFreeze}
      />
      <span className="grid-toolbar__sep" aria-hidden="true" />
      <ToolbarButton
        testid="tb-insert-row"
        label={COPY.toolbar.insertRow}
        title={COPY.toolbar.insertRowTitle}
        icon={ICONS.insert}
        text={COPY.toolbar.insertRow}
        reason={rowReason}
        onClick={onInsertRow}
      />
      <ToolbarButton
        testid="tb-copy-row"
        label={COPY.toolbar.copyRow}
        title={COPY.toolbar.copyRowTitle}
        icon={ICONS.copy}
        reason={copyReason}
        onClick={onCopyRow}
      />
      <ToolbarButton
        testid="tb-delete-row"
        label={COPY.toolbar.deleteRow}
        title={COPY.toolbar.deleteRowTitle}
        icon={ICONS.del}
        reason={rowReason}
        onClick={onDeleteRow}
      />
      <span className="grid-toolbar__sep" aria-hidden="true" />
      <ToolbarButton
        testid="tb-zoom"
        label={COPY.toolbar.zoom}
        title={COPY.toolbar.zoom}
        icon={ICONS.zoom}
        text={`${Math.round(ZOOM_PRESETS[zoomIndex] * 100)}%`}
        reason={notReadyReason}
        onClick={onZoom}
      />
      <span className="grid-toolbar__spacer" />
      <span className="grid-toolbar__hint">{COPY.toolbar.viewHint(columnCount)}</span>
      {sortAnchor ? (
        <Menu open items={sortItems} anchor={sortAnchor} onClose={() => setSortAnchor(null)} />
      ) : null}
    </div>
  );
}

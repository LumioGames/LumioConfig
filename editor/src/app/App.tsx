import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { HostApiError, api, readToken } from "../api/client";
import { LocalDraftSessionProvider } from "../api/draftSession";
import type {
  CellToken,
  Draft,
  PatchObject,
  PatchValidateResponse,
  ProjectionMap,
  RebaseConflict,
  SessionResponse,
  SessionTableSummary,
  TableColumn,
  TableResponse,
} from "../api/types";
import { FIXTURES, loadFixture } from "../fixtures/catalog";
import { Drawer } from "../panels/drawer/Drawer";
import { PatchTab, groupPatch } from "../panels/drawer/PatchTab";
import { ErrorTab } from "../panels/drawer/ErrorTab";
import { ConflictTab, conflictKey, type Resolution } from "../panels/drawer/ConflictTab";
import { ExportTab, type ExportRequest, type ExportResult } from "../panels/drawer/ExportTab";
import { SettingsDialog, type EditorSettings } from "../panels/SettingsDialog";
import { StatusBar } from "../panels/StatusBar";
import { TableList } from "../panels/TableList";
import { TopBar } from "../panels/TopBar";
import { Banner } from "../panels/Banner";
import { GridToolbar } from "../panels/GridToolbar";
import { Inspector } from "../panels/Inspector";
import { ToastProvider } from "../components/ui";
import { CommandPalette } from "../panels/CommandPalette";
import { SubmitConfirm } from "../panels/SubmitConfirm";
import { ShortcutsDialog } from "../panels/ShortcutsDialog";
import { Blocked } from "../panels/Blocked";
import { DiffTab, type MyChange } from "../panels/drawer/DiffTab";
import type { HistoryEntry } from "../api/types";
import { history as fetchHistory } from "../api/client";
import { applyEditors, editorKinds, type EditorKind } from "../spreadsheet/editors";
import { installLumioBadges } from "../spreadsheet/badges";
import type { CellMeta } from "../spreadsheet/cellMeta";
import { buildDraft, buildPatch, countDirty, extractTokens, mergeCurrentCells, rememberToken } from "../spreadsheet/extract";
import { tokenEqual } from "../spreadsheet/tokens";
import { tokenForDeleteKey, tokenForMenu, type FourStateKind } from "../spreadsheet/fourState";
import { COMMAND, installInterceptors, newDraftRowKey } from "../spreadsheet/interceptors";
import { applyDraft, applyRebase, buildCell, workbookFromWarehouse } from "../spreadsheet/projection";
import { createSheetsUniver, loadWorkbook, type SheetsUniver } from "../spreadsheet/univer";
import {
  applyViewState,
  captureViewState,
  changedSinceSeen,
  load as loadView,
  readSeen,
  save as saveView,
  uiFlags,
  writeSeen,
} from "../spreadsheet/viewState";
import { INITIAL_EDITOR_STATE, canEdit, canSave, canValidate, reducer, type EditorAction } from "./state";
import { phaseView } from "./phaseView";
import { COPY } from "./copy";

const REPO_NAME = "LumioConfig";
const AUTOSAVE_MS = 2000;

export interface PocBridge {
  extractTokens: () => Record<string, Record<string, CellToken>>;
  map: () => ProjectionMap | null;
  hint: () => string;
  table: () => string;
  timings: Record<string, number>;
  setHint: (hint: string) => void;
  setPhase: (phase: string, failKind?: string, online?: boolean, dirtyCount?: number, hint?: string) => void;
  executeCommand: (id: string, params?: unknown) => Promise<unknown>;
  applyFourState: (rowKey: string, column: string, kind: FourStateKind) => Promise<void> | void;
  deleteKey: (rowKey: string, column: string) => Promise<string | undefined> | string | undefined;
  applyDraftSnapshot: (draft: Draft) => boolean;
  copyRow: (rowKey: string) => Promise<string | undefined>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  editorKinds: () => Record<string, EditorKind>;
  refOptions: () => Record<string, string[]>;
  saveDraftNow: () => Promise<number | undefined>;
  persistViewNow: () => void;
  draftVersion: () => number;
  phase: () => string;
  buildPatch: () => PatchObject | null;
  validateNow: () => Promise<unknown>;
  submitNow: () => Promise<unknown>;
  rebaseNow: () => Promise<unknown>;
}

declare global {
  interface Window {
    __lumioPoc?: PocBridge;
  }
}

function columnOf(table: TableResponse | null, name: string): TableColumn | undefined {
  return table?.columns.find((item) => item.name === name);
}

function idToName(rows: Array<{ id: number | string; name: string }>): Record<string, string> {
  const names: Record<string, string> = {};
  for (const row of rows) {
    names[String(row.id)] = String(row.name);
  }
  return names;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_EDITOR_STATE);
  const [tableNames, setTableNames] = useState<{ name: string; label?: string }[] | undefined>(undefined);
  const [tableSummaries, setTableSummaries] = useState<SessionTableSummary[] | undefined>(undefined);
  const [dirtyCounts, setDirtyCounts] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Array<{ code?: string; message?: string }>>([]);
  const [conflicts, setConflicts] = useState<RebaseConflict[]>([]);
  const [patchPreview, setPatchPreview] = useState<PatchObject | null>(null);
  const [summary, setSummary] = useState("");
  const [revision, setRevision] = useState<{ vcs: string; id: string; branch: string } | null>(null);
  const revisionRef = useRef<{ vcs: string; id: string; branch: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selection, setSelection] = useState<{ row: number; column: string; rowKey: string } | null>(null);
  // autoCommit=false 且本次会话有合入未 commit 时,状态条常显「N 次合入未 commit」(§12)。
  const [uncommittedMerges, setUncommittedMerges] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("patch");
  const [submitResult, setSubmitResult] = useState<import("../api/draftSession").SubmitResult | null>(null);
  const [conflictResolved, setConflictResolved] = useState<Record<string, Resolution>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [seenBannerOpen, setSeenBannerOpen] = useState(false);
  const [autoCommit, setAutoCommit] = useState(true);
  const [autoExport, setAutoExport] = useState(false);
  const patchRef = useRef<PatchObject | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<SheetsUniver | null>(null);
  const mapRef = useRef<ProjectionMap | null>(null);
  const tableRef = useRef<TableResponse | null>(null);
  const interceptorsRef = useRef<{ dispose: () => void } | null>(null);
  const badgesRef = useRef<{ dispose: () => void } | null>(null);
  const timingsRef = useRef<Record<string, number>>({});
  const hostMode = Boolean(readToken());
  const providerRef = useRef(new LocalDraftSessionProvider());
  const stateRef = useRef(state);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refOptionsRef = useRef<Record<string, string[]>>({});
  const refNamesRef = useRef<Record<string, string>>({});
  const persistDraftRef = useRef<() => Promise<number | undefined>>(async () => undefined);
  const savingRef = useRef(false);
  const pendingHintRef = useRef("");
  const pendingFailKindRef = useRef<"" | "VCS">("");
  const rebasingRef = useRef(false);
  const conflictWriteRef = useRef(false);
  const rebaseFlightRef = useRef<Promise<unknown> | null>(null);
  // 最近一次 ui 开合态(persistView 合并保留,防止视图快照覆写抹掉标志)。
  const uiFlagsRef = useRef<{ inspectorOpen: boolean; sidebarCollapsed: boolean }>({
    inspectorOpen: false,
    sidebarCollapsed: false,
  });

  const rebaseNowRef = useRef<() => Promise<unknown>>(async () => undefined);
  stateRef.current = state;
  revisionRef.current = revision;
  uiFlagsRef.current = { inspectorOpen, sidebarCollapsed };

  const persistView = useCallback((table: string) => {
    const snapshot = instanceRef.current?.univerAPI.getActiveWorkbook()?.save();
    if (!snapshot) {
      return;
    }
    saveView(REPO_NAME, table, {
      ...captureViewState(snapshot as never, table),
      inspectorOpen: uiFlagsRef.current.inspectorOpen,
      sidebarCollapsed: uiFlagsRef.current.sidebarCollapsed,
    });
  }, []);

  const markDirty = useCallback(() => {
    const map = mapRef.current;
    const univerAPI = instanceRef.current?.univerAPI;
    if (!map || !univerAPI) {
      return;
    }
    const tokens = mergeCurrentCells(map, extractTokens(univerAPI, map));
    const dirty = countDirty(map, tokens);
    dispatch({ type: "dirty", dirtyCount: dirty });
    setDirtyCounts((current) => ({ ...current, [map.table]: dirty }));
    if (!hostMode || dirty <= 0) {
      return;
    }
    const phase = stateRef.current.phase;
    if (
      phase === "Validating" ||
      phase === "ReadyToSubmit" ||
      phase === "Submitting" ||
      phase === "Conflicted" ||
      rebasingRef.current
    ) {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      void persistDraftRef.current();
    }, AUTOSAVE_MS);
  }, [hostMode]);

  const persistDraft = useCallback(async (): Promise<number | undefined> => {
    if (!hostMode) {
      return undefined;
    }
    const map = mapRef.current;
    const table = tableRef.current;
    const univerAPI = instanceRef.current?.univerAPI;
    const current = stateRef.current;
    if (!map || !table || !univerAPI) {
      return undefined;
    }
    if (
      savingRef.current ||
      current.phase === "Opening" ||
      current.phase === "Failed" ||
      current.phase === "Stale" ||
      current.phase === "Closed" ||
      current.phase === "SavingDraft" ||
      current.phase === "Validating" ||
      current.phase === "ReadyToSubmit" ||
      current.phase === "Submitting" ||
      current.phase === "Conflicted" ||
      rebasingRef.current
    ) {
      return undefined;
    }
    const tokens = mergeCurrentCells(map, extractTokens(univerAPI, map));
    const dirty = countDirty(map, tokens);
    if (dirty <= 0 && map.deleted.size === 0) {
      return current.draftVersion;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    savingRef.current = true;
    dispatch({ type: "saving" });
    const draft = buildDraft(table.table, map, tokens, current.draftVersion);
    try {
      const version = await providerRef.current.saveDraft(table.table, draft, current.draftVersion);
      dispatch({ type: "saved", draftVersion: version });
      setErrors([]);
      return version;
    } catch (error) {
      if (error instanceof HostApiError && error.code === "DRAFT_VERSION_CONFLICT") {
        if (rebasingRef.current) {
          return undefined;
        }
        // ADR 0005:409 归类为 failKind,canRefreshOnly / 横幅按它分派,
        // 不再对 hint 做子串判断。
        dispatch({ type: "failed", hint: COPY.banner.failedDraftConflict, failKind: "DRAFT_VERSION_CONFLICT" });
        setErrors([{ code: error.code, message: COPY.banner.failedDraftConflict }]);
        return undefined;
      }
      dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
      return undefined;
    } finally {
      savingRef.current = false;
    }
  }, [hostMode]);
  persistDraftRef.current = persistDraft;

  const writeToken = useCallback(async (rowKey: string, column: string, token: CellToken, force = false) => {
    if (!force && !canEdit(stateRef.current)) {
      dispatch({ type: "hint", hint: COPY.banner.failedDraftConflict });
      return;
    }
    const map = mapRef.current;
    const table = tableRef.current;
    const apiHost = instanceRef.current?.univerAPI as
      | { executeCommand?: (id: string, params?: unknown) => unknown }
      | undefined;
    const desc = columnOf(table, column);
    if (!map || !table || !desc || !apiHost?.executeCommand) {
      return;
    }
    const rowIndex = map.rowKeys.indexOf(rowKey);
    const colIndex = map.columns.indexOf(column);
    if (rowIndex < 0 || colIndex < 0) {
      return;
    }
    rememberToken(map, rowKey, column, token);
    conflictWriteRef.current = force;
    try {
      await apiHost.executeCommand(COMMAND.setRangeValues, {
        range: {
          startRow: rowIndex + 1,
          startColumn: colIndex,
          endRow: rowIndex + 1,
          endColumn: colIndex,
        },
        value: buildCell(token, desc, rowKey),
      });
    } finally {
      conflictWriteRef.current = false;
    }
    markDirty();
  }, [markDirty]);

  const disposeSheet = useCallback(() => {
    interceptorsRef.current?.dispose();
    badgesRef.current?.dispose();
    badgesRef.current = null;
    instanceRef.current?.dispose();
    instanceRef.current = null;
    interceptorsRef.current = null;
    mapRef.current = null;
    containerRef.current?.replaceChildren();
  }, []);

  /** 原生右键四态菜单(ADR 0004)的落点:取当前活动选区换算 rowKey/列。 */
  const selectionRowColumn = useCallback((): { rowKey: string; column: string } | null => {
    const map = mapRef.current;
    if (!map) {
      return null;
    }
    const univerAPI = instanceRef.current?.univerAPI as {
      getActiveWorkbook?: () => {
        getActiveSheet?: () => {
          getSelection?: () => { getActiveRange?: () => { getRow?: () => number; getColumn?: () => number } | null } | null;
        } | null;
      } | null;
    };
    const range = univerAPI.getActiveWorkbook?.()?.getActiveSheet?.()?.getSelection?.()?.getActiveRange?.();
    const row = range?.getRow?.();
    const col = range?.getColumn?.();
    if (row === undefined || col === undefined || row <= 0) {
      return null;
    }
    const rowKey = map.rowKeys[row - 1];
    const column = map.columns[col];
    if (!rowKey || !column) {
      return null;
    }
    return { rowKey, column };
  }, []);

  const applyFourStateToSelection = useCallback(
    (kind: FourStateKind) => {
      const target = selectionRowColumn();
      if (!target) {
        return;
      }
      const desc = columnOf(tableRef.current, target.column);
      if (!desc) {
        return;
      }
      const token = tokenForMenu(kind, desc);
      if (!token) {
        dispatch({ type: "hint", hint: COPY.validation.requiredMissingColumn });
        return;
      }
      void writeToken(target.rowKey, target.column, token);
    },
    [selectionRowColumn, writeToken],
  );

  /** 菜单项可用性与 tokenForMenu 同源:能造出 token 的 kind 才可点。 */
  const fourStateAvailability = useCallback((): Partial<Record<FourStateKind, boolean>> => {
    const target = selectionRowColumn();
    const desc = target ? columnOf(tableRef.current, target.column) : undefined;
    if (!desc) {
      return {};
    }
    return {
      missing: tokenForMenu("missing", desc) !== null,
      default: tokenForMenu("default", desc) !== null,
    };
  }, [selectionRowColumn]);

  const mountWorkbook = useCallback(
    (warehouse: TableResponse, draftVersion: number, staleHint?: string, overlay?: Draft) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const { workbook, map, displayed } = workbookFromWarehouse(warehouse, overlay, {
        refOptions: refOptionsRef.current,
      });
      applyViewState(workbook, warehouse.table, loadView(REPO_NAME, warehouse.table));
      const viewFlags = uiFlags(loadView(REPO_NAME, warehouse.table));
      // 同步镜像到 ref:挂载期间(loadWorkbook 触发的 onViewChange → persistView)
      // 可能先于 React 渲染发生,届时必须读到持久化的开合态,否则会把 false 覆写回存储。
      uiFlagsRef.current = viewFlags;
      setSidebarCollapsed(viewFlags.sidebarCollapsed);
      setInspectorOpen(viewFlags.inspectorOpen);
      setSelection(null);
      const projectedAt = performance.now();
      // ADR 0004:四态四项以「单元格」分组注入 Univer 原生右键,App 只传 handlers。
      const instance = createSheetsUniver(container, {
        fourState: {
          empty: () => applyFourStateToSelection("empty"),
          null: () => applyFourStateToSelection("null"),
          default: () => applyFourStateToSelection("default"),
          missing: () => applyFourStateToSelection("missing"),
          availability: fourStateAvailability,
        },
      });
      loadWorkbook(instance.univerAPI, workbook);
      badgesRef.current = installLumioBadges(instance.univer);
      void applyEditors(instance.univerAPI, displayed, refOptionsRef.current);
      const paintedAt = performance.now();
      const openAction: EditorAction = {
        type: "open",
        table: warehouse.table,
        fingerprint: warehouse.sourceFingerprint,
        rowCount: displayed.rows.length,
        draftVersion,
      };
      // dispatch 的结果要等下一次渲染才会同步进 stateRef；先用纯 reducer 投影出 open 后
      // 的最新快照，让 installInterceptors 的 canEdit 闭包在安装窗口内读到 ReadyClean 而
      // 非 Opening（评审 P2-2：启动误打「另一个标签页已保存，请刷新」）。渲染后
      // stateRef.current = state 会用同一 reducer 结果覆盖，二者一致。
      stateRef.current = reducer(stateRef.current, openAction);
      interceptorsRef.current = installInterceptors(instance.univerAPI, map, {
        onHint: (hint) => {
          if (rebasingRef.current || stateRef.current.phase === "Stale" || stateRef.current.phase === "Conflicted") {
            return;
          }
          dispatch({ type: "hint", hint });
        },
        tableColumns: warehouse.columns,
        canEdit: () =>
          conflictWriteRef.current || (!rebasingRef.current && canEdit(stateRef.current)),
        onChange: markDirty,
        onViewChange: () => {
          if (mapRef.current) {
            persistView(mapRef.current.table);
          }
        },
        executeCommand: (id, params) =>
          (instance.univerAPI as { executeCommand?: (commandId: string, commandParams?: unknown) => unknown }).executeCommand?.(
            id,
            params,
          ),
      });
      instanceRef.current = instance;
      mapRef.current = map;
      tableRef.current = warehouse;
      timingsRef.current = {
        ...timingsRef.current,
        projectMs: projectedAt - (timingsRef.current.loadStarted ?? projectedAt),
        firstPaintMs: paintedAt - (timingsRef.current.loadStarted ?? paintedAt),
        createWorkbookMs: paintedAt - projectedAt,
      };
      dispatch(openAction);
      if (hostMode) {
        const current = { revisionId: revisionRef.current?.id ?? "", fingerprint: warehouse.sourceFingerprint };
        if (!readSeen(REPO_NAME, warehouse.table)) {
          // 首次打开种入当前值,横幅自此 armed(E3 移交说明)。
          writeSeen(REPO_NAME, warehouse.table, current);
        } else if (changedSinceSeen(REPO_NAME, warehouse.table, current)) {
          setSeenBannerOpen(true);
        }
      }
      if (staleHint) {
        dispatch({ type: "stale", hint: staleHint });
      } else {
        const tokens = extractTokens(workbook, map);
        const dirty = countDirty(map, tokens);
        dispatch({ type: "dirty", dirtyCount: dirty });
        setDirtyCounts((current) => ({ ...current, [warehouse.table]: dirty }));
        if (pendingHintRef.current) {
          // 提交后的 VCS 后续失败经 reload 重新落 Failed·VCS(§5 P2-2 归类)。
          if (pendingFailKindRef.current) {
            dispatch({ type: "failed", hint: pendingHintRef.current, failKind: pendingFailKindRef.current });
            pendingFailKindRef.current = "";
          } else {
            dispatch({ type: "hint", hint: pendingHintRef.current });
          }
          pendingHintRef.current = "";
        }
      }
    },
    [applyFourStateToSelection, fourStateAvailability, markDirty],
  );

  const openTable = useCallback(
    (name: string) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      if (mapRef.current) {
        persistView(mapRef.current.table);
        if (mapRef.current.table !== name) {
          // 切表才清 ephemeral;同表 reload(提交后)保留结果卡。
          setSubmitResult(null);
          setConflictResolved({});
          setSeenBannerOpen(false);
        }
      }
      disposeSheet();
      const loadStarted = performance.now();
      timingsRef.current = { loadStarted };

      if (!hostMode) {
        const table = loadFixture(name);
        const loadedAt = performance.now();
        timingsRef.current.fixtureMs = loadedAt - loadStarted;
        const refs: Record<string, string[]> = {};
        const names: Record<string, string> = { ...refNamesRef.current };
        for (const column of table.columns) {
          if (column.type === "ref" && column.refTarget) {
            try {
              const target = loadFixture(column.refTarget);
              refs[column.refTarget] = target.rows.map((row) => row.name);
              Object.assign(names, idToName(target.rows));
            } catch {
              refs[column.refTarget] = [];
            }
          }
        }
        refOptionsRef.current = refs;
        refNamesRef.current = names;
        mountWorkbook(table, 0);
        return;
      }

      dispatch({ type: "online", online: true });
      void (async () => {
        try {
          const loaded = await providerRef.current.load(name);
          const refs: Record<string, string[]> = {};
          const names: Record<string, string> = { ...refNamesRef.current };
          for (const column of loaded.table.columns) {
            if (column.type === "ref" && column.refTarget && !refs[column.refTarget]) {
              try {
                const target = await providerRef.current.load(column.refTarget);
                refs[column.refTarget] = target.table.rows.map((row) => row.name);
                Object.assign(names, idToName(target.table.rows));
              } catch {
                refs[column.refTarget] = [];
              }
            }
          }
          refOptionsRef.current = refs;
          refNamesRef.current = names;
          const draft = loaded.draft;
          if (draft && draft.baseFingerprint !== loaded.table.sourceFingerprint) {
            mountWorkbook(loaded.table, draft.draftVersion ?? 0, "仓库已变化，草稿保留");
            void rebaseNowRef.current();
            return;
          }
          mountWorkbook(loaded.table, draft?.draftVersion ?? 0, undefined, draft);
        } catch (error) {
          dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
        }
      })();
    },
    [disposeSheet, hostMode, mountWorkbook, persistView],
  );

  const currentPatch = useCallback((): PatchObject | null => {
    const map = mapRef.current;
    const univerAPI = instanceRef.current?.univerAPI;
    if (!map || !univerAPI) {
      return null;
    }
    const tokens = mergeCurrentCells(map, extractTokens(univerAPI, map));
    return buildPatch(map, tokens, { refNames: refNamesRef.current });
  }, []);

  const validateNow = useCallback(async () => {
    const patch = currentPatch();
    if (!patch || !hostMode) {
      return undefined;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    dispatch({ type: "validate" });
    try {
      const result = await api<PatchValidateResponse>("/api/patch/validate", {
        method: "POST",
        body: JSON.stringify(patch),
      });
      patchRef.current = patch;
      setPatchPreview(patch);
      setSummary(result.summary);
      setErrors(result.errors);
      dispatch({ type: "validated", ok: result.ok, hint: result.ok ? result.summary : "预检失败" });
      return result;
    } catch (error) {
      dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }, [currentPatch, hostMode]);

  const submitNow = useCallback(async () => {
    if (!hostMode) {
      return undefined;
    }
    const patch = patchRef.current ?? currentPatch();
    if (!patch) {
      return undefined;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    dispatch({ type: "submit" });
    try {
      const result = await providerRef.current.submit(patch);
      if (!result.ok) {
        setErrors(result.errors);
        const followUp = result.errors.some(
          (item) => item.code === "VCS_COMMIT_FAILED" || item.code === "EXPORT_FAILED",
        );
        if (followUp) {
          // §5 Failed·failKind=VCS:改动已合入 TXT 但 commit/导表未完成;reload 后
          // 经 pendingFail 重新落 Failed,横幅给「查看详情 / 重试」。
          pendingHintRef.current = COPY.banner.failedVcs;
          pendingFailKindRef.current = "VCS";
          dispatch({ type: "validated", ok: false, hint: COPY.banner.failedVcs });
          openTable(stateRef.current.table);
          return result;
        }
        if (result.errors.some((item) => item.code === "SCHEMA_CHANGED")) {
          dispatch({ type: "schemaChanged" });
          return result;
        }
        const conflict = result.errors.some(
          (item) => item.code === "STALE_BASELINE" || item.code === "DELETED_ROW_CONFLICT",
        );
        if (conflict) {
          setConflicts(result.errors as RebaseConflict[]);
          dispatch({ type: "conflicted", hint: result.errors[0]?.message ?? "单元格冲突" });
        } else {
          dispatch({ type: "validated", ok: false, hint: result.errors[0]?.message ?? result.summary ?? "提交失败" });
        }
        return result;
      }
      dispatch({ type: "submitted", fingerprint: result.result?.sourceFingerprint ?? stateRef.current.fingerprint });
      setSubmitResult(result);
      setDrawerTab("patch");
      setDrawerOpen(true);
      // 自己的提交即「已看过」:刷新 seen。修订 id 必须与重开后比较所用的
      // /api/session 同源(快审 P1-2),先重取会话再写,否则恒被误报为外部变化。
      const submittedTable = tableRef.current?.table ?? stateRef.current.table;
      if (submittedTable) {
        // 必须先于 openTable 的 reload 完成,否则 mountWorkbook 的 seen 比较
        // 会读到旧修订/旧 seen(快审 P1-2 竞态)。
        try {
          const session = await api<SessionResponse>("/api/session");
          setRevision(session.revision);
          revisionRef.current = session.revision;
          writeSeen(REPO_NAME, submittedTable, {
            revisionId: session.revision.id,
            fingerprint: result.result?.sourceFingerprint ?? "",
          });
        } catch {
          /* 会话不可达则保留旧 seen,重开时按指纹兜底比较 */
        }
      }
      if (result.result?.vcs?.action === "none" && patch.ops.length > 0) {
        pendingHintRef.current = COPY.status.uncommittedMerges(1);
        setUncommittedMerges(1);
        dispatch({ type: "hint", hint: COPY.status.uncommittedMerges(1) });
      }
      setDirtyCounts((current) => ({ ...current, [stateRef.current.table]: 0 }));
      setErrors([]);
      openTable(stateRef.current.table);
      return result;
    } catch (error) {
      dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }, [currentPatch, hostMode, openTable]);

  const rebaseNow = useCallback(async () => {
    if (!hostMode) {
      return;
    }
    if (rebaseFlightRef.current) {
      return rebaseFlightRef.current;
    }
    const tableName = stateRef.current.table;
    rebasingRef.current = true;
    const flight = (async () => {
      try {
        const loadedDraft = await providerRef.current.load(tableName);
        if (stateRef.current.table !== tableName) {
          return undefined;
        }
        if (!loadedDraft.draft) {
          disposeSheet();
          mountWorkbook(loadedDraft.table, 0);
          return undefined;
        }
        const expected = loadedDraft.draft.draftVersion ?? stateRef.current.draftVersion;
        const result = await providerRef.current.rebase(tableName, expected);
        if (stateRef.current.table !== tableName) {
          return result;
        }
        if (result.code === "SCHEMA_CHANGED") {
          const loaded = await providerRef.current.load(tableName);
          if (stateRef.current.table !== tableName) {
            return result;
          }
          disposeSheet();
          mountWorkbook(loaded.table, 0);
          dispatch({ type: "schemaChanged" });
          stateRef.current = { ...stateRef.current, phase: "Failed", hint: "SCHEMA_CHANGED，请刷新重放" };
          return result;
        }
        const loaded = await providerRef.current.load(tableName);
        if (stateRef.current.table !== tableName) {
          return result;
        }
        disposeSheet();
        const overlay = {
          ...result.draft,
          baseFingerprint: loaded.table.sourceFingerprint,
          draftVersion: result.draftVersion,
        };
        mountWorkbook(loaded.table, result.draftVersion, undefined, overlay);
        setConflicts(result.conflicts ?? []);
        if (result.ok) {
          dispatch({ type: "rebased", merged: result.merged, draftVersion: result.draftVersion });
          stateRef.current = {
            ...stateRef.current,
            phase: "ReadyDirty",
            draftVersion: result.draftVersion,
            hint: `已合入仓库 ${result.merged} 处改动`,
          };
        } else {
          const map = mapRef.current;
          if (map) {
            applyRebase(loaded.table, map, result);
          }
          dispatch({ type: "conflicted", hint: result.conflicts[0]?.message ?? "单元格冲突" });
          stateRef.current = {
            ...stateRef.current,
            phase: "Conflicted",
            hint: result.conflicts[0]?.message ?? "单元格冲突",
          };
        }
        return result;
      } catch (error) {
        dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
        return undefined;
      } finally {
        rebasingRef.current = false;
        rebaseFlightRef.current = null;
      }
    })();
    rebaseFlightRef.current = flight;
    return flight;
  }, [disposeSheet, hostMode, mountWorkbook]);
  rebaseNowRef.current = rebaseNow;

  useEffect(() => {
    openTable("skills");
    return () => {
      interceptorsRef.current?.dispose();
      instanceRef.current?.dispose();
      instanceRef.current = null;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [openTable]);

  useEffect(() => {
    if (!hostMode) {
      return;
    }
      void api<SessionResponse>("/api/session")
      .then((session) => {
        setTableNames(session.tables.map((item: SessionTableSummary) => ({ name: item.name, label: item.name })));
        setTableSummaries(session.tables);
        setRevision(session.revision);
        setHistoryEnabled(Boolean((session as { capabilities?: { history?: boolean } }).capabilities?.history));
        setAutoCommit(session.settings.submit.autoCommit);
        setAutoExport(session.settings.submit.autoExport);
        dispatch({ type: "online", online: true });
      })
      .catch((error: unknown) => {
        dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
      });
    const stop = providerRef.current.subscribe((name, data) => {
      if (name === "schema_changed") {
        const eventTable = (data as { table?: string } | undefined)?.table;
        if (eventTable && eventTable !== stateRef.current.table) {
          return;
        }
        dispatch({ type: "schemaChanged" });
        return;
      }
      if (name === "repo_revision_changed") {
        const eventTable = (data as { table?: string } | undefined)?.table;
        if (eventTable && eventTable !== stateRef.current.table) {
          return;
        }
        const phase = stateRef.current.phase;
        if (phase === "Submitting" || phase === "Validating") {
          return;
        }
        void (async () => {
          await persistDraftRef.current();
          rebasingRef.current = true;
          stateRef.current = { ...stateRef.current, phase: "Stale" };
          dispatch({ type: "stale", hint: "仓库已变化，草稿保留" });
          await rebaseNow();
        })();
      }
    });
    return stop;
  }, [hostMode, rebaseNow]);

  /** 提交入口:仅当会 commit / 导表时先弹一句话确认(ADR 0005)。 */
  const requestSubmit = useCallback(() => {
    if (autoCommit || autoExport) {
      setSubmitConfirmOpen(true);
      return;
    }
    void submitNow();
  }, [autoCommit, autoExport, submitNow]);
  const requestSubmitRef = useRef(requestSubmit);
  requestSubmitRef.current = requestSubmit;

  useEffect(() => {
    window.__lumioPoc = {
      extractTokens: () => {
        const map = mapRef.current;
        const univerAPI = instanceRef.current?.univerAPI;
        if (!map || !univerAPI) {
          throw new Error("workbook not ready");
        }
        return extractTokens(univerAPI, map);
      },
      map: () => mapRef.current,
      hint: () => state.hint,
      table: () => state.table,
      timings: timingsRef.current,
      setHint: (hint: string) => dispatch({ type: "hint", hint }),
      setPhase: (phase: string, failKind?: string, online?: boolean, dirtyCount?: number, hint?: string) =>
        dispatch({ type: "debugPhase", phase: phase as never, failKind: failKind as never, online, dirtyCount, hint }),
      executeCommand: async (id: string, params?: unknown) => {
        const apiHost = instanceRef.current?.univerAPI as {
          executeCommand?: (commandId: string, commandParams?: unknown) => Promise<unknown>;
        };
        if (!apiHost?.executeCommand) {
          throw new Error("executeCommand unavailable");
        }
        return apiHost.executeCommand(id, params);
      },
      applyFourState: async (rowKey: string, column: string, kind: FourStateKind) => {
        const desc = columnOf(tableRef.current, column);
        if (!desc) {
          return;
        }
        const token = tokenForMenu(kind, desc);
        if (!token) {
          dispatch({ type: "hint", hint: COPY.validation.requiredMissingColumn });
          return;
        }
        await writeToken(rowKey, column, token);
      },
      deleteKey: async (rowKey: string, column: string) => {
        const desc = columnOf(tableRef.current, column);
        if (!desc) {
          return undefined;
        }
        const result = tokenForDeleteKey(desc);
        if (!result.token) {
          dispatch({ type: "hint", hint: result.hint ?? COPY.validation.requiredNoDefault(column) });
          return result.hint;
        }
        await writeToken(rowKey, column, result.token);
        return undefined;
      },
      applyDraftSnapshot: (draft: Draft) => {
        const table = tableRef.current;
        const container = containerRef.current;
        if (!table || !container) {
          return false;
        }
        const applied = applyDraft(table, draft);
        if (applied.stale) {
          dispatch({ type: "stale", hint: "仓库已变化，草稿保留" });
          return false;
        }
        disposeSheet();
        mountWorkbook(table, draft.draftVersion, undefined, draft);
        return true;
      },
      copyRow: async (rowKey: string) => {
        const map = mapRef.current;
        const table = tableRef.current;
        const apiHost = instanceRef.current?.univerAPI as {
          executeCommand?: (id: string, params?: unknown) => unknown;
        };
        if (!map || !table || !apiHost?.executeCommand) {
          return undefined;
        }
        const sheetRow = map.rowKeys.indexOf(rowKey) + 1;
        if (sheetRow <= 0) {
          return undefined;
        }
        const tokens = extractTokens(apiHost, map);
        const source = tokens[rowKey];
        const newKey = newDraftRowKey();
        await apiHost.executeCommand(COMMAND.insertRowAfter, {
          range: { startRow: sheetRow, endRow: sheetRow },
          lumioDraftKeys: [newKey],
        });
        const idDesc = columnOf(table, "id");
        rememberToken(map, newKey, "id", { state: "value", raw: "", effective: null });
        const newRow = map.rowKeys.indexOf(newKey) + 1;
        if (idDesc && newRow > 0) {
          await apiHost.executeCommand(COMMAND.setRangeValues, {
            range: { startRow: newRow, startColumn: 0, endRow: newRow, endColumn: 0 },
            value: buildCell({ state: "value", raw: "", effective: null }, idDesc, newKey),
          });
        }
        if (!source) {
          markDirty();
          return newKey;
        }
        for (const column of map.columns) {
          if (column === "id") {
            continue;
          }
          const token = source[column];
          const desc = columnOf(table, column);
          if (!token || !desc) {
            continue;
          }
          rememberToken(map, newKey, column, token);
          const colIndex = map.columns.indexOf(column);
          await apiHost.executeCommand(COMMAND.setRangeValues, {
            range: { startRow: newRow, startColumn: colIndex, endRow: newRow, endColumn: colIndex },
            value: buildCell(token, desc, newKey),
          });
        }
        markDirty();
        return newKey;
      },
      undo: async () => {
        const univerAPI = instanceRef.current?.univerAPI as { undo?: () => Promise<boolean> };
        return (await univerAPI?.undo?.()) ?? false;
      },
      redo: async () => {
        const univerAPI = instanceRef.current?.univerAPI as { redo?: () => Promise<boolean> };
        return (await univerAPI?.redo?.()) ?? false;
      },
      editorKinds: () => (tableRef.current ? editorKinds(tableRef.current) : {}),
      refOptions: () => refOptionsRef.current,
      saveDraftNow: () => persistDraft(),
      persistViewNow: () => {
        if (mapRef.current) {
          persistView(mapRef.current.table);
        }
      },
      buildPatch: () => currentPatch(),
      validateNow: () => validateNow(),
      submitNow: () => submitNow(),
      rebaseNow: () => rebaseNow(),
      draftVersion: () => state.draftVersion,
      phase: () => state.phase,
    };
    return () => {
      delete window.__lumioPoc;
    };
  }, [currentPatch, markDirty, mountWorkbook, persistDraft, rebaseNow, state.draftVersion, state.hint, state.phase, state.table, submitNow, validateNow, writeToken]);

  /** 跳格:按 rowKey/列名把选区移到目标格(补丁/错误/冲突/改动页签共用)。 */
  const jumpToCell = useCallback((rowKey: string, column: string) => {
    const map = mapRef.current;
    const apiHost = instanceRef.current?.univerAPI as {
      executeCommand?: (id: string, params?: unknown) => unknown;
    } | undefined;
    if (!map || !apiHost?.executeCommand) {
      return;
    }
    const row = map.rowKeys.indexOf(rowKey);
    const col = map.columns.indexOf(column);
    if (row < 0 || col < 0) {
      return;
    }
    apiHost.executeCommand("sheet.command.set-selection", {
      range: { startRow: row + 1, endRow: row + 1, startColumn: col, endColumn: col },
    });
    setSelection({ row: row + 1, column, rowKey });
    setInspectorOpen((open) => open);
  }, []);

  /** 检查器开合/侧栏折叠写入视图状态(localStorage)。 */
  const persistUiFlags = useCallback((table: string, patch: { inspectorOpen?: boolean; sidebarCollapsed?: boolean }) => {
    const current = loadView(REPO_NAME, table);
    saveView(REPO_NAME, table, { ...current, ...patch });
  }, []);

  const toggleInspector = useCallback(() => {
    setInspectorOpen((open) => {
      const next = !open;
      if (stateRef.current.table) {
        persistUiFlags(stateRef.current.table, { inspectorOpen: next });
      }
      return next;
    });
  }, [persistUiFlags]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      if (stateRef.current.table) {
        persistUiFlags(stateRef.current.table, { sidebarCollapsed: next });
      }
      return next;
    });
  }, [persistUiFlags]);

  // 应用级热键(M6-J 接线,HOTKEYS.worksInGrid 子集):捕获阶段 + 只避开真
  // 文本输入(Univer 宿主 DIV 是 contenteditable,先例见 Ctrl+M / Ctrl+J)。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (canSave(stateRef.current) || stateRef.current.dirtyCount > 0) {
          void persistDraft();
        }
      } else if (key === "enter") {
        event.preventDefault();
        if (event.shiftKey) {
          requestSubmitRef.current();
        } else if (canValidate(stateRef.current)) {
          void validateNow();
        }
      } else if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [persistDraft, toggleSidebar, validateNow]);

  // Ctrl+M 是应用级键(§11),焦点在表格内也要生效:不走 useHotkeys 的
  // .univer-root 保留规则,只忽略真文本输入;M6-J(Task 17)统一进 HOTKEYS。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "m") {
        return;
      }
      // 只拦真文本输入;Univer 网格宿主 DIV 本身是 contenteditable(聚焦态≠输入态),
      // 不能按 contenteditable 一律忽略。
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      event.preventDefault();
      toggleInspector();
    };
    // 捕获阶段:Univer 画布层会 stopPropagation 冒泡 keydown。
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleInspector]);

  /** 点格/选区变化 → 检查器目标(§3 默认收起,选格展开)。 */
  const trackSelection = useCallback(() => {
    const map = mapRef.current;
    const target = selectionRowColumn();
    if (!map || !target) {
      return;
    }
    const row = map.rowKeys.indexOf(target.rowKey) + 1;
    setSelection({ row, column: target.column, rowKey: target.rowKey });
    setInspectorOpen((open) => {
      if (!open && stateRef.current.table) {
        persistUiFlags(stateRef.current.table, { inspectorOpen: true });
      }
      return true;
    });
  }, [persistUiFlags, selectionRowColumn]);

// Univer canvas 会拦 mousedown 传播,React 合成事件收不到;用 document 捕获
  // 阶段监听(捕获先于子层 stopPropagation),命中表格容器再延时读选区。
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const container = containerRef.current;
      // 只认左键:右键属于上下文菜单交互,不应强制展开检查器(其四态键与
      // 原生菜单 testid 同名,同时出现会撞 strict 模式)。
      if (event.button !== 0) {
        return;
      }
      if (!container || !(event.target instanceof Node) || !container.contains(event.target)) {
        return;
      }
      window.setTimeout(trackSelection, 60);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [trackSelection]);

  /** 检查器展示模型(cellMeta.CellMeta):从 map+tokens+冲突表组装。 */
  const metaForSelection = useCallback((): CellMeta | null => {
    const map = mapRef.current;
    const table = tableRef.current;
    const univerAPI = instanceRef.current?.univerAPI;
    if (!map || !table || !selection || !univerAPI) {
      return null;
    }
    const desc = columnOf(table, selection.column);
    if (!desc) {
      return null;
    }
    const tokens = mergeCurrentCells(map, extractTokens(univerAPI, map));
    const current = tokens[selection.rowKey]?.[selection.column];
    if (!current) {
      return null;
    }
    const baseline = map.baseCells?.[selection.rowKey]?.[selection.column];
    const conflictCell = conflicts.find(
      (item) => item.rowId === selection.rowKey && item.column === selection.column,
    );
    return {
      table: table.table,
      rowKey: selection.rowKey,
      rowName: tokens[selection.rowKey]?.name?.raw ?? selection.rowKey,
      rowStatus: selection.rowKey.startsWith("draft:")
        ? "new"
        : map.deleted.has(selection.rowKey)
          ? "deleted"
          : "existing",
      column: desc,
      current,
      baseline,
      // 快审 P1-3:预检错误按行过滤,只给当前行的远端错误(串显他行是缺陷)。
      remoteErrors: errors.filter((item) => {
        const err = item as { row?: unknown; rowId?: unknown };
        return String(err.rowId ?? err.row ?? "") === selection.rowKey;
      }) as CellMeta["remoteErrors"],
      conflict: conflictCell ? { code: conflictCell.code ?? "", message: conflictCell.message ?? "" } : null,
    };
  }, [conflicts, errors, selection]);

  // 「改动」页签:进入时取修订级差异(Host history 端点,git 才有)。
  useEffect(() => {
    if (!hostMode || !historyEnabled || drawerTab !== "diff" || !drawerOpen) {
      return;
    }
    let alive = true;
    void fetchHistory(state.table)
      .then((result: { items: HistoryEntry[] }) => {
        if (alive) {
          setHistoryEntries(result.items);
        }
      })
      .catch(() => {
        if (alive) {
          setHistoryEntries([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [drawerOpen, drawerTab, historyEnabled, hostMode, state.table]);

  // Conflicted 自动切冲突页签并展开(§5 Conflicted 只允许冲突面板动作与取消)。
  useEffect(() => {
    if (state.phase === "Conflicted") {
      setDrawerTab("conflicts");
      setDrawerOpen(true);
    }
  }, [state.phase]);

  /** 「改动」页签的我的未提交改动:baseCells 与当前 token 的格级差。 */
  const myChanges = useCallback((): MyChange[] => {
    const map = mapRef.current;
    const univerAPI = instanceRef.current?.univerAPI;
    if (!map || !univerAPI) {
      return [];
    }
    const tokens = mergeCurrentCells(map, extractTokens(univerAPI, map));
    const changes: MyChange[] = [];
    for (const rowKey of map.rowKeys) {
      const rowIndex = map.rowKeys.indexOf(rowKey) + 1;
      const current = tokens[rowKey] ?? {};
      const base = map.baseCells?.[rowKey] ?? {};
      const columns = new Set([...Object.keys(base), ...Object.keys(current)]);
      for (const column of columns) {
        if (column === "id" || column === "name") {
          continue;
        }
        const now = current[column];
        const before = base[column];
        if (!now || tokenEqual(now, before)) {
          continue;
        }
        changes.push({
          row: rowIndex,
          rowId: rowKey,
          column,
          from: before?.raw ?? "@missing",
          to: now.raw,
        });
      }
    }
    return changes;
  }, []);

  const view = phaseView(state, {
    revision: revision ?? undefined,
    conflictCount: conflicts.length,
  });

  return (
    <ToastProvider>
    <div
      className="app-shell"
      data-inspector-open={inspectorOpen}
      data-sidebar-collapsed={sidebarCollapsed}
    >
      <TopBar
        tableName={state.table}
        revision={revision}
        view={view}
        dirtyCount={state.dirtyCount}
        inspectorOpen={inspectorOpen}
        onToggleSidebar={toggleSidebar}
        onOpenPalette={() => setPaletteOpen(true)}
        onExport={() => {
          setDrawerTab("export");
          setDrawerOpen(true);
        }}
        onValidate={() => {
          void validateNow();
        }}
        onSubmit={requestSubmit}
        onOpenSettings={() => {
          setSettingsOpen(true);
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onToggleInspector={toggleInspector}
      />
      <Banner
        banner={view.banner}
        onAction={(action) => {
          if (action === "refresh" || action === "retry") {
            window.location.reload();
          }
          /* resolve/cancel/details/ack 随 M6-I 冲突页签接线 */
        }}
      />
      <TableList
        tables={(hostMode
          ? (tableSummaries ?? []).map((item) => ({
              name: item.name,
              rowCount: item.rowCount,
              dirtyCount: dirtyCounts[item.name] ?? 0,
              conflictCount: item.name === state.table ? conflicts.length : 0,
            }))
          : FIXTURES.map((item) => ({
              // fixture 模式没有 /api/session,行数开表后才知,先给 0(侧栏不显示行数)。
              name: item.name,
              rowCount: 0,
              dirtyCount: dirtyCounts[item.name] ?? 0,
              conflictCount: item.name === state.table ? conflicts.length : 0,
            }))
        )}
        active={state.table}
        collapsed={sidebarCollapsed}
        onSelect={openTable}
        onToggleCollapse={toggleSidebar}
      />
      <div className="app-grid">
        <GridToolbar
          univerAPI={instanceRef.current?.univerAPI ?? null}
          columnCount={mapRef.current?.columns.length ?? 0}
          canEdit={canEdit(state)}
        />
        <div className="app-grid-body">
          <div ref={containerRef} className="univer-root" data-testid="univer-root" />
          {inspectorOpen ? (
            <Inspector
              open={inspectorOpen}
              selection={selection ? { row: selection.row, column: selection.column } : null}
              meta={metaForSelection()}
              onFourState={(kind) => {
                if (selection) {
                  void applyFourStateToSelection(kind);
                }
              }}
              onRevert={() => {
                const meta = metaForSelection();
                if (meta?.baseline && selection) {
                  void writeToken(selection.rowKey, selection.column, meta.baseline);
                }
              }}
              onDeleteRow={() => {
                const map = mapRef.current;
                if (map && selection && !selection.rowKey.startsWith("draft:")) {
                  map.deleted.add(selection.rowKey);
                  markDirty();
                }
              }}
              onUndeleteRow={() => {
                const map = mapRef.current;
                if (map && selection) {
                  map.deleted.delete(selection.rowKey);
                  markDirty();
                }
              }}
              onGoToConflicts={() => {
                /* 冲突跳转随 M6-I 接线 */
              }}
              onClose={() => setInspectorOpen(false)}
            />
          ) : null}
        </div>
      </div>
      <Drawer
        tabs={[
          { id: "patch", label: "补丁", count: state.dirtyCount },
          { id: "errors", label: "错误", count: errors.length, tone: errors.length > 0 ? "danger" : undefined },
          {
            id: "conflicts",
            label: "冲突",
            count: conflicts.length,
            tone: conflicts.length > 0 ? "conflict" : undefined,
          },
          { id: "export", label: "导出" },
          ...(historyEnabled ? [{ id: "diff" as const, label: "改动" }] : []),
        ]}
        active={drawerTab}
        open={drawerOpen}
        onSelect={(id) => {
          setDrawerTab(id);
          setDrawerOpen(true);
        }}
        onToggle={() => setDrawerOpen((open) => !open)}
      >
        {drawerTab === "patch" ? (
          <PatchTab
            patch={patchPreview}
            summary={summary}
            target={{
              branch: revision?.branch ?? null,
              sha: revision?.id ?? "",
              autoCommit,
              autoExport,
            }}
            result={submitResult}
            onJump={(row, column) => {
              // row = groupPatch 的 1 基分组序号(E1 口径)。rowKeys 是行 id,
              // op.name 是行名:经 tokens 的 name 原文反查行键(快审 P1-1)。
              const groups = patchPreview ? groupPatch(patchPreview) : [];
              const group = groups[row - 1];
              const map = mapRef.current;
              const univerAPI = instanceRef.current?.univerAPI;
              if (!group || !map || !univerAPI) {
                return;
              }
              const tokens = mergeCurrentCells(map, extractTokens(univerAPI, map));
              const rowKey = map.rowKeys.find(
                (key) => key === group.name || tokens[key]?.name?.raw === group.name,
              );
              if (rowKey) {
                jumpToCell(rowKey, column);
              }
            }}
          />
        ) : null}
        {drawerTab === "errors" ? (
          <ErrorTab
            errors={errors as never}
            state={
              errors.length > 0
                ? "errors"
                : state.phase === "ReadyToSubmit"
                  ? "clean"
                  : state.dirtyCount > 0
                    ? "not-validated"
                    : "no-changes"
            }
            dirtyCount={state.dirtyCount}
            onJump={(row, column) => {
              const map = mapRef.current;
              const rowKey = map?.rowKeys.find((key) => key === row);
              jumpToCell(rowKey ?? row, column);
            }}
          />
        ) : null}
        {drawerTab === "conflicts" ? (
          <ConflictTab
            conflicts={conflicts as never}
            resolved={conflictResolved}
            onResolve={(key, r) => {
              const conflict = conflicts.find((item) => conflictKey(item) === key);
              setConflictResolved((prev) => ({ ...prev, [key]: r }));
              if (!conflict) {
                return;
              }
              const map = mapRef.current;
              if (r.kind === "drop") {
                if (conflict.rowId && map) {
                  if (conflict.code === "DELETED_ROW_CONFLICT") {
                    delete map.currentCells[conflict.rowId];
                    map.rowKeys = map.rowKeys.filter((k) => k !== conflict.rowId);
                  } else {
                    map.deleted.delete(conflict.rowId);
                  }
                }
              } else {
                const raw =
                  r.kind === "repo"
                    ? (conflict.current ?? "")
                    : r.kind === "mine"
                      ? (conflict.draft ?? "")
                      : r.kind === "default"
                        ? "@default"
                        : r.kind === "null"
                          ? "null"
                          : (r.value ?? "");
                const token: CellToken =
                  raw === '""'
                    ? { state: "empty", raw, effective: "" }
                    : raw === "null"
                      ? { state: "null", raw, effective: null }
                      : raw === "@default"
                        ? { state: "default", raw, effective: null }
                        : raw === "@missing"
                          ? { state: "missing", raw, effective: null }
                          : { state: "value", raw, effective: raw };
                if (conflict.rowId && conflict.column) {
                  void writeToken(conflict.rowId, conflict.column, token, true);
                }
              }
              // 页签契约(E2):conflicts 列表保留,解决态走 resolved 记录;
              // 全部解决后由 conflict-resubmit 触发 conflictsResolved + 重新提交。
            }}
            onResubmit={async () => {
              // 0-8 §4:冲突解决后重新生成完整补丁并重跑 validate+apply,
              // 不得复用首次提交的过期 patchRef。成功后按合并完成口径提示
              // 「已合入仓库 N 处改动」(E2 冲突页签验收语义)。
              patchRef.current = null;
              dispatch({ type: "conflictsResolved" });
              stateRef.current = { ...stateRef.current, phase: "ReadyDirty" };
              const preview = currentPatch();
              const merged = preview?.ops.length ?? 0;
              const result = await submitNow();
              if (result && typeof result === "object" && "ok" in result && result.ok) {
                pendingHintRef.current = `已合入仓库 ${merged} 处改动`;
              }
            }}
            onCancel={() => {
              setConflicts([]);
              setConflictResolved({});
              dispatch({ type: "conflictsResolved" });
              stateRef.current = { ...stateRef.current, phase: "ReadyDirty" };
            }}
            onJump={(conflict) => {
              if (conflict.rowId && conflict.column) {
                jumpToCell(conflict.rowId, conflict.column);
              }
            }}
          />
        ) : null}
        {drawerTab === "diff" ? (
          <DiffTab
            enabled={historyEnabled}
            mine={myChanges()}
            history={historyEntries}
            basis="last-seen"
            onBasisChange={() => {
              /* 基准切换的下拉细化随后续需求;默认上次打开 */
            }}
            mark={false}
            onMarkChange={() => {
              /* 网格内高亮标记随后续需求(§8「在表格中标记」) */
            }}
            onJump={(rowValue, column) => {
              const map = mapRef.current;
              if (!map) {
                return;
              }
              // 我的改动 row 是 1 基表行号;Host 历史 cells[].row 运行时是
              // 行 id/名字符串(类型标 number,C3 concern),两种都兜。
              const rowKey =
                typeof rowValue === "number"
                  ? map.rowKeys[rowValue - 1]
                  : map.rowKeys.find((key) => key === rowValue);
              if (rowKey) {
                jumpToCell(rowKey, column);
              }
            }}
          />
        ) : null}
        {drawerTab === "export" ? (
          <ExportTab
            tables={hostMode ? (tableNames?.map((item) => item.name) ?? [state.table]) : FIXTURES.map((f) => f.name)}
            onExport={async (req: ExportRequest): Promise<ExportResult> => {
              const result = await api<{ exportId: string; files: ExportResult["files"] }>("/api/export", {
                method: "POST",
                body: JSON.stringify(req),
              });
              return result;
            }}
          />
        ) : null}
      </Drawer>
      {settingsOpen ? (
        <SettingsDialog
          open={settingsOpen}
          settings={{ autoCommit, autoExport }}
          onChange={async (next: EditorSettings) => {
            await api("/api/settings/local", {
              method: "PUT",
              body: JSON.stringify({ submit: { autoCommit: next.autoCommit, autoExport: next.autoExport } }),
            });
            setAutoCommit(next.autoCommit);
            setAutoExport(next.autoExport);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {seenBannerOpen ? (
        <Banner
          banner={{
            text: COPY.banner.changedSinceSeen,
            actions: [{ label: COPY.bannerActions.ack, action: "ack" }],
          }}
          onAction={() => {
            if (mapRef.current && tableRef.current) {
              writeSeen(REPO_NAME, mapRef.current.table, {
                revisionId: revisionRef.current?.id ?? "",
                fingerprint: tableRef.current.sourceFingerprint,
              });
            }
            setSeenBannerOpen(false);
          }}
        />
      ) : null}
      <StatusBar
        tableName={state.table}
        rowCount={state.rowCount}
        draftVersion={state.draftVersion}
        dirtyCount={state.dirtyCount}
        uncommittedMerges={uncommittedMerges}
        fingerprint={state.fingerprint}
        online={state.online}
        liveText={state.hint}
        onOpenPatchTab={() => {
          setDrawerTab("patch");
          setDrawerOpen(true);
        }}
      />
      {paletteOpen ? (
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={[
            ...(hostMode
              ? (tableSummaries ?? []).map((item) => ({
                  group: "打开表",
                  label: `打开 ${item.name}`,
                  run: () => {
                    openTable(item.name);
                    setPaletteOpen(false);
                  },
                }))
              : FIXTURES.map((item) => ({
                  group: "打开表",
                  label: `打开 ${item.name}`,
                  run: () => {
                    openTable(item.name);
                    setPaletteOpen(false);
                  },
                }))),
            {
              group: "动作",
              label: "预检",
              shortcut: "Ctrl+Enter",
              run: () => {
                void validateNow();
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "提交补丁",
              shortcut: "Ctrl+Shift+Enter",
              run: () => {
                requestSubmit();
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "保存本地草稿",
              shortcut: "Ctrl+S",
              run: () => {
                void persistDraft();
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "导出",
              run: () => {
                setDrawerTab("export");
                setDrawerOpen(true);
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "新增行",
              run: () => {
                const apiHost = instanceRef.current?.univerAPI as {
                  executeCommand?: (id: string, params?: unknown) => unknown;
                } | undefined;
                apiHost?.executeCommand?.(COMMAND.insertRowAfter);
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "查找 / 替换",
              run: () => {
                const apiHost = instanceRef.current?.univerAPI as {
                  executeCommand?: (id: string, params?: unknown) => unknown;
                } | undefined;
                apiHost?.executeCommand?.(COMMAND.find);
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "折叠表列表",
              shortcut: "Ctrl+B",
              run: () => {
                toggleSidebar();
                setPaletteOpen(false);
              },
            },
            {
              group: "动作",
              label: "打开补丁预览",
              shortcut: "Ctrl+J",
              run: () => {
                setDrawerTab("patch");
                setDrawerOpen(true);
                setPaletteOpen(false);
              },
            },
            {
              group: "帮助",
              label: "快捷键",
              run: () => {
                setShortcutsOpen(true);
                setPaletteOpen(false);
              },
            },
            {
              group: "帮助",
              label: "设置",
              run: () => {
                setSettingsOpen(true);
                setPaletteOpen(false);
              },
            },
          ]}
        />
      ) : null}
      <SubmitConfirm
        open={submitConfirmOpen}
        text={COPY.submitConfirm(
          state.dirtyCount,
          revision?.branch ?? "",
          revision?.id.slice(0, 8) ?? "",
          state.table,
          summary || (patchPreview ? "…" : ""),
          autoCommit,
          autoExport,
        )}
        onConfirm={() => {
          setSubmitConfirmOpen(false);
          void submitNow();
        }}
        onCancel={() => setSubmitConfirmOpen(false)}
      />
      {shortcutsOpen ? (
        <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      ) : null}
      {hostMode && !state.online && state.phase !== "Opening" ? (
        <Blocked
          kind={state.phase === "Closed" ? "closed" : "offline"}
          onRetry={() => window.location.reload()}
        />
      ) : null}
    </div>
    </ToastProvider>
  );
}

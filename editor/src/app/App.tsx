import { useCallback, useEffect, useReducer, useRef, useState, type MouseEvent } from "react";
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
import { loadFixture } from "../fixtures/catalog";
import { ConflictPanel } from "../panels/ConflictPanel";
import { DiffPreview } from "../panels/DiffPreview";
import { ErrorPanel } from "../panels/ErrorPanel";
import { SettingsPanel } from "../panels/SettingsPanel";
import { StatusBar } from "../panels/StatusBar";
import { TableList } from "../panels/TableList";
import { applyEditors, editorKinds, type EditorKind } from "../spreadsheet/editors";
import { buildDraft, buildPatch, countDirty, extractTokens, mergeCurrentCells, rememberToken } from "../spreadsheet/extract";
import { FOUR_STATE_MENU, tokenForDeleteKey, tokenForMenu, type FourStateKind } from "../spreadsheet/fourState";
import { COMMAND, installInterceptors, newDraftRowKey } from "../spreadsheet/interceptors";
import { applyDraft, applyRebase, buildCell, workbookFromWarehouse } from "../spreadsheet/projection";
import { createSheetsUniver, loadWorkbook, type SheetsUniver } from "../spreadsheet/univer";
import { applyViewState, captureViewState, load as loadView, save as saveView } from "../spreadsheet/viewState";
import { INITIAL_EDITOR_STATE, canEdit, canRefreshOnly, canSave, canSubmit, canValidate, reducer } from "./state";

const REPO_NAME = "LumioConfig";
const AUTOSAVE_MS = 2000;

export interface PocBridge {
  extractTokens: () => Record<string, Record<string, CellToken>>;
  map: () => ProjectionMap | null;
  hint: () => string;
  table: () => string;
  timings: Record<string, number>;
  setHint: (hint: string) => void;
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
  const [dirtyCounts, setDirtyCounts] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Array<{ code?: string; message?: string }>>([]);
  const [conflicts, setConflicts] = useState<RebaseConflict[]>([]);
  const [patchPreview, setPatchPreview] = useState<PatchObject | null>(null);
  const [summary, setSummary] = useState("");
  const [revisionLabel, setRevisionLabel] = useState("");
  const [autoCommit, setAutoCommit] = useState(true);
  const [autoExport, setAutoExport] = useState(false);
  const patchRef = useRef<PatchObject | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; rowKey: string; column: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<SheetsUniver | null>(null);
  const mapRef = useRef<ProjectionMap | null>(null);
  const tableRef = useRef<TableResponse | null>(null);
  const interceptorsRef = useRef<{ dispose: () => void } | null>(null);
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
  const rebasingRef = useRef(false);
  const rebaseFlightRef = useRef<Promise<unknown> | null>(null);
  const rebaseNowRef = useRef<() => Promise<unknown>>(async () => undefined);
  stateRef.current = state;

  const persistView = useCallback((table: string) => {
    const snapshot = instanceRef.current?.univerAPI.getActiveWorkbook()?.save();
    if (!snapshot) {
      return;
    }
    saveView(REPO_NAME, table, captureViewState(snapshot as never, table));
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
    if (phase === "Validating" || phase === "ReadyToSubmit" || phase === "Submitting" || rebasingRef.current) {
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
        dispatch({ type: "failed", hint: "另一个标签页已保存，请刷新" });
        setErrors([{ code: error.code, message: "另一个标签页已保存，请刷新" }]);
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
      dispatch({ type: "hint", hint: "另一个标签页已保存，请刷新" });
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
    await apiHost.executeCommand(COMMAND.setRangeValues, {
      range: {
        startRow: rowIndex + 1,
        startColumn: colIndex,
        endRow: rowIndex + 1,
        endColumn: colIndex,
      },
      value: buildCell(token, desc, rowKey),
    });
    markDirty();
  }, [markDirty]);

  const disposeSheet = useCallback(() => {
    interceptorsRef.current?.dispose();
    instanceRef.current?.dispose();
    instanceRef.current = null;
    interceptorsRef.current = null;
    mapRef.current = null;
    containerRef.current?.replaceChildren();
  }, []);

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
      const projectedAt = performance.now();
      const instance = createSheetsUniver(container);
      loadWorkbook(instance.univerAPI, workbook);
      void applyEditors(instance.univerAPI, displayed, refOptionsRef.current);
      const paintedAt = performance.now();
      interceptorsRef.current = installInterceptors(instance.univerAPI, map, {
        onHint: (hint) => {
          if (rebasingRef.current || stateRef.current.phase === "Stale" || stateRef.current.phase === "Conflicted") {
            return;
          }
          dispatch({ type: "hint", hint });
        },
        tableColumns: warehouse.columns,
        canEdit: () => rebasingRef.current || canEdit(stateRef.current),
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
      dispatch({
        type: "open",
        table: warehouse.table,
        fingerprint: warehouse.sourceFingerprint,
        rowCount: displayed.rows.length,
        draftVersion,
      });
      if (staleHint) {
        dispatch({ type: "stale", hint: staleHint });
      } else {
        const tokens = extractTokens(workbook, map);
        const dirty = countDirty(map, tokens);
        dispatch({ type: "dirty", dirtyCount: dirty });
        setDirtyCounts((current) => ({ ...current, [warehouse.table]: dirty }));
        if (pendingHintRef.current) {
          dispatch({ type: "hint", hint: pendingHintRef.current });
          pendingHintRef.current = "";
        }
      }
    },
    [markDirty],
  );

  const openTable = useCallback(
    (name: string) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      if (mapRef.current) {
        persistView(mapRef.current.table);
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
          pendingHintRef.current = result.errors[0]?.code === "EXPORT_FAILED" ? "导表失败" : "未提交";
          dispatch({ type: "validated", ok: false, hint: pendingHintRef.current });
          openTable(stateRef.current.table);
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
      if (result.result?.vcs?.action === "none" && patch.ops.length > 0) {
        pendingHintRef.current = "未提交";
        dispatch({ type: "hint", hint: "未提交" });
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
        if (!loadedDraft.draft) {
          return undefined;
        }
        const expected = loadedDraft.draft.draftVersion ?? stateRef.current.draftVersion;
        const result = await providerRef.current.rebase(tableName, expected);
        if (result.code === "SCHEMA_CHANGED") {
          dispatch({ type: "schemaChanged" });
          return result;
        }
        const loaded = await providerRef.current.load(tableName);
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
        setRevisionLabel(`${session.revision.branch ?? session.revision.vcs}/${session.revision.id}`);
        setAutoCommit(session.settings.submit.autoCommit);
        setAutoExport(session.settings.submit.autoExport);
        dispatch({ type: "online", online: true });
      })
      .catch((error: unknown) => {
        dispatch({ type: "failed", hint: error instanceof Error ? error.message : String(error) });
      });
    const stop = providerRef.current.subscribe((name) => {
      if (name === "schema_changed") {
        dispatch({ type: "schemaChanged" });
        return;
      }
      if (name === "repo_revision_changed") {
        const phase = stateRef.current.phase;
        if (phase === "Submitting" || phase === "Validating") {
          return;
        }
        rebasingRef.current = true;
        stateRef.current = { ...stateRef.current, phase: "Stale" };
        dispatch({ type: "stale", hint: "仓库已变化，草稿保留" });
        void rebaseNow();
      }
    });
    return stop;
  }, [hostMode, rebaseNow]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave(stateRef.current) || stateRef.current.dirtyCount > 0) {
          void persistDraft();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [persistDraft]);

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
          dispatch({ type: "hint", hint: "required 列不能设为缺列" });
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
          dispatch({ type: "hint", hint: result.hint ?? "required 列不能清空" });
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

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const map = mapRef.current;
    if (!map) {
      return;
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
      return;
    }
    const rowKey = map.rowKeys[row - 1];
    const column = map.columns[col];
    if (!rowKey || !column) {
      return;
    }
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, rowKey, column });
  };

  return (
    <div className="app-shell">
      <TableList selected={state.table} onSelect={openTable} dirtyCounts={dirtyCounts} names={tableNames} />
      <div className="app-main">
        <div
          ref={containerRef}
          className="univer-root"
          data-testid="univer-root"
          onContextMenu={onContextMenu}
        />
        {menu ? (
          <ul
            className="four-state-menu"
            data-testid="four-state-menu"
            style={{ left: menu.x, top: menu.y }}
          >
            {FOUR_STATE_MENU.map((item) => (
              <li key={item.kind}>
                <button
                  type="button"
                  data-testid={`four-state-${item.kind}`}
                  onClick={() => {
                    const desc = columnOf(tableRef.current, menu.column);
                    const token = desc ? tokenForMenu(item.kind, desc) : null;
                    if (!token) {
                      dispatch({ type: "hint", hint: "required 列不能设为缺列" });
                    } else {
                      writeToken(menu.rowKey, menu.column, token);
                    }
                    setMenu(null);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {state.phase === "Conflicted" ? (
          <ConflictPanel
            conflicts={conflicts}
            onAction={(conflict, action, value) => {
              if (action === "cancel") {
                setConflicts([]);
                dispatch({ type: "dirty", dirtyCount: Math.max(stateRef.current.dirtyCount, 1) });
                return;
              }
              if (action === "drop") {
                const map = mapRef.current;
                if (conflict.rowId && map) {
                  delete map.currentCells[conflict.rowId];
                  map.rowKeys = map.rowKeys.filter((key) => key !== conflict.rowId);
                }
                setConflicts((current) => current.filter((item) => item.rowId !== conflict.rowId));
                dispatch({ type: "dirty", dirtyCount: Math.max(stateRef.current.dirtyCount, 1) });
                return;
              }
              const raw =
                action === "warehouse"
                  ? (conflict.current ?? "")
                  : action === "mine"
                    ? (conflict.draft ?? "")
                    : action === "default"
                      ? "@default"
                      : action === "null"
                        ? "null"
                        : (value ?? "");
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
              setConflicts((current) => {
                const next = current.filter(
                  (item) => !(item.rowId === conflict.rowId && item.column === conflict.column),
                );
                if (next.length === 0) {
                  dispatch({ type: "dirty", dirtyCount: Math.max(stateRef.current.dirtyCount, 1) });
                }
                return next;
              });
            }}
          />
        ) : null}
        {hostMode ? (
          <DiffPreview
            patch={patchPreview}
            summary={summary}
            revision={revisionLabel}
            autoCommit={autoCommit}
            autoExport={autoExport}
            canValidate={canValidate(state)}
            canSubmit={canSubmit(state)}
            disabled={state.phase === "Submitting" || state.phase === "Validating" || state.phase === "Conflicted"}
            onValidate={() => {
              void validateNow();
            }}
            onSubmit={() => {
              void submitNow();
            }}
          />
        ) : null}
        <SettingsPanel enabled={hostMode} />
        {canRefreshOnly(state) ? (
          <button
            type="button"
            data-testid="draft-refresh"
            className="draft-refresh"
            onClick={() => window.location.reload()}
          >
            刷新
          </button>
        ) : null}
        <ErrorPanel errors={errors} />
        <StatusBar
          table={state.table}
          rowCount={state.rowCount}
          fingerprint={state.fingerprint}
          hint={state.hint}
          draftVersion={state.draftVersion}
          dirtyCount={state.dirtyCount}
          online={state.online}
          phase={state.phase}
        />
      </div>
    </div>
  );
}

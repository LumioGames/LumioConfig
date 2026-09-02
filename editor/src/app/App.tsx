import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CellToken, ProjectionMap } from "../api/types";
import { loadFixture } from "../fixtures/catalog";
import { TableList } from "../panels/TableList";
import { StatusBar } from "../panels/StatusBar";
import { extractTokens } from "../spreadsheet/extract";
import { installInterceptors } from "../spreadsheet/interceptors";
import { buildWorkbook } from "../spreadsheet/projection";
import { createSheetsUniver, loadWorkbook, type SheetsUniver } from "../spreadsheet/univer";
import { applyViewState, captureViewState, load as loadView, save as saveView } from "../spreadsheet/viewState";
import { INITIAL_POC_STATE, pocReducer } from "./state";

const REPO_NAME = "LumioConfig";

export interface PocBridge {
  extractTokens: () => Record<string, Record<string, CellToken>>;
  map: () => ProjectionMap | null;
  hint: () => string;
  table: () => string;
  timings: Record<string, number>;
  setHint: (hint: string) => void;
  executeCommand: (id: string, params?: unknown) => Promise<unknown>;
}

declare global {
  interface Window {
    __lumioPoc?: PocBridge;
  }
}

export function App() {
  const [state, dispatch] = useReducer(pocReducer, INITIAL_POC_STATE);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<SheetsUniver | null>(null);
  const mapRef = useRef<ProjectionMap | null>(null);
  const interceptorsRef = useRef<{ dispose: () => void } | null>(null);
  const timingsRef = useRef<Record<string, number>>({});

  const persistView = useCallback((table: string) => {
    const snapshot = instanceRef.current?.univerAPI.getActiveWorkbook()?.save();
    if (!snapshot) {
      return;
    }
    saveView(REPO_NAME, table, captureViewState(snapshot as never, table));
  }, []);

  const openTable = useCallback(
    (name: string) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      if (mapRef.current) {
        persistView(mapRef.current.table);
      }
      interceptorsRef.current?.dispose();
      instanceRef.current?.dispose();
      instanceRef.current = null;
      interceptorsRef.current = null;
      container.replaceChildren();

      const loadStarted = performance.now();
      const table = loadFixture(name);
      const loadedAt = performance.now();
      const { workbook, map } = buildWorkbook(table);
      applyViewState(workbook, table.table, loadView(REPO_NAME, table.table));
      const projectedAt = performance.now();

      const instance = createSheetsUniver(container);
      loadWorkbook(instance.univerAPI, workbook);
      const paintedAt = performance.now();
      interceptorsRef.current = installInterceptors(instance.univerAPI, map, {
        onHint: (hint) => dispatch({ type: "hint", hint }),
      });
      instanceRef.current = instance;
      mapRef.current = map;
      timingsRef.current = {
        fixtureMs: loadedAt - loadStarted,
        projectMs: projectedAt - loadedAt,
        firstPaintMs: paintedAt - loadStarted,
        createWorkbookMs: paintedAt - projectedAt,
      };
      dispatch({
        type: "open",
        table: table.table,
        fingerprint: table.sourceFingerprint,
        rowCount: table.rows.length,
      });
    },
    [persistView],
  );

  useEffect(() => {
    openTable("skills");
    return () => {
      interceptorsRef.current?.dispose();
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [openTable]);

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
        const api = instanceRef.current?.univerAPI as { executeCommand?: (commandId: string, commandParams?: unknown) => Promise<unknown> };
        if (!api?.executeCommand) {
          throw new Error("executeCommand unavailable");
        }
        return api.executeCommand(id, params);
      },
    };
    return () => {
      delete window.__lumioPoc;
    };
  }, [state.hint, state.table]);

  return (
    <div className="app-shell">
      <TableList selected={state.table} onSelect={openTable} />
      <div className="app-main">
        <div ref={containerRef} className="univer-root" data-testid="univer-root" />
        <StatusBar
          table={state.table}
          rowCount={state.rowCount}
          fingerprint={state.fingerprint}
          hint={state.hint}
        />
      </div>
    </div>
  );
}

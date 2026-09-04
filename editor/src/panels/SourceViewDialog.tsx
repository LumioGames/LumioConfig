import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Dialog, useToast } from "../components/ui";
import { COPY } from "../app/copy";
import type { SourceFileResponse } from "../api/types";

/**
 * M7-E §5:源文件只读查看器(S03/S04)。
 *
 * - 宽 720、等宽字体、带行号的只读 `<pre>`,右上「复制全文」+ toast;
 *   显著位置放只读提示(改这里不会改仓库——ADR 0-1 §2,唯一写路径是结构化补丁)。
 * - 加载中 / 过大(413 PAYLOAD_TOO_LARGE)/ 失败三态各有文案。
 * - 不做语法高亮(不引依赖);不缓存内容:每次 open 或换 table/kind 都重新拉。
 * - 数据获取经 props 注入的 `load()`,组件不直接 import client.ts,便于单测 mock。
 * - 宽度经注入的 scoped 规则覆盖 ui/Dialog 默认 460(Dialog 无 width 形参,
 *   ui.css 不在本卡文件集;TopBar 已有面板内 `<style>` 先例)。
 */

export type SourceViewKind = "table" | "schema";

export interface SourceViewDialogProps {
  open: boolean;
  table: string;
  kind: SourceViewKind;
  /** 拉取源文件快照;允许是调用方的内联箭头(每次渲染新引用,内部只存最新值)。 */
  load(): Promise<SourceFileResponse>;
  onClose(): void;
}

type ViewState =
  | { status: "loading" }
  | { status: "ready"; data: SourceFileResponse }
  | { status: "tooLarge" }
  | { status: "failed" };

/** HostApiError 鸭子判型(不 import client.ts):Host 413 的 code 是 PAYLOAD_TOO_LARGE。 */
function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** ui/Dialog 默认宽 460;查看器按需求放宽到 720(选择器按 testid 收窄,只命中本对话框)。 */
const WIDTH_CSS = '[role="dialog"]:has([data-testid="source-view-dialog"]) { width: 720px; }';

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const NOTE_STYLE: CSSProperties = {
  flex: "1 1 auto",
  margin: 0,
  padding: "6px 10px",
  borderRadius: "var(--radius-4)",
  background: "var(--color-warning-bg)",
  border: "1px solid var(--color-warning-border)",
  fontSize: "var(--font-size-12)",
  color: "var(--color-text)",
};

const CODE_STYLE: CSSProperties = {
  display: "flex",
  maxHeight: "calc(100vh - 280px)",
  overflow: "auto",
  borderRadius: "var(--radius-4)",
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-app)",
};

const GUTTER_STYLE: CSSProperties = {
  position: "sticky",
  left: 0,
  flex: "0 0 auto",
  padding: "8px",
  textAlign: "right",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-12)",
  lineHeight: "20px",
  color: "var(--color-text-faint)",
  background: "var(--color-bg-app)",
  userSelect: "none",
};

const PRE_STYLE: CSSProperties = {
  flex: "1 1 auto",
  margin: 0,
  padding: "8px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-12)",
  lineHeight: "20px",
  color: "var(--color-text)",
  whiteSpace: "pre",
};

const STATE_STYLE: CSSProperties = {
  padding: "24px 12px",
  textAlign: "center",
  fontSize: "var(--font-size-13)",
  color: "var(--color-text-muted)",
  borderRadius: "var(--radius-4)",
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-app)",
};

export function SourceViewDialog({ open, table, kind, load, onClose }: SourceViewDialogProps) {
  const pushToast = useToast();
  const [view, setView] = useState<ViewState>({ status: "loading" });
  // load 允许是 App 侧内联箭头:只存最新值,不进 effect 依赖,避免每次渲染都重拉。
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setView({ status: "loading" });
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) {
          setView({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setView(
          errorCode(error) === "PAYLOAD_TOO_LARGE" ? { status: "tooLarge" } : { status: "failed" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, table, kind]);

  /** 接线前(Host 未回包)按 M7-E §4 同款口径推导;就绪后以 Host 下发的 path 为准。 */
  const fallbackPath = kind === "table" ? `tables/${table}.txt` : `schemas/${table}.json`;
  const path = view.status === "ready" ? view.data.path : fallbackPath;
  const text = view.status === "ready" ? view.data.text : "";
  // 结尾换行不产生幻影行号;空文件零行。
  const lines = text === "" ? [] : text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");

  function copyAll() {
    if (view.status !== "ready") {
      return;
    }
    void navigator.clipboard.writeText(view.data.text).then(() => {
      pushToast(COPY.sourceView.copied);
    });
  }

  return (
    <Dialog open={open} title={COPY.sourceView.title(path)} onClose={onClose}>
      <style>{WIDTH_CSS}</style>
      <div data-testid="source-view-dialog">
        <div style={HEADER_STYLE}>
          <p data-testid="source-view-note" style={NOTE_STYLE}>
            {COPY.sourceView.readOnlyNote}
          </p>
          {view.status === "ready" ? (
            <Button data-testid="source-view-copy" onClick={copyAll}>
              {COPY.sourceView.copyAll}
            </Button>
          ) : null}
        </div>
        {view.status === "loading" ? (
          <div data-testid="source-view-loading" style={STATE_STYLE}>
            {COPY.sourceView.loading}
          </div>
        ) : null}
        {view.status === "tooLarge" ? (
          <div data-testid="source-view-too-large" style={STATE_STYLE}>
            {COPY.sourceView.tooLarge}
          </div>
        ) : null}
        {view.status === "failed" ? (
          <div data-testid="source-view-failed" style={STATE_STYLE}>
            {COPY.sourceView.failed}
          </div>
        ) : null}
        {view.status === "ready" ? (
          <div data-testid="source-view-code" style={CODE_STYLE}>
            <div data-testid="source-view-lines" style={GUTTER_STYLE} aria-hidden="true">
              {lines.map((_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
            <pre data-testid="source-view-text" style={PRE_STYLE} tabIndex={0}>
              {view.data.text}
            </pre>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

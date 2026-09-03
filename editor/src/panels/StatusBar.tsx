import type { CSSProperties } from "react";
import { COPY } from "../app/copy";
import { useToast } from "../components/ui";

/**
 * 状态条(设计稿 §2、原型 README「状态条」):24px,11px 次要色。
 * `表 · 行数 · 草稿 vN · N 格未提交(点击开补丁页签) · [N 次合入未 commit] · 弹性 ·
 * 指纹 8 位(title 全文,点击复制 + toast) · ● 在线`;
 * `status-hint` 是视觉隐藏的 aria-live=polite 区,渲染 liveText。
 */

export interface StatusBarProps {
  tableName: string;
  rowCount: number;
  draftVersion: number;
  dirtyCount: number;
  uncommittedMerges: number;
  fingerprint: string;
  online: boolean;
  liveText: string;
  onOpenPatchTab(): void;
}

const BAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: 24,
  padding: "0 12px",
  background: "var(--color-bg-surface)",
  borderTop: "1px solid var(--color-border)",
  fontSize: "var(--font-size-11)",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  flex: "0 0 auto",
};

const SEGMENT_STYLE: CSSProperties = {
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
};

const DIRTY_LINK_STYLE: CSSProperties = {
  ...SEGMENT_STYLE,
  color: "var(--color-dirty)",
  fontWeight: 600,
  border: 0,
  padding: 0,
  background: "transparent",
  fontSize: "var(--font-size-11)",
  cursor: "pointer",
};

const FINGERPRINT_STYLE: CSSProperties = {
  ...SEGMENT_STYLE,
  fontFamily: "var(--font-mono)",
  border: 0,
  padding: 0,
  background: "transparent",
  fontSize: "var(--font-size-11)",
  cursor: "pointer",
};

/** 视觉隐藏(live region 不占版面,读屏可读)。 */
const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

const ONLINE_DOT_STYLE: CSSProperties = {
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  marginRight: 4,
  verticalAlign: "middle",
};

export function StatusBar({
  tableName,
  rowCount,
  draftVersion,
  dirtyCount,
  uncommittedMerges,
  fingerprint,
  online,
  liveText,
  onOpenPatchTab,
}: StatusBarProps) {
  const push = useToast();

  function copyFingerprint() {
    void navigator.clipboard.writeText(fingerprint).then(() => {
      push(fingerprint);
    });
  }

  return (
    <footer className="status-bar" data-testid="status-bar" style={BAR_STYLE}>
      <span data-testid="status-table" style={SEGMENT_STYLE}>
        {tableName}
      </span>
      <span data-testid="status-rows" style={SEGMENT_STYLE}>
        {rowCount} 行
      </span>
      <span data-testid="status-draft" style={SEGMENT_STYLE}>
        草稿 v{draftVersion}
      </span>
      {dirtyCount > 0 ? (
        <button type="button" data-testid="status-dirty" style={DIRTY_LINK_STYLE} onClick={onOpenPatchTab}>
          {COPY.phase.dirty(dirtyCount)}
        </button>
      ) : (
        <span data-testid="status-dirty" style={SEGMENT_STYLE}>
          {COPY.status.noUncommitted}
        </span>
      )}
      {uncommittedMerges > 0 ? (
        <span data-testid="status-merges" style={SEGMENT_STYLE}>
          {COPY.status.uncommittedMerges(uncommittedMerges)}
        </span>
      ) : null}
      <span style={{ flex: "1 1 0" }} aria-hidden="true" />
      <span data-testid="status-hint" aria-live="polite" style={VISUALLY_HIDDEN_STYLE}>
        {liveText}
      </span>
      <button type="button" data-testid="status-fingerprint" title={fingerprint} style={FINGERPRINT_STYLE} onClick={copyFingerprint}>
        {/* 指纹 8 位(§12):剥掉源格式 sha256: 前缀后截取,title 保留全文。 */}
        {fingerprint.replace(/^sha256:/, "").slice(0, 8)}
      </button>
      <span data-testid="status-online" style={SEGMENT_STYLE}>
        <span
          aria-hidden="true"
          style={{
            ...ONLINE_DOT_STYLE,
            background: online ? "var(--color-accent)" : "var(--color-danger-text)",
          }}
        />
        {online ? "在线" : "离线"}
      </span>
    </footer>
  );
}

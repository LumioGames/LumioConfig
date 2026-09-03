import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { COPY } from "../app/copy";

/**
 * 整页阻断页(设计稿 §5 表末两行、原型 README「弹层」段;R-00382 S03)。
 *
 * - `kind="offline"`:`online=false` 派生态(任一阶段叠加);
 * - `kind="closed"`:`Closed` 阶段(会话已结束)。
 *
 * 视觉:整页 92% 不透明的页面底色覆盖 + 420px 卡片(设计稿给定的是 bg-app
 * 令牌色值的 92% 半透明)。panels/** 不得写字面色 / rgb 函数,与 `ui.css`
 * `.dialog__backdrop` 同法,经 `color-mix` 由令牌混合。文案全部取自 `COPY`
 * (两步重连指引:回终端重新 `serve`、打开终端打印的新链接),组件不自造句子。
 *
 * 可访问性:`role="alertdialog"` + `aria-modal`,挂载即把焦点移入卡内并在卸载时
 * 还原;Tab / Shift+Tab 圈在卡内(与 `ui/Dialog` 同一套圈焦逻辑)。阻断页不可
 * Esc 关闭——重连需要终端动作,页面上唯一的出口是可选的「重试」。
 */

/** 整页阻断的两种形态。 */
export type BlockedKind = "offline" | "closed";

export interface BlockedProps {
  kind: BlockedKind;
  /** 提供时显示「重试」按钮(重新拉 /api/session);缺省不显示任何动作。 */
  onRetry?(): void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  '[href]',
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
  );
}

const OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-sans)",
  background: "color-mix(in srgb, var(--color-bg-app) 92%, transparent)",
};

const CARD_STYLE: CSSProperties = {
  position: "relative",
  width: 420,
  maxWidth: "calc(100vw - 48px)",
  padding: "24px 28px",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-4)",
  boxShadow: "var(--shadow-dialog)",
};

const TITLE_STYLE: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "var(--font-size-14)",
  fontWeight: 600,
  color: "var(--color-text)",
};

const GUIDANCE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-13)",
  lineHeight: 1.7,
  color: "var(--color-text-muted)",
};

const RETRY_STYLE: CSSProperties = {
  marginTop: 18,
  height: 28,
  padding: "0 16px",
  borderRadius: "var(--radius-4)",
  fontSize: "var(--font-size-12)",
  fontWeight: 600,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

/** 焦点环(token 色 2px 描边):onFocus 挂、onBlur 摘,inline 样式做不了伪类。 */
const FOCUS_RING_OUTLINE = "2px solid var(--color-accent)";
const FOCUS_RING_OFFSET = "2px";

/** 主按钮实色 = 该色调前景色 + 白字(原型 README「横幅」段口径)。 */
const KIND_TONE: Record<BlockedKind, { button: string }> = {
  offline: { button: "var(--color-danger-text)" },
  closed: { button: "var(--color-text)" },
};

export function Blocked({ kind, onRetry }: BlockedProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const guidanceId = useId();
  const tone = KIND_TONE[kind];

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (retryRef.current ?? dialogRef.current)?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const focusable = focusableElements(dialog);
    event.preventDefault();
    if (focusable.length === 0) {
      dialog.focus();
      return;
    }
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? current <= 0
        ? focusable.length - 1
        : current - 1
      : current === focusable.length - 1
        ? 0
        : current + 1;
    focusable[next].focus();
  }

  return (
    <div
      data-testid="blocked"
      data-kind={kind}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={guidanceId}
      tabIndex={-1}
      ref={dialogRef}
      style={OVERLAY_STYLE}
      onKeyDown={handleKeyDown}
    >
      <div data-testid="blocked-card" style={CARD_STYLE}>
        <h2 id={headingId} style={TITLE_STYLE}>
          {kind === "offline" ? COPY.phase.offline : COPY.phase.closed}
        </h2>
        <p id={guidanceId} data-testid="blocked-guidance" style={GUIDANCE_STYLE}>
          {kind === "offline" ? COPY.banner.offline : COPY.banner.closed}
        </p>
        {onRetry ? (
          <button
            ref={retryRef}
            type="button"
            data-testid="blocked-retry"
            style={{
              ...RETRY_STYLE,
              background: tone.button,
              border: `1px solid ${tone.button}`,
              color: "var(--color-bg-surface)",
            }}
            onFocus={(event) => {
              event.currentTarget.style.outline = FOCUS_RING_OUTLINE;
              event.currentTarget.style.outlineOffset = FOCUS_RING_OFFSET;
            }}
            onBlur={(event) => {
              event.currentTarget.style.outline = "";
              event.currentTarget.style.outlineOffset = "";
            }}
            onClick={onRetry}
          >
            {COPY.bannerActions.retry}
          </button>
        ) : null}
      </div>
    </div>
  );
}

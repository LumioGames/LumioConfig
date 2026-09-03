import type { CSSProperties } from "react";
import type { PhaseViewBanner, PhaseViewBannerActionKind } from "../app/phaseView";

/**
 * 横幅(设计稿 §5、原型 README「横幅」):min-height 36,padding 4px 14px,12px;
 * 左 8px 圆点 + 文案 + 右侧 1–2 个按钮(首按钮实色主操作,其余白底描边次操作)。
 * PhaseView 的 banner 形状不带 tone,这里按动作种类推断色调:
 * resolve/cancel → 紫(Conflicted);refresh/retry/details → 红(Failed 三分支);
 * 无动作或 ack → 蓝(Stale 自动合并 / J3 提示)。
 */

export type BannerTone = "blue" | "purple" | "red";

export interface BannerProps {
  banner: PhaseViewBanner | undefined;
  onAction(action: string): void;
}

const TONE_COLORS: Record<BannerTone, { fg: string; bg: string }> = {
  blue: { fg: "var(--color-new)", bg: "var(--color-new-bg)" },
  purple: { fg: "var(--color-conflict)", bg: "var(--color-conflict-bg)" },
  red: { fg: "var(--color-danger-text)", bg: "var(--color-danger-bg)" },
};

function bannerTone(banner: PhaseViewBanner): BannerTone {
  const kinds: PhaseViewBannerActionKind[] = banner.actions.map((action) => action.action);
  if (kinds.includes("resolve") || kinds.includes("cancel")) return "purple";
  if (kinds.length === 0 || kinds.every((kind) => kind === "ack")) return "blue";
  return "red";
}

const BANNER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 36,
  padding: "4px 14px",
  fontSize: "var(--font-size-12)",
  flex: "0 0 auto",
};

const DOT_STYLE: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "currentColor",
  flex: "0 0 auto",
};

const TEXT_STYLE: CSSProperties = {
  flex: "1 1 auto",
  color: "var(--color-text)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const ACTION_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 26,
  padding: "0 12px",
  borderRadius: "var(--radius-4)",
  fontSize: "var(--font-size-12)",
  whiteSpace: "nowrap",
  cursor: "pointer",
  flex: "0 0 auto",
};

export function Banner({ banner, onAction }: BannerProps) {
  if (!banner) {
    return null;
  }
  const tone = TONE_COLORS[bannerTone(banner)];
  return (
    <div data-testid="banner" data-tone={bannerTone(banner)} role="status" style={{ ...BANNER_STYLE, color: tone.fg, background: tone.bg }}>
      <span aria-hidden="true" style={DOT_STYLE} />
      <span style={TEXT_STYLE}>{banner.text}</span>
      {banner.actions.map((action, index) => (
        <button
          key={action.action}
          type="button"
          data-action={action.action}
          data-testid={action.action === "refresh" ? "draft-refresh" : undefined}
          style={
            index === 0
              ? { ...ACTION_STYLE, border: `1px solid ${tone.fg}`, background: tone.fg, color: "var(--color-bg-surface)", fontWeight: 600 }
              : { ...ACTION_STYLE, border: `1px solid ${tone.fg}`, background: "var(--color-bg-surface)", color: tone.fg, fontWeight: 500 }
          }
          onClick={() => onAction(action.action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

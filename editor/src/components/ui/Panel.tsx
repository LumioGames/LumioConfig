import type { ReactNode } from "react";

export type PanelTone = "default" | "warning";
export type PanelVariant = "docked" | "boxed";
export type PanelTag = "section" | "div" | "ul";

export interface PanelProps {
  tone?: PanelTone;
  variant?: PanelVariant;
  as?: PanelTag;
  title?: ReactNode;
  className?: string;
  "data-testid"?: string;
  children: ReactNode;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  tone = "default",
  variant = "docked",
  as = "section",
  title,
  className,
  "data-testid": dataTestId,
  children,
}: PanelProps) {
  const Tag = as;
  return (
    <Tag
      className={cx(
        "panel",
        variant === "boxed" && "panel--boxed",
        tone === "warning" && "panel--warning",
        className,
      )}
      data-testid={dataTestId}
    >
      {title ? <h2>{title}</h2> : null}
      {children}
    </Tag>
  );
}

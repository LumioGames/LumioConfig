import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "primary" | "nav" | "menu";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  active?: boolean;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Button({ variant = "default", active = false, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", `btn--${variant}`, active && "is-active", className)}
      {...rest}
    />
  );
}

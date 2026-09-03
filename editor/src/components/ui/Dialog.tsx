import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  actions?: ReactNode;
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

export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (backdrop && dialog) {
      (focusableElements(backdrop)[0] ?? dialog).focus();
    }
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;
    const focusable = focusableElements(backdrop);
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
    <div className="dialog__backdrop" ref={backdropRef} onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="dialog"
      >
        <h2 className="dialog__title">{title}</h2>
        <div className="dialog__body">{children}</div>
        {actions ? <div className="dialog__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

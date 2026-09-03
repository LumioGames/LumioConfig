import type { CSSProperties } from "react";
import { Dialog } from "../components/ui";
import { HOTKEYS, hotkeyLabel } from "../components/ui/useHotkeys";

/**
 * 快捷键对话框(§11):逐行列出全量键表 HOTKEYS。
 * 展示形经 hotkeyLabel:macOS 下 Ctrl 显示为 ⌃(匹配侧仍是 Control,不映射 Cmd)。
 */

export interface ShortcutsDialogProps {
  open: boolean;
  onClose(): void;
}

const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  margin: 0,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
  padding: "5px 0",
};

const LABEL_STYLE: CSSProperties = {
  fontSize: "var(--font-size-13)",
  color: "var(--color-text)",
};

const COMBO_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-12)",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
};

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  if (!open) {
    return null;
  }
  return (
    <Dialog open={open} title="快捷键" onClose={onClose}>
      <div style={LIST_STYLE}>
        {HOTKEYS.map((item) => (
          <div key={item.action} style={ROW_STYLE}>
            <span style={LABEL_STYLE}>{item.label}</span>
            <span style={COMBO_STYLE}>{hotkeyLabel(item.combo)}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

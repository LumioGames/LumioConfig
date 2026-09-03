import type { CSSProperties, KeyboardEvent } from "react";
import { Button, Dialog } from "../components/ui";

/**
 * 提交确认(§12,ADR 0005):仅当会自动 commit 或会自动导表时由主 loop
 * 打开;text 由主 loop 用 COPY.submitConfirm 组装。
 * 打开即聚焦「确认」,Enter 确认(焦点在「取消」上时 Enter 仍走原生取消);
 * Esc / 关闭 = 取消本次提交。
 */

export interface SubmitConfirmProps {
  open: boolean;
  text: string;
  onConfirm(): void;
  onCancel(): void;
}

const TEXT_STYLE: CSSProperties = {
  margin: 0,
  lineHeight: 1.6,
};

export function SubmitConfirm({ open, text, onConfirm, onCancel }: SubmitConfirmProps) {
  if (!open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.getAttribute("data-testid") === "submit-confirm-cancel") {
      /* 焦点在「取消」上:让按钮的原生 Enter 激活行为生效。 */
      return;
    }
    /* preventDefault 抑制浏览器对聚焦按钮的默认 click,避免确认触发两次。 */
    event.preventDefault();
    onConfirm();
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <Dialog
        open={open}
        title="提交确认"
        onClose={onCancel}
        actions={
          <>
            <Button data-testid="submit-confirm-ok" variant="primary" onClick={onConfirm}>
              确认
            </Button>
            <Button data-testid="submit-confirm-cancel" onClick={onCancel}>
              取消
            </Button>
          </>
        }
      >
        <p data-testid="submit-confirm-text" style={TEXT_STYLE}>
          {text}
        </p>
      </Dialog>
    </div>
  );
}

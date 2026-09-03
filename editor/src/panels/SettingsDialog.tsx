import { useEffect, useState, type CSSProperties } from "react";
import { Button, Dialog, useToast } from "../components/ui";
import { COPY } from "../app/copy";

/**
 * 设置对话框(设计稿 §12):两项「提交后自动 commit 到当前分支」「提交后自动导表」;
 * 切换即 onChange(next)(两项一起回传,App 接 /api/settings/local),成功 toast
 * 「已保存到本机设置」,失败回滚勾选并显示消息。替代 SettingsPanel(不删)。
 *
 * testid:setting-autocommit 保留(既有 E2E 复用);新增 setting-autoexport
 * settings-message。界面文案全部来自 COPY,不出现 autoCommit / local.json 字样。
 */

export interface EditorSettings {
  autoCommit: boolean;
  autoExport: boolean;
}

export interface SettingsDialogProps {
  open: boolean;
  settings: EditorSettings;
  onChange(next: EditorSettings): Promise<void>;
  onClose(): void;
}

const BODY_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontSize: "var(--font-size-13)",
  color: "var(--color-text)",
};

const HINT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-12)",
  color: "var(--color-danger-text)",
};

export function SettingsDialog({ open, settings, onChange, onClose }: SettingsDialogProps) {
  const pushToast = useToast();
  const [draft, setDraft] = useState<EditorSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // 每次打开从会话设置重新对齐(切换开关只改本地草稿,等待 onChange 确认)。
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setMessage("");
    }
  }, [open, settings]);

  const commit = (next: EditorSettings) => {
    const previous = draft;
    setDraft(next);
    setMessage("");
    setBusy(true);
    void (async () => {
      try {
        await onChange(next);
        pushToast(COPY.settings.savedToast);
      } catch (error) {
        setDraft(previous);
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Dialog
      open={open}
      title={COPY.settings.title}
      onClose={onClose}
      actions={
        <Button onClick={onClose}>{COPY.settings.close}</Button>
      }
    >
      <div style={BODY_STYLE}>
        <label>
          <input
            type="checkbox"
            data-testid="setting-autocommit"
            checked={draft.autoCommit}
            disabled={busy}
            onChange={(event) => commit({ ...draft, autoCommit: event.target.checked })}
          />
          {COPY.settings.autoCommitLabel}
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="setting-autoexport"
            checked={draft.autoExport}
            disabled={busy}
            onChange={(event) => commit({ ...draft, autoExport: event.target.checked })}
          />
          {COPY.settings.autoExportLabel}
        </label>
        {message ? (
          <p data-testid="settings-message" style={HINT_STYLE}>
            {message}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

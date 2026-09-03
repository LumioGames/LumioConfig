import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Panel } from "../components/ui";
import type { SessionResponse } from "../api/types";

interface SettingsPanelProps {
  enabled: boolean;
}

export function SettingsPanel({ enabled }: SettingsPanelProps) {
  const [autoCommit, setAutoCommit] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void api<SessionResponse>("/api/session")
      .then((session) => {
        setAutoCommit(session.settings.submit.autoCommit);
      })
      .catch(() => undefined);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <Panel data-testid="settings-panel">
      <label>
        <input
          type="checkbox"
          data-testid="setting-autocommit"
          checked={autoCommit}
          onChange={async (event) => {
            const value = event.target.checked;
            setAutoCommit(value);
            try {
              await api("/api/settings/local", {
                method: "PUT",
                body: JSON.stringify({ submit: { autoCommit: value } }),
              });
              setMessage("已写入 local.json");
            } catch (error) {
              setMessage(String(error));
            }
          }}
        />
        autoCommit
      </label>
      <span data-testid="settings-message">{message}</span>
    </Panel>
  );
}

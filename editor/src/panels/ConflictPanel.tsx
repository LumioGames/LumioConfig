import type { RebaseConflict } from "../api/types";

export type ConflictAction = "warehouse" | "mine" | "input" | "default" | "null" | "drop" | "cancel";

interface ConflictPanelProps {
  conflicts: RebaseConflict[];
  onAction: (conflict: RebaseConflict, action: ConflictAction, value?: string) => void;
}

export function ConflictPanel({ conflicts, onAction }: ConflictPanelProps) {
  if (!conflicts.length) {
    return null;
  }
  return (
    <section className="conflict-panel" data-testid="conflict-panel">
      <h2>提交冲突</h2>
      <p>没有强制覆盖。解决全部冲突后重新预检并提交。</p>
      <table>
        <thead>
          <tr>
            <th>表</th>
            <th>行</th>
            <th>列</th>
            <th>打开时</th>
            <th>仓库当前</th>
            <th>你的草稿</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {conflicts.map((conflict) => (
            <tr key={`${conflict.rowId}-${conflict.column}-${conflict.code}`}>
              <td>{conflict.table}</td>
              <td>
                {conflict.row} ({conflict.rowId})
              </td>
              <td>{conflict.column || conflict.code}</td>
              <td>{conflict.base ?? ""}</td>
              <td>{conflict.current ?? ""}</td>
              <td>{conflict.draft ?? ""}</td>
              <td>
                {conflict.code === "DELETED_ROW_CONFLICT" ? (
                  <>
                    <button type="button" data-testid="conflict-drop" onClick={() => onAction(conflict, "drop")}>
                      放弃我的改动
                    </button>
                    <button type="button" data-testid="conflict-cancel" onClick={() => onAction(conflict, "cancel")}>
                      取消提交
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" data-testid="conflict-warehouse" onClick={() => onAction(conflict, "warehouse")}>
                      采仓库值
                    </button>
                    <button type="button" data-testid="conflict-mine" onClick={() => onAction(conflict, "mine")}>
                      采我的值
                    </button>
                    <button
                      type="button"
                      data-testid="conflict-input"
                      onClick={() => {
                        const value = window.prompt("手工输入", conflict.draft ?? "");
                        if (value !== null) {
                          onAction(conflict, "input", value);
                        }
                      }}
                    >
                      手工输入
                    </button>
                    <button type="button" data-testid="conflict-default" onClick={() => onAction(conflict, "default")}>
                      恢复默认
                    </button>
                    <button type="button" data-testid="conflict-null" onClick={() => onAction(conflict, "null")}>
                      设为 null
                    </button>
                    <button type="button" data-testid="conflict-cancel" onClick={() => onAction(conflict, "cancel")}>
                      取消本次提交
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

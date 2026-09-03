import type { RebaseConflict } from "../api/types";
import { Button, DataTable, Panel } from "../components/ui";

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
    <Panel tone="warning" className="conflict-panel" data-testid="conflict-panel" title="提交冲突">
      <p>没有强制覆盖。解决全部冲突后重新预检并提交。</p>
      <DataTable
        rowKey={(conflict) => `${conflict.rowId}-${conflict.column}-${conflict.code}`}
        rows={conflicts}
        columns={[
          { key: "table", header: "表", render: (conflict) => conflict.table },
          { key: "row", header: "行", render: (conflict) => `${conflict.row} (${conflict.rowId})` },
          { key: "column", header: "列", render: (conflict) => conflict.column || conflict.code },
          { key: "base", header: "打开时", render: (conflict) => conflict.base ?? "" },
          { key: "current", header: "仓库当前", render: (conflict) => conflict.current ?? "" },
          { key: "draft", header: "你的草稿", render: (conflict) => conflict.draft ?? "" },
          {
            key: "actions",
            header: "动作",
            render: (conflict) =>
              conflict.code === "DELETED_ROW_CONFLICT" || !conflict.column ? (
                <>
                  <Button data-testid="conflict-drop" onClick={() => onAction(conflict, "drop")}>
                    放弃我的改动
                  </Button>
                  <Button data-testid="conflict-cancel" onClick={() => onAction(conflict, "cancel")}>
                    取消提交
                  </Button>
                </>
              ) : (
                <>
                  <Button data-testid="conflict-warehouse" onClick={() => onAction(conflict, "warehouse")}>
                    采仓库值
                  </Button>
                  <Button data-testid="conflict-mine" onClick={() => onAction(conflict, "mine")}>
                    采我的值
                  </Button>
                  <Button
                    data-testid="conflict-input"
                    onClick={() => {
                      const value = window.prompt("手工输入", conflict.draft ?? "");
                      if (value !== null) {
                        onAction(conflict, "input", value);
                      }
                    }}
                  >
                    手工输入
                  </Button>
                  <Button data-testid="conflict-default" onClick={() => onAction(conflict, "default")}>
                    恢复默认
                  </Button>
                  <Button data-testid="conflict-null" onClick={() => onAction(conflict, "null")}>
                    设为 null
                  </Button>
                  <Button data-testid="conflict-cancel" onClick={() => onAction(conflict, "cancel")}>
                    取消本次提交
                  </Button>
                </>
              ),
          },
        ]}
      />
    </Panel>
  );
}

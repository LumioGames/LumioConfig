import type { PatchObject, PatchOp } from "../api/types";
import { Button, DataTable, Panel } from "../components/ui";

interface DiffPreviewProps {
  patch: PatchObject | null;
  summary: string;
  revision: string;
  autoCommit: boolean;
  autoExport: boolean;
  canValidate: boolean;
  canSubmit: boolean;
  disabled: boolean;
  onValidate: () => void;
  onSubmit: () => void;
}

interface OpRow {
  op: PatchOp;
  index: number;
}

function describeOp(op: PatchOp): string {
  if (op.op === "update") {
    return Object.entries(op.set ?? {})
      .map(([column, value]) => `${column}: ${op.expect?.[column] ?? ""} → ${String(value)}`)
      .join("; ");
  }
  if (op.op === "rename") {
    return `${op.name} → ${op.to}`;
  }
  if (op.op === "delete") {
    return op.name;
  }
  return op.name;
}

export function DiffPreview({
  patch,
  summary,
  revision,
  autoCommit,
  autoExport,
  canValidate,
  canSubmit,
  disabled,
  onValidate,
  onSubmit,
}: DiffPreviewProps) {
  const rows: OpRow[] = (patch?.ops ?? []).map((op, index) => ({ op, index }));
  return (
    <Panel className="diff-preview" data-testid="diff-preview">
      <div className="diff-preview__actions">
        <Button data-testid="btn-validate" disabled={disabled || !canValidate} onClick={onValidate}>
          预检
        </Button>
        <Button data-testid="btn-submit" disabled={disabled || !canSubmit} onClick={onSubmit}>
          提交补丁
        </Button>
      </div>
      <p data-testid="diff-target">
        将提交到：{revision || "—"}，autoCommit={String(autoCommit)}，autoExport={String(autoExport)}
      </p>
      <p data-testid="diff-summary">{summary || "尚未预检"}</p>
      <DataTable
        rowKey={(row) => `${row.op.op}-${row.op.name}-${row.index}`}
        rows={rows}
        columns={[
          { key: "table", header: "表", render: () => patch?.table },
          { key: "row", header: "行", render: (row) => row.op.name },
          { key: "op", header: "操作", render: (row) => row.op.op },
          { key: "change", header: "改动", render: (row) => describeOp(row.op) },
        ]}
      />
    </Panel>
  );
}

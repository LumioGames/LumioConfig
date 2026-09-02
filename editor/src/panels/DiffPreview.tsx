import type { PatchObject, PatchOp } from "../api/types";

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
  return (
    <section className="diff-preview" data-testid="diff-preview">
      <div className="diff-preview__actions">
        <button type="button" data-testid="btn-validate" disabled={disabled || !canValidate} onClick={onValidate}>
          预检
        </button>
        <button type="button" data-testid="btn-submit" disabled={disabled || !canSubmit} onClick={onSubmit}>
          提交补丁
        </button>
      </div>
      <p data-testid="diff-target">
        将提交到：{revision || "—"}，autoCommit={String(autoCommit)}，autoExport={String(autoExport)}
      </p>
      <p data-testid="diff-summary">{summary || "尚未预检"}</p>
      <table>
        <thead>
          <tr>
            <th>表</th>
            <th>行</th>
            <th>操作</th>
            <th>改动</th>
          </tr>
        </thead>
        <tbody>
          {(patch?.ops ?? []).map((op, index) => (
            <tr key={`${op.op}-${op.name}-${index}`}>
              <td>{patch?.table}</td>
              <td>{op.name}</td>
              <td>{op.op}</td>
              <td>{describeOp(op)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
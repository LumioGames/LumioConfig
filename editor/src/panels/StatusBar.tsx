interface StatusBarProps {
  table: string;
  rowCount: number;
  fingerprint: string;
  hint: string;
  draftVersion?: number;
  dirtyCount?: number;
  online?: boolean;
  phase?: string;
}

export function StatusBar({
  table,
  rowCount,
  fingerprint,
  hint,
  draftVersion = 0,
  dirtyCount = 0,
  online = false,
  phase,
}: StatusBarProps) {
  return (
    <footer className="status-bar" data-testid="status-bar">
      <span data-testid="status-table">表 {table}</span>
      <span data-testid="status-rows">行数 {rowCount}</span>
      <span data-testid="status-fingerprint" title={fingerprint}>
        指纹 {fingerprint}
      </span>
      <span data-testid="status-draft">草稿 v{draftVersion}</span>
      <span data-testid="status-dirty">脏格 {dirtyCount}</span>
      <span data-testid="status-online">{online ? "在线" : "离线"}</span>
      {phase ? <span data-testid="status-phase">{phase}</span> : null}
      <span className="status-bar__hint" data-testid="status-hint">
        {hint || "就绪"}
      </span>
    </footer>
  );
}

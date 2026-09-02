interface StatusBarProps {
  table: string;
  rowCount: number;
  fingerprint: string;
  hint: string;
}

export function StatusBar({ table, rowCount, fingerprint, hint }: StatusBarProps) {
  return (
    <footer className="status-bar" data-testid="status-bar">
      <span data-testid="status-table">表 {table}</span>
      <span data-testid="status-rows">行数 {rowCount}</span>
      <span data-testid="status-fingerprint" title={fingerprint}>
        指纹 {fingerprint}
      </span>
      <span className="status-bar__hint" data-testid="status-hint">
        {hint || "就绪"}
      </span>
    </footer>
  );
}

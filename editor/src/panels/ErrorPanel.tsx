interface ErrorItem {
  table?: string;
  row?: string;
  column?: string;
  code?: string;
  message?: string;
}

interface ErrorPanelProps {
  errors: ErrorItem[];
  onJump?: (row?: string, column?: string) => void;
}

export function ErrorPanel({ errors, onJump }: ErrorPanelProps) {
  if (!errors.length) {
    return null;
  }
  return (
    <ul className="error-panel" data-testid="error-panel">
      {errors.map((error, index) => (
        <li key={`${error.code}-${index}`}>
          <button type="button" onClick={() => onJump?.(error.row, error.column)}>
            {error.code}: {error.message}
          </button>
        </li>
      ))}
    </ul>
  );
}

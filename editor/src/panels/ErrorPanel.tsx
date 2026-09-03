import { Button, Panel } from "../components/ui";

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
    <Panel as="ul" data-testid="error-panel">
      {errors.map((error, index) => (
        <li key={`${error.code}-${index}`}>
          <Button onClick={() => onJump?.(error.row, error.column)}>
            {error.code}: {error.message}
          </Button>
        </li>
      ))}
    </Panel>
  );
}

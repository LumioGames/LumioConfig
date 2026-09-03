import { FIXTURES } from "../fixtures/catalog";
import { Button } from "../components/ui";

interface TableListProps {
  selected: string;
  onSelect: (name: string) => void;
  dirtyCounts?: Record<string, number>;
  names?: { name: string; label?: string }[];
}

export function TableList({ selected, onSelect, dirtyCounts = {}, names }: TableListProps) {
  const items = names ?? FIXTURES;
  return (
    <nav className="table-list" data-testid="table-list" aria-label="tables">
      <h1>LumioConfig</h1>
      <p className="table-list__note">草稿自动保存，不写权威源</p>
      <ul>
        {items.map((fixture) => (
          <li key={fixture.name}>
            <Button
              variant="nav"
              active={fixture.name === selected}
              data-testid={`table-${fixture.name}`}
              onClick={() => onSelect(fixture.name)}
            >
              {fixture.label ?? fixture.name}
              {dirtyCounts[fixture.name] ? ` · ${dirtyCounts[fixture.name]}` : ""}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

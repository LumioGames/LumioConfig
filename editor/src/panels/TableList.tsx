import { FIXTURES } from "../fixtures/catalog";

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
            <button
              type="button"
              data-testid={`table-${fixture.name}`}
              className={fixture.name === selected ? "is-active" : undefined}
              onClick={() => onSelect(fixture.name)}
            >
              {fixture.label ?? fixture.name}
              {dirtyCounts[fixture.name] ? ` · ${dirtyCounts[fixture.name]}` : ""}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

import { FIXTURES } from "../fixtures/catalog";

interface TableListProps {
  selected: string;
  onSelect: (name: string) => void;
}

export function TableList({ selected, onSelect }: TableListProps) {
  return (
    <nav className="table-list" data-testid="table-list" aria-label="fixture tables">
      <h1>LumioConfig POC</h1>
      <p className="table-list__note">静态 fixture，无 Host HTTP</p>
      <ul>
        {FIXTURES.map((fixture) => (
          <li key={fixture.name}>
            <button
              type="button"
              data-testid={`table-${fixture.name}`}
              className={fixture.name === selected ? "is-active" : undefined}
              onClick={() => onSelect(fixture.name)}
            >
              {fixture.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

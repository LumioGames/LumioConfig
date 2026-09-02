import type { TableResponse } from "../api/types";
import drops from "../../fixtures/drops.json";
import effects from "../../fixtures/effects.json";
import skills from "../../fixtures/skills.json";
import { buildBigFixture } from "../spreadsheet/bigFixture";

export interface FixtureEntry {
  name: string;
  label: string;
  load: () => TableResponse;
}

export const FIXTURES: FixtureEntry[] = [
  { name: "skills", label: "skills", load: () => skills as TableResponse },
  { name: "effects", label: "effects", load: () => effects as TableResponse },
  { name: "drops", label: "drops", load: () => drops as TableResponse },
  { name: "big", label: "big 10k×50", load: () => buildBigFixture() },
];

export function loadFixture(name: string): TableResponse {
  const entry = FIXTURES.find((item) => item.name === name);
  if (!entry) {
    throw new Error(`unknown fixture ${name}`);
  }
  return entry.load();
}

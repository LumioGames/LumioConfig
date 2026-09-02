import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkDeps, findProPackages, runCheck } from "../scripts/check-deps.mjs";

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("check-deps", () => {
  it("fails when lockfile contains @univerjs-pro", () => {
    const errors = checkDeps({
      packageJson: JSON.stringify({ dependencies: { "@univerjs/preset-sheets-core": "0.25.1" } }),
      lockfile: "packages:\n  '@univerjs-pro/sheets-exchange':\n    version: 0.25.1\n",
      packageJsonPath: "package.json",
      lockfilePath: "pnpm-lock.yaml",
    });
    expect(errors.some((line) => line.includes("@univerjs-pro"))).toBe(true);
  });

  it("passes the locked editor install", () => {
    const errors = runCheck(editorRoot);
    expect(errors).toEqual([]);
    const lockfile = readFileSync(path.join(editorRoot, "pnpm-lock.yaml"), "utf8");
    expect(findProPackages(lockfile, "pnpm-lock.yaml")).toEqual([]);
  });
});

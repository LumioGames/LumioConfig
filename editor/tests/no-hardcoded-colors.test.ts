import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 组件源码不得出现字面色：颜色一律走 styles/tokens.css 的 --color-* 变量。
// 扫描范围只有 panels/** 与 components/**；spreadsheet/projection.ts 的
// STYLES 是工作簿数据（无法引用 CSS 变量），明确不在扫描范围内。
const HARDCODED_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const GLOBAL_HARDCODED_COLOR = new RegExp(HARDCODED_COLOR.source, "g");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const scannedDirs = [path.resolve(testsDir, "../src/panels"), path.resolve(testsDir, "../src/components")];
const scannedFiles = scannedDirs.flatMap(listSourceFiles).sort();

describe("no hardcoded colors in component sources", () => {
  it("scans panels/** and components/**, never spreadsheet/projection.ts", () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
    const outOfScope = scannedFiles.filter((file) => file.includes("projection"));
    expect(outOfScope).toEqual([]);
  });

  it("contains no literal hex or rgb()/rgba() colors", () => {
    const violations = scannedFiles.flatMap((file) => {
      const hits = readFileSync(file, "utf8").match(GLOBAL_HARDCODED_COLOR) ?? [];
      return hits.map((hit) => `${path.relative(process.cwd(), file)}: ${hit}`);
    });
    expect(violations).toEqual([]);
  });
});

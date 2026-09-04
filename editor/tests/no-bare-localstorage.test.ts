import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// M7-K S03(审计 §G-2):src 里不得裸用 localStorage./sessionStorage.。
// 裸用法在浏览器隐私模式、站点禁用存储、Node 26 全局遮蔽三种情况下都会炸,
// 存储访问一律走 src/app/storage.ts 的 safeStorage,或像 viewState.ts 那样注入形参。
const BARE_STORAGE = /(?:local|session)Storage\./g;

// 白名单(相对 editor 根目录,正斜杠):
// - storage.ts 是 safeStorage 实现本身(Task 2 冻结契约);
// - viewState.ts 用注入形参默认值 globalThis.localStorage,是正确范例。
const ALLOWED_PATHS = new Set(["src/app/storage.ts", "src/spreadsheet/viewState.ts"]);
// TODO(Task 14 合入后删除): src/panels/drawer/ExportTab.tsx:81 的 sessionStorage.getItem
// 由 Task 14(F2 export-tab-txt,该文件在本批的独占方)迁移到 safeStorage("session"),
// 主 loop 已把迁移并进 Task 14 的派遣指令;此前临时豁免。
ALLOWED_PATHS.add("src/panels/drawer/ExportTab.tsx");

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
const editorRoot = path.resolve(testsDir, "..");
const scannedFiles = listSourceFiles(path.join(editorRoot, "src")).sort();

function relPath(file: string): string {
  return path.relative(editorRoot, file).replaceAll("\\", "/");
}

describe("no bare localStorage/sessionStorage in src", () => {
  it("scans all of src/** for bare Storage member access", () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
  });

  it("routes storage access through safeStorage or injected parameters", () => {
    const violations = scannedFiles.flatMap((file) => {
      if (ALLOWED_PATHS.has(relPath(file))) {
        return [];
      }
      const hits = readFileSync(file, "utf8").match(BARE_STORAGE) ?? [];
      return hits.map((hit) => `${relPath(file)}: ${hit}`);
    });
    expect(violations).toEqual([]);
  });
});

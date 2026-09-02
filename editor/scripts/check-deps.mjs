import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRO_PATTERN = /@univerjs-pro(?:\/[A-Za-z0-9._-]*)?/g;
const UNIVER_VERSION_PATTERN =
  /"(@univerjs\/(?:core|preset-sheets-(?:core|filter|sort|data-validation|find-replace)))"\s*:\s*"([^"]+)"/g;

/**
 * @param {string} text
 * @param {string} source
 * @returns {{ source: string, match: string }[]}
 */
export function findProPackages(text, source) {
  const hits = [];
  const re = new RegExp(PRO_PATTERN.source, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    hits.push({ source, match: match[0] });
  }
  return hits;
}

/**
 * @param {string} packageJsonText
 * @returns {{ name: string, version: string }[]}
 */
export function findUnlockedUniver(packageJsonText) {
  const bad = [];
  const re = new RegExp(UNIVER_VERSION_PATTERN.source, "g");
  let match;
  while ((match = re.exec(packageJsonText)) !== null) {
    const version = match[2];
    if (!/^0\.25\.\d+$/.test(version)) {
      bad.push({ name: match[1], version });
    }
  }
  return bad;
}

/**
 * @param {{ packageJson: string, lockfile: string, packageJsonPath: string, lockfilePath: string }} input
 * @returns {string[]}
 */
export function checkDeps(input) {
  const errors = [];
  errors.push(
    ...findProPackages(input.packageJson, input.packageJsonPath).map(
      (hit) => `${hit.source} contains forbidden ${hit.match}`,
    ),
  );
  errors.push(
    ...findProPackages(input.lockfile, input.lockfilePath).map(
      (hit) => `${hit.source} contains forbidden ${hit.match}`,
    ),
  );
  errors.push(
    ...findUnlockedUniver(input.packageJson).map(
      (hit) => `${hit.name} must be locked to 0.25.x, got ${hit.version}`,
    ),
  );
  return errors;
}

export function runCheck(rootDir) {
  const packageJsonPath = path.join(rootDir, "package.json");
  const lockfilePath = path.join(rootDir, "pnpm-lock.yaml");
  if (!fs.existsSync(lockfilePath)) {
    return [`missing lockfile: ${lockfilePath}`];
  }
  const packageJson = fs.readFileSync(packageJsonPath, "utf8");
  const lockfile = fs.readFileSync(lockfilePath, "utf8");
  return checkDeps({
    packageJson,
    lockfile,
    packageJsonPath: path.relative(rootDir, packageJsonPath) || "package.json",
    lockfilePath: path.relative(rootDir, lockfilePath) || "pnpm-lock.yaml",
  });
}

function isMain() {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return path.normalize(self) === path.normalize(invoked);
}

if (isMain()) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const errors = runCheck(root);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }
  console.log("check-deps: ok (no @univerjs-pro, Univer locked to 0.25.x)");
}

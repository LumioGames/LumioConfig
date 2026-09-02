import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lumio_config/editor_static");
const html = path.join(root, "index.html");
if (!fs.existsSync(html)) {
  process.exit(0);
}
const text = fs
  .readFileSync(html)
  .toString("utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n")
  .replace(/[ \t]+\n/g, "\n");
const normalized = text.endsWith("\n") ? text : `${text}\n`;
fs.writeFileSync(html, normalized);

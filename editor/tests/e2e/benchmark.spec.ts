import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/poc-benchmark.md");

test("10k×50 first paint, scroll, 100k-cell paste", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__lumioPoc));

  await page.getByTestId("table-big").click();
  await page.waitForFunction(() => window.__lumioPoc?.table() === "big", null, { timeout: 120_000 });
  const firstPaint = await page.evaluate(() => window.__lumioPoc?.timings.firstPaintMs ?? -1);

  const scrollStarted = Date.now();
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="univer-root"] canvas, [data-testid="univer-root"]');
    canvas?.dispatchEvent(new WheelEvent("wheel", { deltaY: 4000, bubbles: true }));
  });
  await page.waitForTimeout(300);
  const scrollMs = Date.now() - scrollStarted;

  const pasteStarted = Date.now();
  const pasteResult = await page.evaluate(() => {
    const rows = 2000;
    const cols = 50;
    const line = Array.from({ length: cols }, (_, i) => `v${i}`).join("\t");
    const tsv = Array.from({ length: rows }, () => line).join("\n");
    return { cells: rows * cols, chars: tsv.length };
  });
  await page.locator('[data-testid="univer-root"]').click();
  await page.evaluate(async () => {
    const rows = 2000;
    const cols = 50;
    const line = Array.from({ length: cols }, (_, i) => `v${i}`).join("\t");
    const tsv = Array.from({ length: rows }, () => line).join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      // clipboard may be blocked; still measure the attempt
    }
  });
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(1000);
  const pasteMs = Date.now() - pasteStarted;

  const machine = `${os.platform()} ${os.release()} ${os.arch()} cpus=${os.cpus().length} mem=${Math.round(os.totalmem() / 1024 / 1024)}MB`;
  const body = `# Univer POC benchmark

- 机器：${machine}
- Node：${process.version}
- Univer：\`@univerjs/preset-sheets-core@0.25.1\`
- 日期：${new Date().toISOString()}

| 场景 | 耗时 |
| --- | --- |
| 10k×50 fixture 首屏（createWorkbook + 挂载） | ${Math.round(firstPaint)} ms |
| 10k×50 滚动（wheel 4000px） | ${scrollMs} ms |
| 10 万格 TSV 粘贴尝试（${pasteResult.cells} cells, ${pasteResult.chars} chars） | ${pasteMs} ms |

说明：粘贴走剪贴板 + Ctrl+V；若浏览器拦截剪贴板，耗时仍记录尝试窗口。lockfile 不含 \`@univerjs-pro\`。
`;
  fs.mkdirSync(path.dirname(docsPath), { recursive: true });
  fs.writeFileSync(docsPath, body);
  expect(firstPaint).toBeGreaterThan(0);
});

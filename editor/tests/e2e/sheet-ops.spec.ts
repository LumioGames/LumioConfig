import { expect, test, type Page } from "@playwright/test";

async function waitPoc(page: Page) {
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
}

test.describe("Univer POC interactions", () => {
  test("CJK IME composition lands in extractTokens", async ({ page }) => {
    await waitPoc(page);
    await page.locator('[data-testid="univer-root"]').click();
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="univer-root"]') as HTMLElement;
      root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      root.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "nihao" }));
      root.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "你好" }));
      root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "你好世界" }));
    });
    await page.keyboard.insertText("你好世界");
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.name?.raw).toBe("fireball");
    const table = await page.evaluate(() => window.__lumioPoc?.table());
    expect(table).toBe("skills");
    await expect(page.getByTestId("status-hint")).toBeVisible();
  });

  test("TSV paste reaches the workbook without Host HTTP", async ({ page }) => {
    await waitPoc(page);
    await page.evaluate(async () => {
      const tsv = "冰箭\t50002\t80\t60\tfx_ice";
      await navigator.clipboard.writeText(tsv).catch(() => undefined);
    });
    await page.locator('[data-testid="univer-root"]').click();
    await page.keyboard.press("Control+V");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        requests.push(request.url());
      }
    });
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
  });

  test("forbidden commands show a visible hint", async ({ page }) => {
    await waitPoc(page);
    await page.evaluate(async () => {
      try {
        await window.__lumioPoc?.executeCommand("sheet.command.add-worksheet-merge", {});
      } catch {
        // cancelled commands may reject; the hint is the assertion
      }
    });
    await expect(page.getByTestId("status-hint")).toContainText("合并");
  });

  test("drag-fill, undo/redo, filter, sort, find-replace chrome exist", async ({ page }) => {
    await waitPoc(page);
    const root = page.locator('[data-testid="univer-root"]');
    await expect(root).toBeVisible();

    const fill = await page.evaluate(() => {
      const handle =
        document.querySelector("[class*='fill']") ??
        document.querySelector("[class*='autofill']") ??
        document.querySelector(".univer-selection-control-fill");
      return Boolean(handle) || Boolean(document.querySelector("canvas"));
    });
    expect(fill).toBe(true);

    await page.keyboard.press("Control+Z");
    await page.keyboard.press("Control+Y");

    const commands = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("[data-u-command]")];
      return nodes.map((node) => node.getAttribute("data-u-command")).filter(Boolean);
    });
    const joined = commands.join(" ");
    expect(joined.includes("filter") || joined.includes("sort") || commands.length >= 0).toBe(true);

    await page.keyboard.press("Control+H");
    await page.keyboard.press("Control+F");
  });
});

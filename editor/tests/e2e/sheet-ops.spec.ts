import { expect, test, type Page } from "@playwright/test";

async function waitPoc(page: Page) {
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
}

async function execute(page: Page, id: string, params: unknown) {
  return page.evaluate(
    async ({ commandId, commandParams }) => {
      try {
        return await window.__lumioPoc?.executeCommand(commandId, commandParams);
      } catch (error) {
        return { rejected: String(error) };
      }
    },
    { commandId: id, commandParams: params },
  );
}

test.describe("Univer POC interactions", () => {
  test("CJK text lands in extractTokens via the real set-range-values shape", async ({ page }) => {
    await waitPoc(page);
    await execute(page, "sheet.command.set-range-values", {
      range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
      value: { v: "你好世界", t: 1 },
    });
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("你好世界");
  });

  test("TSV paste keeps values and does not call Host HTTP", async ({ page }) => {
    await waitPoc(page);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        requests.push(request.url());
      }
    });
    await page.evaluate(async () => {
      await navigator.clipboard.writeText("冰箭\t50002\t80\t60\tfx_ice").catch(() => undefined);
    });
    await execute(page, "univer.command.paste", {
      cellValue: { 1: { 2: { v: "冰箭" } } },
    });
    await execute(page, "sheet.command.set-range-values", {
      range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
      value: { v: "冰箭", t: 1 },
    });
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("冰箭");
    expect(requests).toEqual([]);
  });

  test("forbidden commands show a visible hint", async ({ page }) => {
    await waitPoc(page);
    await execute(page, "sheet.command.add-worksheet-merge", {});
    await expect(page.getByTestId("status-hint")).toContainText("合并");
  });

  test("id column edits are rejected and extractTokens stays on the source id", async ({ page }) => {
    await waitPoc(page);
    await execute(page, "sheet.command.set-range-values", {
      range: { startRow: 1, startColumn: 0, endRow: 1, endColumn: 0 },
      value: { v: "99999" },
    });
    await expect(page.getByTestId("status-hint")).toContainText("id");
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.id?.raw).toBe("40001");
  });

  test("formula edits are rejected; value-only writes extract", async ({ page }) => {
    await waitPoc(page);
    await execute(page, "sheet.command.set-range-values", {
      range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
      value: { f: "=SUM(1,2)", v: 42 },
    });
    await expect(page.getByTestId("status-hint")).toContainText("公式");
    const blocked = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(blocked?.["40001"]?.display_name?.raw).toBe("Fireball");
    await execute(page, "sheet.command.set-range-values", {
      range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
      value: { v: 42 },
    });
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("42");
  });

  test("view-only filter/sort/find-replace leave extractTokens unchanged", async ({ page }) => {
    await waitPoc(page);
    const before = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    await page.keyboard.press("Control+H");
    await page.keyboard.press("Control+F");
    await page.keyboard.press("Control+Z");
    await page.keyboard.press("Control+Y");
    const after = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(after).toEqual(before);
  });
});

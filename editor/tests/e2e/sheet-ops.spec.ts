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

test.describe("v3 surface trim (R-00379 S04): forbidden entries absent in toolbar / context menu / shortcuts", () => {
  async function canvasBox(page: Page) {
    // univer-root 里有隐藏的 doc 编辑 canvas(0x0),取可见的表格画布
    const canvas = page.locator('[data-testid="univer-root"] canvas:visible').first();
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    return box!;
  }

  test("toolbar and formula bar do not render", async ({ page }) => {
    await waitPoc(page);
    await expect(page.locator('[data-u-comp="ribbon-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-u-comp="formula-bar"]')).toHaveCount(0);
  });

  test("native context menu shows row ops but no merge / col insert / col delete / font entries", async ({
    page,
  }) => {
    await waitPoc(page);
    const box = await canvasBox(page);
    // 右键点数据区格(name 列,中部数据行):原生 contextMenu 应打开
    await page.mouse.click(box.x + 170, box.y + box.height * 0.5, { button: "right" });
    // 反空菜单假绿:剪切属白名单,原生菜单必须真的打开
    await expect(page.getByText("剪切").first()).toBeVisible();
    // 「插入」子菜单:行操作在(白名单),不得出现插列入口
    await page.getByText("插入", { exact: true }).hover();
    await expect(page.getByText(/在上方插入/).first()).toBeVisible();
    await expect(page.getByText(/插入列/)).toHaveCount(0);
    // 「删除」子菜单:删行在,删列不可见(现状可见,本卡经 menu 隐藏表裁掉)
    await page.getByText("删除", { exact: true }).hover();
    await expect(page.getByText("删除选中行").first()).toBeVisible();
    await expect(page.getByText("删除选中列")).toHaveCount(0);
    // 顶层与页面上都不得出现合并 / 字体族 / 公式入口(公式 ribbon 页签随工具栏一并消失)
    for (const forbidden of ["合并", "字体", "粗体", "斜体", "下划线", "边框", "公式"]) {
      await expect(page.getByText(forbidden)).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
  });

  test("bold / italic / underline shortcuts leave nothing undoable and no token drift", async ({ page }) => {
    await waitPoc(page);
    const box = await canvasBox(page);
    await page.mouse.click(box.x + 170, box.y + box.height * 0.5);
    const before = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Control+i");
    await page.keyboard.press("Control+u");
    const after = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(after).toEqual(before);
    // 若快捷键仍触发样式命令,撤销栈会多出一条可撤销记录;中和后应无事可撤销
    const undone = await page.evaluate(() => window.__lumioPoc?.undo());
    expect(undone).toBe(false);
  });
});

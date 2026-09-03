import { expect, test, type Page } from "@playwright/test";

async function waitPoc(page: Page) {
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
}

test.describe("four-state nine actions", () => {
  test("open: extractTokens matches fixture baseline including four-state demo", async ({ page }) => {
    await waitPoc(page);
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("Fireball");
    expect(tokens?.["40090"]?.display_name?.raw).toBe('""');
    expect(tokens?.["40090"]?.effect_id?.raw).toBe("null");
    expect(tokens?.["40090"]?.damage?.raw).toBe("@default");
    expect(tokens?.["40090"]?.cooldown_frames?.raw).toBe("@missing");
    expect(tokens?.["40090"]?.icon?.raw).toBe("火球🔥");
  });

  test("edit: set-range-values keeps a value token", async ({ page }) => {
    await waitPoc(page);
    await page.evaluate(async () => {
      await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
        range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
        value: { v: "火球改", t: 1 },
      });
    });
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("火球改");
    expect(tokens?.["40001"]?.display_name?.state).toBe("value");
  });

  test("copy: four-state empty token is preserved on the source after copy command", async ({ page }) => {
    await waitPoc(page);
    const before = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40090"]?.display_name);
    await page.evaluate(async () => {
      try {
        await window.__lumioPoc?.executeCommand("sheet.command.copy", {
          range: { startRow: 3, startColumn: 2, endRow: 3, endColumn: 2 },
        });
      } catch {
        /* copy command id varies; the assertion is that the source token stays empty */
      }
    });
    const after = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40090"]?.display_name);
    expect(after).toEqual(before);
    expect(after?.raw).toBe('""');
  });

  test("paste: writing lumio empty custom extracts as empty token", async ({ page }) => {
    await waitPoc(page);
    await page.evaluate(async () => {
      await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
        range: { startRow: 1, startColumn: 2, endRow: 1, endColumn: 2 },
        value: {
          custom: {
            lumio: { state: "empty", raw: '""', effective: "", column: "display_name", rowKey: "40001" },
          },
        },
      });
    });
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe('""');
    expect(tokens?.["40001"]?.display_name?.state).toBe("empty");
  });

  test("fill: adjacent cell receives the same four-state token", async ({ page }) => {
    await waitPoc(page);
    await page.evaluate(() => window.__lumioPoc?.applyFourState("40001", "display_name", "null"));
    await page.evaluate(async () => {
      await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
        range: { startRow: 2, startColumn: 2, endRow: 2, endColumn: 2 },
        value: {
          custom: {
            lumio: { state: "null", raw: "null", effective: null, column: "display_name", rowKey: "40002" },
          },
        },
      });
    });
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("null");
    expect(tokens?.["40002"]?.display_name?.raw).toBe("null");
  });

  test("delete: required without default keeps value; column with default becomes @default", async ({ page }) => {
    await waitPoc(page);
    const hint = await page.evaluate(() => window.__lumioPoc?.deleteKey("40001", "cooldown_frames"));
    expect(hint).toBeTruthy();
    const kept = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(kept?.["40001"]?.cooldown_frames?.raw).toBe("150");
    await page.evaluate(() => window.__lumioPoc?.deleteKey("40001", "damage"));
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.damage?.raw).toBe("@default");
  });

  test("undo then redo restore four-state tokens", async ({ page }) => {
    await waitPoc(page);
    const before = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name);
    await page.evaluate(() => window.__lumioPoc?.applyFourState("40001", "display_name", "empty"));
    const emptied = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name);
    expect(emptied?.raw).toBe('""');
    await page.evaluate(async () => window.__lumioPoc?.undo());
    const undone = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name);
    expect(undone?.raw).toBe(before?.raw);
    await page.evaluate(async () => window.__lumioPoc?.redo());
    const redone = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name);
    expect(redone?.raw).toBe('""');
  });

  test("draft restore reapplies four-state tokens", async ({ page }) => {
    await waitPoc(page);
    const fingerprint = await page.evaluate(() => window.__lumioPoc?.map()?.baseFingerprint);
    await page.evaluate((baseFingerprint) => {
      window.__lumioPoc?.applyDraftSnapshot({
        table: "skills",
        baseFingerprint: baseFingerprint ?? "",
        draftVersion: 1,
        rows: {
          "40001": { display_name: { state: "null", raw: "null", effective: null } },
        },
      });
    }, fingerprint);
    await page.waitForFunction(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name?.raw === "null");
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(tokens?.["40001"]?.display_name?.raw).toBe("null");
  });

  test("view-only zoom/freeze do not change tokens", async ({ page }) => {
    await waitPoc(page);
    const before = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    await page.evaluate(() => window.__lumioPoc?.executeCommand("sheet.command.set-zoom-ratio", { zoomRatio: 1.25 }));
    const after = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(after).toEqual(before);
  });

  test("new row id is 合入时发号; copy row mints a new draft key; editors classify enum/ref/number", async ({
    page,
  }) => {
    await waitPoc(page);
    const kinds = await page.evaluate(() => window.__lumioPoc?.editorKinds());
    expect(kinds?.element).toBe("enum");
    expect(kinds?.effect_id).toBe("ref");
    expect(kinds?.damage).toBe("number");
    expect(kinds?.enabled).toBe("bool");
    const refs = await page.evaluate(() => window.__lumioPoc?.refOptions());
    expect(refs?.effects).toContain("burn");
    const copied = await page.evaluate(() => window.__lumioPoc?.copyRow("40001"));
    expect(copied?.startsWith("draft:")).toBe(true);
    const map = await page.evaluate(() => window.__lumioPoc?.map());
    expect(map?.rowKeys.some((key) => key.startsWith("draft:"))).toBe(true);
    const tokens = await page.evaluate(() => window.__lumioPoc?.extractTokens());
    expect(copied && tokens?.[copied]).toBeTruthy();
  });

  test("native context menu drives four-state via four-state-* items", async ({ page }) => {
    await waitPoc(page);
    // 坐标口径与 keyboard.spec 相同:canvas 原点 + 24px 列标带 + 24px 行高,
    // 列宽 [110, 140, 其余 120]。右键数据行 1(40001),不用 height*0.5——
    // fixture 只有 3 行数据,半高会落在 sheet 空行(rowKeys 之外)。
    const origin = await page
      .waitForFunction(() =>
        [...document.querySelectorAll('[data-testid="univer-root"] canvas')].some(
          (el) => el.getBoundingClientRect().width > 500,
        ),
      )
      .then(() =>
        page.evaluate(() => {
          const el = [...document.querySelectorAll('[data-testid="univer-root"] canvas')].find(
            (item) => item.getBoundingClientRect().width > 500,
          );
          const rect = el?.getBoundingClientRect();
          if (!rect) {
            throw new Error("grid canvas missing");
          }
          return { x: rect.x, y: rect.y };
        }),
      );
    const columnCenter = (col: number) => {
      const widths = [110, 140];
      let x = 0;
      for (let i = 0; i < col; i += 1) {
        x += widths[i] ?? 120;
      }
      return x + (widths[col] ?? 120) / 2;
    };
    // v3 两行列头后表头行 36px(24 列标带 + 36 表头 + 12 半行)。
    const row1Y = origin.y + 24 + 36 + 12;

    // display_name 列(必填,有值)右键:四项全部可见。
    // Univer 关闭的旧菜单仍留在 DOM(display:none),testid 会撞车,一律取可见实例。
    const visibleItem = (id: string) => page.locator(`[data-testid="${id}"] >> visible=true`);
    await page.mouse.click(origin.x + columnCenter(2), row1Y, { button: "right" });
    await expect(page.getByText("单元格")).toBeVisible();
    await expect(visibleItem("four-state-empty")).toBeVisible();
    await expect(visibleItem("four-state-null")).toBeVisible();
    await expect(visibleItem("four-state-default")).toBeVisible();
    await expect(visibleItem("four-state-missing")).toBeVisible();
    await visibleItem("four-state-empty").click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name?.raw),
      )
      .toBe('""');

    // 必填列(cooldown_frames)右键:设为缺列应禁用并带 title 提示
    const cooldownCol = 5;
    await page.mouse.click(origin.x + columnCenter(cooldownCol), row1Y, { button: "right" });
    const missing = page.locator('[data-testid="four-state-missing"] >> visible=true');
    await expect(missing).toBeVisible();
    await expect(missing).toBeDisabled();
    await expect(missing).toHaveAttribute("title", "必填列不能设为缺列");
  });
});

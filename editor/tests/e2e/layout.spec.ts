import { expect, test, type Page } from "@playwright/test";

/**
 * 布局与检查器验收(R-00380 M6-H · S01/S03/S04;设计稿 §2.1/§5/§7)。
 *
 * 快捷键核定结论(Ctrl+M,待办 §11「契约卡核对 Univer 0.25 内置键后定」):
 * - Univer 0.25.1 全部已装包(sheets-ui/ui/sheets/docs/filter/sort/find-replace/
 *   data-validation/numfmt)无任何 KeyCode.M 快捷键注册; sheets-ui 实注册键为
 *   A/B/D/I/R/U/X/ARROW/BACKSPACE/DELETE/Digit0/Digit9/ENTER/EQUAL/ESC/F2/F4/
 *   MINUS/TAB(Ctrl+B/I/U 已由 univer.ts NilCommand 中和,与 Ctrl+M 无碰撞);
 * - 浏览器侧: Chromium/Firefox 未占用 Ctrl+M(占用的是 Ctrl+Shift+M 配置文件与
 *   设计稿明令避开的 Ctrl+Shift+I / Ctrl+Shift+J);本项目自用 Ctrl+S/K/B/J/Enter
 *   亦无冲突。
 * 结论: **Ctrl+M 可用**。
 *
 * 坐标口径与 keyboard.spec 相同(canvas 原点 + 24 列标带 + 36 表头行 + 24 行高,
 * 列宽 [110, 140, 其余 120])。
 */

async function waitPoc(page: Page) {
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
}

async function gridOrigin(page: Page): Promise<{ x: number; y: number }> {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="univer-root"] canvas')].some(
      (el) => el.getBoundingClientRect().width > 500,
    ),
  );
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="univer-root"] canvas')].find(
      (item) => item.getBoundingClientRect().width > 500,
    );
    const rect = el?.getBoundingClientRect();
    if (!rect) {
      throw new Error("grid canvas missing");
    }
    return { x: rect.x, y: rect.y };
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test.describe(`grid keeps the stage at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("univer-root renders with a meaningful canvas height", async ({ page }) => {
      await waitPoc(page);
      const box = await page.getByTestId("univer-root").boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThan(300);
    });

    // 主区 = 视口高 − 顶栏(42) − 状态条(24);断言 univer-root 高度占比 ≥ 0.75
    // (R-00380 S01;§2.1 预算 900 档 92.6% / 720 档 90.5%)。
    test("univer-root height / main-area height ≥ 0.75", async ({ page }) => {
      await waitPoc(page);
      const box = await page.getByTestId("univer-root").boundingBox();
      expect(box).toBeTruthy();
      const main = viewport.height - 42 - 24;
      expect(box!.height / main).toBeGreaterThanOrEqual(0.75);
    });
  });
}

test.describe("inspector open/close (R-00380 S01)", () => {
  test("inspector defaults to collapsed, expands on cell selection, Ctrl+M collapses, remembered after reload", async ({ page }) => {
    await waitPoc(page);
    // 1. 默认收起
    await expect(page.getByTestId("inspector")).toHaveCount(0);
    // 2. 点数据行 1 的 display_name → 展开
    const origin = await gridOrigin(page);
    await page.mouse.click(origin.x + 110 + 70, origin.y + 24 + 36 + 12);
    await expect(page.getByTestId("inspector")).toBeVisible();
    // 3. Ctrl+M 收起
    await page.keyboard.press("Control+m");
    await expect(page.getByTestId("inspector")).toHaveCount(0);
    // 4. reload → 保持收起
    await page.reload();
    await waitPoc(page);
    await expect(page.getByTestId("inspector")).toHaveCount(0);
    // 5. 再点格展开 → reload → 保持展开(记忆对称)
    const origin2 = await gridOrigin(page);
    await page.mouse.click(origin2.x + 110 + 70, origin2.y + 24 + 36 + 12);
    await expect(page.getByTestId("inspector")).toBeVisible();
    await page.reload();
    await waitPoc(page);
    await expect(page.getByTestId("inspector")).toBeVisible();
  });
});

test.describe("phase capsule and blocking banner (R-00380 S04)", () => {
  // 经 __lumioPoc.setPhase 注入(bridge 由主 loop 接线;生产代码不派发 debugPhase)。
  test("every phase shows its capsule copy and blocking phases show the banner", async ({ page }) => {
    await waitPoc(page);
    const capsule = page.getByTestId("status-phase");
    const banner = page.getByTestId("banner");

    const normal: Array<[string, string]> = [
      ["Opening", "正在打开…"],
      ["ReadyClean", "与仓库一致"],
      ["ReadyDirty", "格未提交"],
      ["SavingDraft", "正在保存草稿…"],
      ["Validating", "正在预检…"],
      ["ReadyToSubmit", "预检通过，可提交"],
      ["Submitting", "正在提交…"],
    ];
    // fixture 模式下 online 恒为 false(无 Host 会话),注入时显式置 online,
    // 否则 14 态全部被「无法连接本机服务」派生态覆盖。
    for (const [phase, text] of normal) {
      await page.evaluate((p) => window.__lumioPoc?.setPhase(p, undefined, true), phase);
      await expect(capsule).toContainText(text);
      await expect(banner).toHaveCount(0);
    }

    const blocking: Array<[string, string | undefined, string]> = [
      ["Conflicted", undefined, "处冲突"],
      ["Stale", undefined, "仓库已更新"],
      ["Failed", "VCS", "commit 未完成"],
      ["Failed", "SCHEMA_CHANGED", "结构已变化"],
      ["Failed", "DRAFT_VERSION_CONFLICT", "另一个标签页"],
      ["Closed", undefined, "会话已结束"],
    ];
    for (const [phase, failKind, text] of blocking) {
      await page.evaluate(
        (args: [string, string | undefined]) => window.__lumioPoc?.setPhase(args[0], args[1], true),
        [phase, failKind] as [string, string | undefined],
      );
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(text);
    }

    // offline 派生态:任一阶段叠加 online=false 覆盖为离线横幅。
    await page.evaluate(() => window.__lumioPoc?.setPhase("ReadyDirty", undefined, false));
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("无法连接本机服务");
  });
});

import { expect, test, type Page } from "@playwright/test";

/**
 * 布局与检查器验收(R-00380 M6-H · S01/S03/S04;设计稿 §2.1/§5/§7)。
 *
 * 本文件分两段:
 * 1. 现在就能跑的烟雾断言(不依赖 App v3 接线、不经 __lumioPoc 注入 phase);
 * 2. 依赖主 loop App 接线(Inspector 挂载 / Ctrl+M / TopBar+Banner / phase 注入桥)
 *    的用例——先以 test.skip 占位并注明依赖,接线后去掉 skip 行整段复跑。
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
 */

async function waitPoc(page: Page) {
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
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

    // 依赖:Task 11/12 面板(TopBar 42 / 工具栏 32 / 抽屉 30 / 状态条 24)+ 主 loop
    // App 接线后的 v3 布局;当前 App 仍是 v1 组合,主区占比无意义。接线后删掉
    // 体内这行 test.skip 并实现测量。
    test("univer-root height / main-area height ≥ 0.75", async () => {
      test.skip(true, "主 loop App 接线后启用:univer-root 高度 / 主区高度 ≥ 0.75(R-00380 S01)");
      /* 接线后实现:主区 = 视口高 − 顶栏(42) − 状态条(24);断言
         univer-root.boundingBox().height / 主区高 ≥ 0.75,两档视口各跑一次。 */
    });
  });
}

test.describe("inspector open/close (R-00380 S01)", () => {
  // 依赖:Inspector 挂载与 Ctrl+M 接线由主 loop 完成(App.tsx 不在本卡文件集)。
  test("inspector defaults to collapsed, expands on cell selection, Ctrl+M collapses, remembered after reload", async () => {
    test.skip(true, "主 loop App 接线后启用:检查器默认收起 / 选格展开 / Ctrl+M 收起 / 刷新后记忆");
    /* 接线后实现:
       1. getByTestId("inspector") 初始不可见(默认收起,viewState.uiFlags 缺省 false);
       2. 点击数据格 → inspector 可见,cell-baseline/invalid-reason 按需出现;
       3. page.keyboard.press("Control+m") → 收起;
       4. reload → 保持收起(localStorage 键 lumio-config-editor:view:*);
       5. 再点格展开 → reload → 保持展开(记忆对称)。 */
  });
});

test.describe("phase capsule and blocking banner (R-00380 S04)", () => {
  // 依赖:TopBar/Banner(Task 11)+ __lumioPoc 的 phase 注入桥(主 loop 接线)。
  test("every phase shows its capsule copy and blocking phases show the banner", async () => {
    test.skip(true, "主 loop 接线后启用:14 个状态各有胶囊文案且阻断态有 banner");
    /* 接线后实现:经 __lumioPoc 注入 phase(Opening/ReadyClean/ReadyDirty/SavingDraft/
       Validating/ReadyToSubmit/Submitting/Conflicted/Stale/Failed×3 种 failKind/Closed/
       offline 派生态),逐一断言状态胶囊文案与 §5 文案表一致;Conflicted/Stale/Failed/
       offline/Closed 断言 [data-testid="banner"] 可见且非阻断态无 banner。 */
  });
});

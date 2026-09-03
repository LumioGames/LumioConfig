import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * 可访问性扫描(Task 18 · F2 · R-00382 S03;docs/a11y-checklist.md 的自动化部分)。
 *
 * 三态各扫一次:默认态(ReadyClean)、抽屉展开态、冲突态;口径「无 serious
 * 以上问题」= axe impact 为 serious / critical 的 violation 为零(minor /
 * moderate 允许,逐条人工清单见 docs/a11y-checklist.md)。
 *
 * 抽屉展开态与冲突态依赖 E 阵列(panels/drawer/**)与冲突页签在 App 的接线;
 * 本卡开工时组件尚未合入(panels/ 下无 drawer/),按派单口径先 test.skip 并
 * 注明原因,主 loop 接线后去掉 skip 行即可跑(scanWithAxe 步骤已写好)。
 */

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

/** serious 以上(serious / critical)的违规格式化成一行一条,失败信息可读。 */
function seriousViolations(results: AxeResults): string[] {
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map(
      (violation) =>
        `${violation.id}(${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    );
}

async function waitApp(page: Page) {
  // 快审 P1-1:首开 onboarding toast 有 150ms 入场动画,axe 落在半透明窗口
  // 会误判 color-contrast;预置 onboarded 键让 toast 不出现(竞态消除)。
  await page.addInitScript(() => {
    window.localStorage.setItem("lumio-config-editor:onboarded", "1");
  });
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
}

/**
 * 已知豁免(serious+,见 docs/a11y-checklist.md):
 * - `.grid-toolbar__hint` 对比度已修(app.css 换 --color-text-muted,M6-J 接线期),
 *   豁免行已删;此处保留的只剩第三方 DOM。
 * - `#univer-doc-main-canvas`:Univer 0.25.1 画布宿主自带 tabindex 无对应 role,
 *   第三方 DOM,本项目源码改不了;升级 / 换渲染层前保持豁免。
 */
const KNOWN_EXCLUSIONS = ["#univer-doc-main-canvas"];

async function scanWithAxe(page: Page) {
  let builder = new AxeBuilder({ page });
  for (const selector of KNOWN_EXCLUSIONS) {
    builder = builder.exclude(selector);
  }
  const results = await builder.analyze();
  const serious = seriousViolations(results);
  // 全量违规格式(含 minor/moderate)打进 stdout,供 docs/a11y-checklist.md 人工清单取证。
  console.log(
    "a11y violations:",
    JSON.stringify(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        targets: v.nodes.map((n) => n.target),
      })),
    ),
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("a11y scans (axe, no serious or higher)", () => {
  test("default state (fixture, ReadyClean) has no serious+ violations", async ({ page }) => {
    await waitApp(page);
    await scanWithAxe(page);
  });

  test("drawer expanded state has no serious+ violations", async ({ page }) => {
    await waitApp(page);
    await page.getByTestId("tab-patch").click();
    await scanWithAxe(page);
  });

  test("conflict state has no serious+ violations", async ({ page }) => {
    await waitApp(page);
    // 接线后:经 bridge 注入 Conflicted(online=true),冲突卡渲染后扫。
    await page.evaluate(() => window.__lumioPoc?.setPhase("Conflicted", undefined, true));
    await scanWithAxe(page);
  });
});

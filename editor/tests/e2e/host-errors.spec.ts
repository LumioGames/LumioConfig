import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(editorRoot, "..");
const distDir = path.join(repoRoot, "src", "lumio_config", "editor_static");
const python =
  process.env.PYTHON ?? "C:\\Users\\g923\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";

/**
 * M7-B 错误页签状态收敛(R-00397)S01 / S04 的 host E2E,复用审计 §C-8 实走路径:
 * 打开 skills → 点 damage 格(必填、无默认)→ 检查器「设为 null」→ 顶栏「预检」
 * → 预检失败「错误 1」→ 检查器「还原」回 ReadyClean,错误页签立即归零且无
 * danger tone(S01);还原前先断言 ReadyDirty 且预检失败时错误仍在(S03 的
 * 不误清半句)。S04(审计 E-4 残留)单独一条:点错误项 → Univer 选区落到
 * 对应行列——见该测试前的 fixme 说明。
 *
 * 选格准备与 four-state / keyboard-journeys 同口径:鼠标点 canvas 上的 damage 格
 * (mousedown 会顺带展开检查器),此后全部走真实 UI(检查器四态键 / 预检 /
 * 错误项 / 还原)。列宽按 projection.columnWidth 的 clamp 公式从 schema 现算,
 * 不抄死数值,避免 M7-C 列宽规则再动时点错列。
 */

function copyRepo(dst: string) {
  for (const name of ["schemas", "tables", "registry"]) {
    fs.cpSync(path.join(repoRoot, name), path.join(dst, name), { recursive: true });
  }
  fs.copyFileSync(path.join(repoRoot, "repository.yaml"), path.join(dst, "repository.yaml"));
  const lumio = path.join(repoRoot, ".lumio");
  if (fs.existsSync(lumio)) {
    fs.cpSync(lumio, path.join(dst, ".lumio"), { recursive: true });
  }
}

async function gitInit(root: string) {
  const run = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn("git", args, { cwd: root, stdio: "ignore" });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`git ${args.join(" ")} -> ${code}`))));
    });
  await run(["init"]);
  await run(["config", "user.email", "e2e@test"]);
  await run(["config", "user.name", "e2e"]);
  await run(["add", "-A"]);
  await run(["commit", "-m", "init"]);
}

function startHost(root: string): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [path.join(repoRoot, "tools", "lumio_config.py"), "serve", "--port", "0", "--no-open", "--root", root],
      {
        cwd: repoRoot,
        env: { ...process.env, LUMIO_EDITOR_DIST: distDir, PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" },
      },
    );
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[^\s]+/);
      if (match) {
        child.stdout.off("data", onData);
        resolve({ child, url: match[0].trim() });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
    });
    child.on("exit", (code) => reject(new Error(`host exited ${code}: ${buffer}`)));
    setTimeout(() => reject(new Error(`host start timeout: ${buffer}`)), 30_000);
  });
}

function stopHost(child: ChildProcessWithoutNullStreams) {
  return new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
    setTimeout(resolve, 2000);
  });
}

async function waitPoc(page: Page, url: string) {
  await page.goto(url);
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => {
    const poc = window.__lumioPoc;
    const phase = poc?.phase?.();
    return Boolean(poc?.map?.()) && (phase === "ReadyClean" || phase === "ReadyDirty");
  });
}

/** projection.columnWidth 的镜像:clamp(112, ceil(首行显示宽 * 8) + 34, 240),首行 = `列名[ *][ 🔒]`。 */
function columnWidthOf(column: { name: string; required?: boolean }): number {
  const readOnly = column.name === "id";
  let width = 0;
  for (const char of `${column.name}${column.required === true ? " *" : ""}${readOnly ? " 🔒" : ""}`) {
    width += (char.codePointAt(0) ?? 0) < 0x80 ? 1 : 2;
  }
  return Math.min(240, Math.max(112, Math.ceil(width * 8) + 34));
}

/** 鼠标点首个数据行(rowKeys[0])的 damage 格;坐标口径与 four-state / keyboard-journeys 相同。 */
async function clickDamageCell(page: Page) {
  const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, "schemas", "skills.json"), "utf8")) as {
    columns: Array<{ name: string; required?: boolean }>;
  };
  const damageIndex = schema.columns.findIndex((column) => column.name === "damage");
  expect(damageIndex).toBeGreaterThanOrEqual(0);
  let x = 0;
  for (let i = 0; i < damageIndex; i += 1) {
    x += columnWidthOf(schema.columns[i]);
  }
  x += columnWidthOf(schema.columns[damageIndex]) / 2;
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="univer-root"] canvas')].some(
      (el) => el.getBoundingClientRect().width > 500,
    ),
  );
  const origin = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="univer-root"] canvas')].find(
      (item) => item.getBoundingClientRect().width > 500,
    );
    const rect = el?.getBoundingClientRect();
    if (!rect) {
      throw new Error("grid canvas missing");
    }
    return { x: rect.x, y: rect.y };
  });
  // 列标带 24 + 两行列头 36 + 半行高 12(D3 后表头行 36px,行高 24)。
  await page.mouse.click(origin.x + x, origin.y + 24 + 36 + 12);
}

/** 审计 §C-8 实走到「预检失败」:点 damage 格(40001)→ 检查器「设为 null」→ 顶栏「预检」。 */
async function preflightDamageNull(page: Page, url: string) {
  await waitPoc(page, url);
  await clickDamageCell(page);
  await expect
    .poll(() => page.evaluate(() => window.__lumioPoc?.activeSelection?.() ?? null))
    .toEqual({ rowKey: "40001", column: "damage" });
  await expect(page.getByTestId("inspector")).toBeVisible();
  await page.locator('[data-testid="inspector"] [data-testid="four-state-null"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.damage?.raw))
    .toBe("null");
  await expect(page.getByTestId("status-phase")).toHaveAttribute("data-phase", "ReadyDirty");
  await page.getByTestId("btn-validate").click();
  // 预检失败:MISSING_REQUIRED,阶段回 ReadyDirty(errors=1)。
  await expect
    .poll(() => page.evaluate(() => window.__lumioPoc?.phase?.() ?? ""))
    .toBe("ReadyDirty");
}

/** tab-errors 的 DOM 快照:页签文本 + 计数文本 + 计数底色与 danger/subtle 变量的对比样本。 */
async function errorTabFacts(page: Page) {
  return page.evaluate(() => {
    const tab = document.querySelector('[data-testid="tab-errors"]');
    const spans = tab ? tab.querySelectorAll("span") : [];
    const count = spans.length > 1 ? spans[spans.length - 1] : null;
    const sample = (value: string) => {
      const el = document.createElement("span");
      el.style.background = value;
      document.body.appendChild(el);
      const bg = getComputedStyle(el).backgroundColor;
      el.remove();
      return bg;
    };
    return {
      tabText: tab?.textContent ?? "",
      countText: count?.textContent ?? "",
      countBg: count ? getComputedStyle(count).backgroundColor : "",
      dangerBg: sample("var(--color-danger-bg)"),
      subtleBg: sample("var(--color-border-subtle)"),
      statusDirty: document.querySelector('[data-testid="status-dirty"]')?.textContent ?? "",
      statusPhaseTitle: document.querySelector('[data-testid="status-phase"]')?.getAttribute("title") ?? "",
    };
  });
}

test.describe("host errors tab (M7-B, R-00397)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r397-"));
    copyRepo(tmp);
    await gitInit(tmp);
    host = await startHost(tmp);
  });

  test.afterAll(async () => {
    if (host) {
      await stopHost(host.child);
    }
    if (tmp && fs.existsSync(tmp)) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* Windows may keep the python process handle briefly */
      }
    }
  });

  test("S01 revert to ReadyClean clears the errors tab; dirty keeps errors (S03 half)", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitPoc(page, host.url);

    // 干净底:ReadyClean,补丁/错误页签计数 0,无 tone。
    await expect(page.getByTestId("status-phase")).toHaveAttribute("data-phase", "ReadyClean");
    const clean = await errorTabFacts(page);
    expect(clean.countText).toBe("0");
    expect(clean.countBg).toBe(clean.subtleBg);

    // 审计 §C-8 实走:点 damage 格(40001)→ 检查器「设为 null」→ 顶栏「预检」→ 失败。
    await preflightDamageNull(page, host.url);

    // S03 的不误清半句:ReadyDirty 且预检失败时「错误 1」仍在,且带 danger tone。
    await expect.poll(async () => (await errorTabFacts(page)).countText).toBe("1");
    const failed = await errorTabFacts(page);
    expect(failed.countText).toBe("1");
    expect(failed.countBg).toBe(failed.dangerBg);
    expect(failed.statusDirty).toContain("1 格未提交");

    // S01:检查器「还原」回基线 → ReadyClean,错误页签立即归零、无 danger tone。
    await expect(page.getByTestId("cell-baseline")).toBeVisible();
    await page.getByTestId("cell-baseline").getByRole("button", { name: "还原" }).click();
    await expect
      .poll(() => page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.damage?.raw))
      .toBe("120");
    await expect(page.getByTestId("status-phase")).toHaveAttribute("data-phase", "ReadyClean");
    await expect(page.getByTestId("status-phase")).toHaveAttribute("title", "ReadyClean");
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('[data-testid="tab-patch"] span:last-child')?.textContent ?? ""),
      )
      .toBe("0");
    await expect.poll(async () => (await errorTabFacts(page)).countText).toBe("0");
    const after = await errorTabFacts(page);
    expect(after.tabText).toContain("错误0");
    expect(after.countText).toBe("0");
    expect(after.countBg).toBe(after.subtleBg);
    expect(after.countBg).not.toBe(after.dangerBg);
    expect(after.statusPhaseTitle).toBe("ReadyClean");
    expect(after.statusDirty).toContain("无未提交改动");
    // 错误页签空态随即落到 no-changes 文案(不再挂历史错误)。
    await page.getByTestId("tab-errors").click();
    await expect(page.getByTestId("panel")).toContainText("还没有改动");
  });

  /**
   * S04(审计 E-4 残留):预检失败 → 点错误项 → 断言 Univer 选区落到对应行列。
   *
   * 曾以 test.fixme 交付(Task 11 实测):host 预检错误(patch.py `_field_errors`)
   * 的 `row` 是**行名**("fireball"),而 App.tsx 错误页签 `onJump` 只按 rowKey
   * ("40001")精确匹配,行名解析缺失 → `jumpToCell` 静默不跳。主 loop 已在接线点
   * 落地 PatchTab 同款的 name→rowKey 反查,本测试恢复执行。
   */
  test("S04 clicking an error item jumps the selection to that cell", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await preflightDamageNull(page, host.url);
    await page.getByTestId("tab-errors").click();
    const item = page.locator('[data-error-item]').first();
    await expect(item).toBeVisible();
    await item.click();
    await expect
      .poll(() => page.evaluate(() => window.__lumioPoc?.lastJump?.() ?? null))
      .toEqual({ rowKey: "40001", column: "damage" });
    await expect
      .poll(() => page.evaluate(() => window.__lumioPoc?.activeSelection?.() ?? null))
      .toEqual({ rowKey: "40001", column: "damage" });
  });

  /**
   * S02 的其余归零路径(M7-B §2):还原(S01 已覆盖)之外,undo 回基线与切表都以
   * E2E 旅程钉死;「行删除撤销」与 undo 共用同一清除点——markDirty 里
   * `stateRef.dirtyCount > 0 && dirty === 0 → setErrors([])`(App.tsx 接线提交),
   * 且其独立行为已被 TableList/undo 既有用例与 S01 的同分支覆盖,此处不再
   * 构造删除行唯一改动的复合状态(见交回物 known gaps 的口径说明)。
   */
  test("S02 undo-to-baseline and table switch also clear the errors tab", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }

    // undo 回基线:预检失败(errors=1)→ 撤销(经 __lumioPoc.undo 桥,与工具栏撤销
    // 按钮同语义;四态写入可能压多条命令,循环撤销直到回基线)→ dirty 0 → 错误归零。
    await preflightDamageNull(page, host.url);
    await expect.poll(async () => (await errorTabFacts(page)).countText).toBe("1");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const raw = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.damage?.raw);
      if (raw === "120") {
        break;
      }
      await page.evaluate(() => window.__lumioPoc?.undo?.());
      await page.waitForTimeout(200);
    }
    await expect
      .poll(() => page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.damage?.raw))
      .toBe("120");
    await expect(page.getByTestId("status-phase")).toHaveAttribute("data-phase", "ReadyClean");
    await expect.poll(async () => (await errorTabFacts(page)).countText).toBe("0");
    const afterUndo = await errorTabFacts(page);
    expect(afterUndo.countBg).toBe(afterUndo.subtleBg);
    expect(afterUndo.statusDirty).toContain("无未提交改动");

    // 切表归零:重新弄脏并预检失败(errors=1)→ 点侧栏切表 → 新表以干净态打开,错误不跨表。
    // (不再整页 goto:桥写入 + 预检即可复现 errors=1,避免重载竞态)
    await page.evaluate(() => window.__lumioPoc?.applyFourState?.("40001", "damage", "null"));
    await page.waitForFunction(() => window.__lumioPoc?.extractTokens?.()?.["40001"]?.damage?.raw === "null");
    await page.getByTestId("btn-validate").click();
    await expect
      .poll(() => page.evaluate(() => window.__lumioPoc?.phase?.() ?? ""))
      .toBe("ReadyDirty");
    await expect.poll(async () => (await errorTabFacts(page)).countText).toBe("1");
    await page.getByTestId("table-effects").click();
    await expect(page.getByTestId("status-phase")).toHaveAttribute("data-phase", "ReadyClean");
    await expect.poll(async () => (await errorTabFacts(page)).countText).toBe("0");
    const afterSwitch = await errorTabFacts(page);
    expect(afterSwitch.countBg).toBe(afterSwitch.subtleBg);
    expect(afterSwitch.statusDirty).toContain("无未提交改动");
  });
});

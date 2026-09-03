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
 * 真实键盘路径守卫(R-00378 S01/S02/S03):
 * 全部用例用 page.mouse / page.keyboard 驱动真实 Univer 编辑管线,不经
 * __lumioPoc.executeCommand 伪造编辑(选区锚点与四态造格属于测试准备)。
 */

function copyRepo(dst: string) {
  for (const name of ["schemas", "tables", "registry"]) {
    fs.cpSync(path.join(repoRoot, name), path.join(dst, name), { recursive: true });
  }
  fs.copyFileSync(path.join(repoRoot, "repository.yaml"), path.join(dst, "repository.yaml"));
  // 不拷 .lumio:键盘用例从零脏格起步。
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

async function waitPocFixture(page: Page) {
  await page.goto("/");
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => Boolean(window.__lumioPoc?.map?.()));
}

// buildWorkbook 的列宽:id 110、name 140、其余 120;行高 24;Univer 自身
// 在 sheet 第 0 行之上还有一条 24px 的列标带。
const COLUMN_WIDTHS = [110, 140];
const ROW_HEIGHT = 24;
const HEADER_BAND = 24;

function columnCenter(col: number): number {
  let x = 0;
  for (let i = 0; i < col; i += 1) {
    x += COLUMN_WIDTHS[i] ?? 120;
  }
  return x + (COLUMN_WIDTHS[col] ?? 120) / 2;
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

/** 真实鼠标点中 40001 行 display_name(sheet row 1 / col 2),再用方向键走到目标格。 */
async function selectCell(page: Page, sheetRow: number, sheetCol: number) {
  const origin = await gridOrigin(page);
  await page.mouse.click(origin.x + columnCenter(2), origin.y + HEADER_BAND + ROW_HEIGHT + ROW_HEIGHT / 2);
  for (let i = 1; i < sheetRow; i += 1) {
    await page.keyboard.press("ArrowDown");
  }
  for (let i = 2; i < sheetCol; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
}

test.describe("keyboard edits over Host static build", () => {
  // Host 的 CSP(default-src 'self')会拦下 Playwright 的 waitForFunction 求值。
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-kb-"));
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

  // 顺序:零编辑用例(T0/T3)在前,避免 T1/T2 的自动存草稿把「脏格 0」
  // 断言污染掉;不配 serial,T0 的已知红(见下)不能跳过 T1~T3。
  // S03 启动无残留:hint 为空时 StatusBar 渲染占位「就绪」。P2-2(安装时序)
  // 由 Task 3 修,该卡合入前此用例预期红。
  test("T0 startup leaves the status hint empty", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitPoc(page, host.url);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("status-hint")).toHaveText("就绪");
  });

  test("T3 Delete on a required column without default keeps token and canvas", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitPoc(page, host.url);
    await selectCell(page, 1, 4);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    const token = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.damage);
    expect(token).toEqual({ state: "value", raw: "120", effective: 120 });
    await expect(page.getByTestId("status-hint")).toContainText("required");
    await expect(page.getByTestId("status-dirty")).toContainText("0");
    const patch = await page.evaluate(() => window.__lumioPoc?.buildPatch());
    expect(patch?.ops).toHaveLength(0);
  });

  test("T1 typing over a value cell updates the token and marks one dirty cell", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitPoc(page, host.url);
    await selectCell(page, 1, 2);
    await page.keyboard.type("Fireball_kb");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name?.raw === "Fireball_kb",
    );
    const token = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name);
    expect(token?.state).toBe("value");
    await expect(page.getByTestId("status-dirty")).toContainText("1");
    const patch = await page.evaluate(() => window.__lumioPoc?.buildPatch());
    expect(patch?.ops).toEqual([
      {
        op: "update",
        name: "fireball",
        set: { display_name: "Fireball_kb" },
        expect: { display_name: "Fireball" },
      },
    ]);
  });

  test("T2 typing over a null-state cell records the typed text as the value", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitPoc(page, host.url);
    await page.evaluate(async () => {
      await window.__lumioPoc?.applyFourState("40001", "display_name", "null");
    });
    await page.waitForFunction(
      () => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name?.raw === "null",
    );
    await selectCell(page, 1, 2);
    await page.keyboard.type("fx_new");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name?.raw === "fx_new",
    );
    const token = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name);
    expect(token).toEqual({ state: "value", raw: "fx_new", effective: "fx_new" });
    const patch = await page.evaluate(() => window.__lumioPoc?.buildPatch());
    expect(patch?.ops[0]?.set?.display_name).toBe("fx_new");
  });
});

test.describe("keyboard Delete on Vite dev fixtures", () => {
  // 真仓 schema(skills/effects/drops)没有带 default 的列,也没有可选列,
  // T4/T5 只能在 Vite dev + editor/fixtures 上跑(fixtures 的 damage 有
  // default: 0,element 可选无默认)。
  test("T4 Delete on a column with default becomes @default", async ({ page }) => {
    await waitPocFixture(page);
    await selectCell(page, 1, 4);
    await page.keyboard.press("Delete");
    await page.waitForFunction(
      () => window.__lumioPoc?.extractTokens()?.["40001"]?.damage?.raw === "@default",
    );
    const token = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.damage);
    expect(token).toEqual({ state: "default", raw: "@default", effective: 0 });
  });

  test("T5 Delete on an optional column without default becomes null", async ({ page }) => {
    await waitPocFixture(page);
    await selectCell(page, 1, 7);
    await page.keyboard.press("Delete");
    await page.waitForFunction(
      () => window.__lumioPoc?.extractTokens()?.["40001"]?.element?.raw === "null",
    );
    const token = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.element);
    expect(token).toEqual({ state: "null", raw: "null", effective: null });
  });
});

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
 * 键盘旅程 J2 / J4 / J5(R-00382 S01、S02;设计稿 §11「J1–J5 均可只用键盘完成」)。
 *
 * ── 接线守卫(本卡 = Task 17 F1 只交付组件与键表,App.tsx 接线属主 loop)──
 * 四段全部依赖 M6-J 主 loop 接线:App.tsx 挂 CommandPalette / SubmitConfirm
 * 并按 HOTKEYS 接 Ctrl+K / Ctrl+Enter / Ctrl+Shift+Enter(现 App.tsx 里
 * onOpenPalette / onOpenShortcuts 仍是「随 M6-J 接线」占位)。其中:
 *   - J2 的 submit-result 结果卡另依赖 E 阵列抽屉补丁页签(Task 14)合入;
 *   - J4 的冲突卡另依赖抽屉冲突页签(Task 15)合入;
 *   - J5 的导出另依赖抽屉导出页签(Task 16)合入。
 * 接线合入后把 APP_WIRED 置 true(或删除下方 test.skip 行),四段即可执行。
 */
const APP_WIRED = true;

function copyRepo(dst: string) {
  for (const name of ["schemas", "tables", "registry"]) {
    fs.cpSync(path.join(repoRoot, name), path.join(dst, name), { recursive: true });
  }
  fs.copyFileSync(path.join(repoRoot, "repository.yaml"), path.join(dst, "repository.yaml"));
  const skills = fs.readFileSync(path.join(dst, "tables", "skills.txt"), "utf8");
  if (!skills.includes("Fireball") || !skills.includes("| 120 ") || !skills.includes("Frostbolt")) {
    throw new Error(`copyRepo expected canonical skills.txt, got:\n${skills}`);
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

function applyCli(root: string, ops: unknown) {
  const patchPath = path.join(root, "patch.json");
  fs.writeFileSync(patchPath, JSON.stringify({ table: "skills", ops }, null, 2));
  const child = spawn(
    python,
    [path.join(repoRoot, "tools", "lumio_config.py"), "patch", "apply", patchPath, "--root", root],
    {
      cwd: root,
      env: { ...process.env, PYTHONUTF8: "1" },
    },
  );
  return new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`patch apply ${code}`))));
  });
}

async function waitReady(page: Page, url: string) {
  await page.goto(url);
  await page.getByTestId("univer-root").waitFor();
  await page.waitForFunction(() => {
    const poc = window.__lumioPoc;
    const phase = poc?.phase?.();
    return Boolean(poc?.map?.()) && (phase === "ReadyClean" || phase === "ReadyDirty");
  });
}

/* 与 keyboard.spec.ts 同源的选格准备:鼠标只用于把选区锚到目标格
 * (选区锚点属测试准备),此后全程键盘。列宽 id 110 / name 140 / 其余 120,
 * 行高 24,列标带 24,两行列头 36(D3 后)。 */
const COLUMN_WIDTHS = [110, 140];
const ROW_HEIGHT = 24;
const HEADER_BAND = 24;
const HEADER_ROW = 36;

function columnCenter(col: number): number {
  let x = 0;
  for (let i = 0; i < col; i += 1) {
    x += COLUMN_WIDTHS[i] ?? 120;
  }
  return x + (COLUMN_WIDTHS[col] ?? 120) / 2;
}

async function selectCell(page: Page, sheetRow: number, sheetCol: number) {
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
  await page.mouse.click(origin.x + columnCenter(2), origin.y + HEADER_BAND + HEADER_ROW + ROW_HEIGHT / 2);
  for (let i = 1; i < sheetRow; i += 1) {
    await page.keyboard.press("ArrowDown");
  }
  for (let i = 2; i < sheetCol; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
}

/** 键盘游走:Tab 直到 activeElement 落进 selector(有界,防死循环)。 */
async function tabUntilInside(page: Page, selector: string, maxTabs = 60): Promise<boolean> {
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate((sel) => {
      const el = document.activeElement;
      return Boolean(el && el instanceof Element && el.closest(sel));
    }, selector);
    if (inside) {
      return true;
    }
  }
  return false;
}

test.describe("keyboard journeys (J2/J4/J5, R-00382)", () => {
  test.use({ bypassCSP: true });
  // 依赖主 loop M6-J 接线(命令面板 / 提交确认 / 抽屉挂进 App):合入后置 true。
  test.skip(!APP_WIRED, "等待主 loop M6-J 接线:Ctrl+K / Ctrl+Enter / Ctrl+Shift+Enter 与抽屉尚未挂进 App");

  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r382-journeys-"));
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

  // J2:只用键盘 Ctrl+K 切表 → 输入 → Ctrl+Enter → Ctrl+Shift+Enter → Enter
  // → submit-result 可见。依赖:命令面板条目(打开 <表>×N)、预检 / 提交键
  // 接线,以及抽屉补丁页签的 submit-result 结果卡(Task 14)。
  test("J2 keyboard-only switch, edit, precheck, submit, confirm", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitReady(page, host.url);
    // Ctrl+K:焦点尚在表格内也要能唤出面板(HOTKEYS.palette.worksInGrid)。
    await page.keyboard.press("Control+k");
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    // 模糊输入切表:skills → effects。
    await page.keyboard.type("eff");
    await expect(palette.getByRole("option", { name: /effects/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__lumioPoc?.table?.() === "effects");
    // 在 effects 表输入一处改动(真实键盘管线;选格锚点属测试准备)。
    await selectCell(page, 1, 2);
    await page.keyboard.type("123");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window.__lumioPoc?.phase?.() ?? "") === "ReadyDirty");
    // Ctrl+Enter 预检。
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("status-phase")).toContainText("预检通过");
    // Ctrl+Shift+Enter 提交 → 提交确认(本 host 默认会自动 commit)。
    await page.keyboard.press("Control+Shift+Enter");
    await expect(page.getByTestId("submit-confirm-text")).toBeVisible();
    // Enter 确认 → 补丁页签结果卡可见。
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("submit-result")).toBeVisible({ timeout: 15_000 });
  });

  // J4:冲突卡 Tab 可达。依赖:抽屉冲突页签(Task 15)合入后的 conflict-panel
  // 冲突卡与 radio 组(conflict-warehouse / conflict-mine …)。
  test("J4 conflict cards are reachable by Tab only", async ({ page }) => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r382-j4-"));
    copyRepo(isolated);
    await gitInit(isolated);
    const isolatedHost = await startHost(isolated);
    try {
      await waitReady(page, isolatedHost.url);
      // 草稿侧改 fireball.damage → 仓库侧改同一格 → rebase 冲突。
      const version = await page.evaluate(async () => {
        await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
          range: { startRow: 1, startColumn: 4, endRow: 1, endColumn: 4 },
          value: { v: 133, t: 2 },
        });
        return window.__lumioPoc?.saveDraftNow();
      });
      expect(version).toBeGreaterThan(0);
      await applyCli(isolated, [{ op: "update", name: "fireball", set: { damage: 140 } }]);
      await page.evaluate(() => window.__lumioPoc?.rebaseNow?.());
      await expect(page.getByTestId("conflict-panel").first()).toBeVisible({ timeout: 15_000 });
      // 不碰鼠标:Tab 游到冲突卡内。
      const inCard = await tabUntilInside(page, '[data-testid="conflict-panel"]');
      expect(inCard, "冲突卡经 Tab 可达").toBe(true);
      // 焦点入卡后先落在卡头跳格钮;继续 Tab 游到 radio 组(空格选中)。
      let focusedRadio = "";
      for (let i = 0; i < 12 && !focusedRadio; i += 1) {
        focusedRadio = await page.evaluate(() => {
          const id = document.activeElement?.getAttribute("data-testid") ?? "";
          return ["conflict-warehouse", "conflict-mine", "conflict-default", "conflict-null"].includes(id) ? id : "";
        });
        if (!focusedRadio) {
          await page.keyboard.press("Tab");
        }
      }
      expect(["conflict-warehouse", "conflict-mine", "conflict-default", "conflict-null"]).toContain(focusedRadio);
      await page.keyboard.press(" ");
      await expect(page.getByTestId(focusedRadio).first()).toBeChecked();
    } finally {
      await stopHost(isolatedHost.child);
      try {
        fs.rmSync(isolated, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  // J5:导出键盘可达。依赖:命令面板「导出」条目 + 抽屉导出页签(Task 16)
  // 的 btn-export / export-link。
  test("J5 export is reachable by keyboard only", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitReady(page, host.url);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("导出");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("btn-export")).toBeVisible();
    // Univer 网格吞 Tab(移动选区),纯 Tab 无法从顶栏跨到抽屉;导出页签
    // 挂载即聚焦主按钮(键盘直达),Enter 触发导出。
    const onExport = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") === "btn-export",
    );
    expect(onExport, "命令面板进入导出页签后焦点落在导出按钮").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("export-link").first()).toBeVisible();
  });

  // autoCommit=false && autoExport=false 时提交不弹确认(ADR 0005:只在会
  // commit 或导表时确认)。依赖:主 loop 在 Ctrl+Shift+Enter 前挂 SubmitConfirm。
  test("no submit confirm when neither auto commit nor auto export", async ({ page }) => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r382-noconfirm-"));
    copyRepo(isolated);
    await gitInit(isolated);
    fs.mkdirSync(path.join(isolated, ".lumio"), { recursive: true });
    fs.writeFileSync(
      path.join(isolated, ".lumio", "local.json"),
      JSON.stringify({ vcs: "git", submit: { autoCommit: false, autoExport: false } }, null, 2),
    );
    const isolatedHost = await startHost(isolated);
    try {
      await waitReady(page, isolatedHost.url);
      await selectCell(page, 1, 4);
      await page.keyboard.type("133");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Control+Enter");
      await expect(page.getByTestId("status-phase")).toContainText("预检通过");
      await page.keyboard.press("Control+Shift+Enter");
      // 两项都关:不弹确认,提交直接执行。
      await expect(page.getByTestId("submit-confirm-text")).toHaveCount(0);
      await expect(page.getByTestId("submit-result")).toBeVisible({ timeout: 15_000 });
    } finally {
      await stopHost(isolatedHost.child);
      try {
        fs.rmSync(isolated, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});

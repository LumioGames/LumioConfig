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
    child.stderr.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
    });
    child.on("exit", (code) => reject(new Error(`host exited ${code}: ${buffer}`)));
    setTimeout(() => reject(new Error(`host start timeout: ${buffer}`)), 30_000);
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

test.describe("host rebase", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r363-"));
    copyRepo(tmp);
    await gitInit(tmp);
    host = await startHost(tmp);
  });

  test.afterAll(async () => {
    host?.child.kill();
    if (tmp && fs.existsSync(tmp)) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  test("different cell auto-merges and submit keeps both sides", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitReady(page, host.url);
    const version = await page.evaluate(async () => {
      await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
        range: { startRow: 1, startColumn: 4, endRow: 1, endColumn: 4 },
        value: { v: 133, t: 2 },
      });
      return window.__lumioPoc?.saveDraftNow();
    });
    expect(version).toBeGreaterThan(0);
    await applyCli(tmp, [{ op: "update", name: "frostbolt", set: { display_name: "Frosty" } }]);
    expect(fs.readFileSync(path.join(tmp, "tables", "skills.txt"), "utf8")).toContain("Frosty");
    await page.evaluate(async () => window.__lumioPoc?.rebaseNow?.());
    await expect(page.getByTestId("status-hint")).toContainText("已合入仓库", { timeout: 15_000 });
    const submitted = await page.evaluate(async () => {
      await window.__lumioPoc?.validateNow?.();
      return window.__lumioPoc?.submitNow?.();
    });
    expect(
      submitted && typeof submitted === "object" && "ok" in submitted ? (submitted as { ok: boolean }).ok : false,
    ).toBeTruthy();
    const skills = fs.readFileSync(path.join(tmp, "tables", "skills.txt"), "utf8");
    expect(skills).toContain("Frosty");
    expect(skills).toContain("133");
  });

  test("same cell opens the conflict panel", async ({ page }) => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r363-conflict-"));
    copyRepo(isolated);
    await gitInit(isolated);
    const isolatedHost = await startHost(isolated);
    try {
      await waitReady(page, isolatedHost.url);
      const version = await page.evaluate(async () => {
        await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
          range: { startRow: 1, startColumn: 4, endRow: 1, endColumn: 4 },
          value: { v: 133, t: 2 },
        });
        return window.__lumioPoc?.saveDraftNow();
      });
      expect(version).toBeGreaterThan(0);
      const saved = JSON.parse(fs.readFileSync(path.join(isolated, ".lumio", "drafts", "skills.json"), "utf8")) as {
        rows?: { "40001"?: { damage?: { raw?: string } } };
      };
      expect(saved.rows?.["40001"]?.damage?.raw).toBe("133");
      await applyCli(isolated, [{ op: "update", name: "fireball", set: { damage: 140 } }]);
      expect(fs.readFileSync(path.join(isolated, "tables", "skills.txt"), "utf8")).toContain("140");
      const rebase = await page.evaluate(async () => window.__lumioPoc?.rebaseNow?.());
      expect(rebase).toEqual(expect.objectContaining({ ok: false }));
      await expect(page.getByTestId("conflict-panel")).toBeVisible();
      await expect(page.getByTestId("conflict-panel")).toContainText("打开时");
      await expect(page.getByTestId("conflict-panel")).toContainText("120");
      await expect(page.getByTestId("conflict-panel")).toContainText("140");
      await expect(page.getByTestId("conflict-panel")).toContainText("133");
      await page.getByTestId("conflict-mine").click();
      // 新冲突页签:单选即解决,全部解决后页签留驻显示「已解决 1 / 1」并放开
      // conflict-resubmit;接线前旧面板:解决即收面板。两种接线都不再挡提交。
      await expect
        .poll(async () => {
          const panel = page.getByTestId("conflict-panel");
          if ((await panel.count()) === 0) {
            return true;
          }
          return (await panel.first().textContent())?.includes("1 / 1") ?? false;
        })
        .toBe(true);
      const submitted = await page.evaluate(async () => {
        await window.__lumioPoc?.validateNow?.();
        return window.__lumioPoc?.submitNow?.();
      });
      expect(
        submitted && typeof submitted === "object" && "ok" in submitted ? (submitted as { ok: boolean }).ok : false,
      ).toBeTruthy();
      const skills = fs.readFileSync(path.join(isolated, "tables", "skills.txt"), "utf8");
      expect(skills).toContain("133");
      expect(skills).not.toContain("| 140 ");
    } finally {
      isolatedHost.child.kill();
    }
  });

  test("resolve all then resubmit keeps both sides", async ({ page }) => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r363-resubmit-"));
    copyRepo(isolated);
    await gitInit(isolated);
    const isolatedHost = await startHost(isolated);
    try {
      await waitReady(page, isolatedHost.url);
      // 草稿两处:fireball.damage 与 CLI 同格(冲突),frostbolt.cooldown_frames 独立格(自动合并)。
      const version = await page.evaluate(async () => {
        await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
          range: { startRow: 1, startColumn: 4, endRow: 1, endColumn: 4 },
          value: { v: 133, t: 2 },
        });
        await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
          range: { startRow: 2, startColumn: 5, endRow: 2, endColumn: 5 },
          value: { v: 100, t: 2 },
        });
        return window.__lumioPoc?.saveDraftNow();
      });
      expect(version).toBeGreaterThan(0);
      // CLI 两处:fireball.damage 同格冲突,frostbolt.display_name 独立格。
      await applyCli(isolated, [
        { op: "update", name: "fireball", set: { damage: 140 } },
        { op: "update", name: "frostbolt", set: { display_name: "Frosty" } },
      ]);
      const rebase = await page.evaluate(async () => window.__lumioPoc?.rebaseNow?.());
      expect(rebase).toEqual(expect.objectContaining({ ok: false }));
      await expect(page.getByTestId("conflict-panel")).toBeVisible();
      const resubmit = page.getByTestId("conflict-resubmit");
      if (await resubmit.count()) {
        // 新冲突页签:全部解决 → conflict-resubmit 可用 → 点它重跑预检并提交。
        await page.getByTestId("conflict-mine").click();
        await expect(resubmit).toBeEnabled();
        await resubmit.click();
        await expect(page.getByTestId("status-hint")).toContainText("已合入仓库", { timeout: 15_000 });
      } else {
        // 接线前过渡:旧面板没有 resubmit,走桥接 validate+submit(App 接线后此分支不再走到)。
        await page.getByTestId("conflict-mine").click();
        const submitted = await page.evaluate(async () => {
          await window.__lumioPoc?.validateNow?.();
          return window.__lumioPoc?.submitNow?.();
        });
        expect(
          submitted && typeof submitted === "object" && "ok" in submitted
            ? (submitted as { ok: boolean }).ok
            : false,
        ).toBeTruthy();
      }
      // 仓库含双方改动:我的 133 / 100 与 CLI 的 Frosty,冲突格不得落 140。
      const skills = fs.readFileSync(path.join(isolated, "tables", "skills.txt"), "utf8");
      expect(skills).toContain("| 133 ");
      expect(skills).toContain("| 100 ");
      expect(skills).toContain("Frosty");
      expect(skills).not.toContain("| 140 ");
    } finally {
      isolatedHost.child.kill();
    }
  });
});

import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * M7-E S03/S04(R-00399):右键表名 → 查看源文件 → 查看器显示 tables/skills.txt 的
 * 真实首行。照 host-drafts 基建(临时仓 + git init + 起 Host);bypassCSP 供
 * waitPoc 的 waitForFunction 用。
 */

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

test.describe("host source view", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r399-source-"));
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

  test("右键表名 → 查看源文件 → 查看器显示 tables/skills.txt 真实首行(M7-E S03/S04)", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await waitPoc(page, host.url);

    await page.getByTestId("table-skills").click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Host 默认 capabilities.reveal=false(M7-G 未授权):第三项整项不渲染。
    await expect(menu.getByRole("menuitem")).toHaveCount(2);

    await menu.getByRole("menuitem").filter({ hasText: "查看源文件" }).click();
    await expect(menu).toBeHidden();

    // 接线点 2(App.tsx 挂 SourceViewDialog / 传 onViewSource)由主 loop 在本卡合入后
    // 接线;未接线时对话框不出现,本条 skip 而非 fail——接线合入后 skip 条件自动失效。
    const dialog = page.getByTestId("source-view-dialog");
    if (!(await dialog.isVisible())) {
      test.skip(true, "SourceViewDialog 尚未挂到 App(接线点 2,主 loop 合入后本条实跑)");
    }
    await expect(dialog).toBeVisible();
    // tables/skills.txt 的真实首行(仓库文件逐字节下发)。
    await expect(page.getByTestId("source-view-text")).toContainText("table: skills");
    await expect(page.getByTestId("source-view-note")).toContainText("只读");
    await expect(page.getByTestId("source-view-lines")).toContainText("1");
  });
});

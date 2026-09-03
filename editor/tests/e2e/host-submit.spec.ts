import { expect, test } from "@playwright/test";
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
}

async function gitInit(root: string) {
  const run = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn("git", args, { cwd: root, stdio: "ignore" });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`git ${args.join(" ")} -> ${code}`))));
    });
  await run(["init", "-b", "main"]);
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

test.describe("host submit", () => {
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r362-"));
    copyRepo(tmp);
    await gitInit(tmp);
    fs.mkdirSync(path.join(tmp, ".lumio"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".lumio", "local.json"),
      JSON.stringify({ vcs: "git", submit: { autoCommit: true, autoExport: false } }, null, 2),
    );
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

  test("empty submit is ok; edit then submit updates tables and git log", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await page.goto(host.url);
    await page.getByTestId("univer-root").waitFor();
    await page.waitForFunction(() => {
      const poc = window.__lumioPoc;
      const phase = poc?.phase?.();
      return Boolean(poc?.map?.()) && (phase === "ReadyClean" || phase === "ReadyDirty");
    });
    const empty = await page.evaluate(async () => {
      const patch = window.__lumioPoc?.buildPatch?.();
      return window.__lumioPoc?.submitNow?.() ?? patch;
    });
    expect(empty).toBeTruthy();
    await page.waitForFunction(() => {
      const poc = window.__lumioPoc;
      const phase = poc?.phase?.();
      return Boolean(poc?.map?.()) && (phase === "ReadyClean" || phase === "ReadyDirty");
    });
    await page.evaluate(async () => {
      await window.__lumioPoc?.executeCommand("sheet.command.set-range-values", {
        range: { startRow: 1, startColumn: 4, endRow: 1, endColumn: 4 },
        value: { v: 133, t: 2 },
      });
    });
    const result = await page.evaluate(async () => {
      await window.__lumioPoc?.validateNow?.();
      return window.__lumioPoc?.submitNow?.();
    });
    expect(result && typeof result === "object" && "ok" in result ? (result as { ok: boolean }).ok : true).toBeTruthy();
    const skills = fs.readFileSync(path.join(tmp, "tables", "skills.txt"), "utf8");
    expect(skills).toContain("133");
    const log = spawn("git", ["log", "-1", "--format=%s"], { cwd: tmp });
    const subject = await new Promise<string>((resolve) => {
      let out = "";
      log.stdout.on("data", (chunk) => {
        out += String(chunk);
      });
      log.on("exit", () => resolve(out.trim()));
    });
    expect(subject.startsWith("config(skills):")).toBeTruthy();
    // Task 14(E1):提交成功后,抽屉补丁页签顶部出现结果卡——新指纹 8 位裸 hex、
    // 版本库动作、发号映射。依赖主 loop 把 Drawer/PatchTab 接进 App.tsx;
    // 接线合入前 [data-testid=panel] 尚未挂载,本断言在接线后才能跑绿。
    await page.getByTestId("tab-patch").click();
    const card = page.getByTestId("submit-result");
    await expect(card).toBeVisible();
    const cardText = (await card.textContent()) ?? "";
    expect(cardText).toMatch(/[0-9a-f]{8}/);
    expect(cardText).not.toContain("sha256:");
    expect(cardText).toContain("commit");
    expect(cardText).toContain("main");
    // 快审 P1-2 回归:自家提交不得触发「表已变化」横幅(seen 与会话修订同源)。
    await expect(page.getByTestId("banner")).toHaveCount(0);
  });
});

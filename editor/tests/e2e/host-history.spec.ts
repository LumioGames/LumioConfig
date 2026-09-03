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
}

function run(cwd: string, command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.stderr.on("data", (chunk) => (out += String(chunk)));
    child.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} ${args.join(" ")} -> ${code}: ${out}`))));
  });
}

async function gitInit(root: string) {
  await run(root, "git", ["init"]);
  await run(root, "git", ["config", "user.email", "e2e@test"]);
  await run(root, "git", ["config", "user.name", "e2e"]);
  await run(root, "git", ["add", "-A"]);
  await run(root, "git", ["commit", "-m", "init"]);
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

/** CLI `patch apply`(AI 侧入口;apply 只写表文件,修订需随后的 git commit 才进 history)。 */
async function cliPatchApply(root: string, patch: object) {
  const patchPath = path.join(root, `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(patchPath, JSON.stringify(patch), "utf8");
  try {
    await run(root, python, [path.join(repoRoot, "tools", "lumio_config.py"), "patch", "apply", patchPath, "--root", root]);
  } finally {
    fs.rmSync(patchPath, { force: true });
  }
}

function writeSettings(root: string, payload: object) {
  fs.mkdirSync(path.join(root, ".lumio"), { recursive: true });
  fs.writeFileSync(path.join(root, ".lumio", "local.json"), JSON.stringify(payload, null, 2));
}

interface HistoryItem {
  revision: string;
  message: string;
  time: string;
  author: string;
  cells: Array<{ row: string; rowId: string; column: string; from: string; to: string }>;
  created: string[];
  deleted: string[];
  schemaChanged: boolean;
}

/** 在编辑器页面上下文里带 token 请求 Host API(与 App 的 api() 同源同鉴权)。 */
async function fetchViaPage(page: Page, apiPath: string): Promise<unknown> {
  return page.evaluate(async (target) => {
    const token = sessionStorage.getItem("lumio-token");
    const response = await fetch(target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return response.json();
  }, apiPath);
}

test.describe("host history (git)", () => {
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r383-history-"));
    copyRepo(tmp);
    await gitInit(tmp);
    writeSettings(tmp, { vcs: "git", submit: { autoCommit: true, autoExport: false } });
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

  test("编辑器开着:CLI patch apply 两次并 commit 后,重新打开,history 端点列出两次修订与格级差异", async ({ page }) => {
    test.skip(typeof host === "undefined", "host missing");
    if (!host) {
      throw new Error("host missing");
    }
    await page.goto(host.url);
    await page.getByTestId("univer-root").waitFor();

    await cliPatchApply(tmp, {
      table: "skills",
      ops: [{ op: "update", name: "fireball", set: { damage: 130 }, expect: { damage: "120" } }],
    });
    await run(tmp, "git", ["add", "-A"]);
    await run(tmp, "git", ["commit", "-m", "config(skills): raise fireball damage to 130"]);
    await cliPatchApply(tmp, {
      table: "skills",
      ops: [{ op: "update", name: "fireball", set: { damage: 140 }, expect: { damage: "130" } }],
    });
    await run(tmp, "git", ["add", "-A"]);
    await run(tmp, "git", ["commit", "-m", "config(skills): raise fireball damage to 140"]);

    await page.reload();
    await page.getByTestId("univer-root").waitFor();

    const body = (await fetchViaPage(page, "/api/tables/skills/history?limit=20")) as { items: HistoryItem[] };
    const items = body.items;
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].message).toBe("config(skills): raise fireball damage to 140");
    expect(items[1].message).toBe("config(skills): raise fireball damage to 130");
    const top = items[0].cells.find((cell) => cell.column === "damage");
    expect(top).toBeTruthy();
    expect(top!.row).toBe("fireball");
    expect(top!.from).toBe("130");
    expect(top!.to).toBe("140");
    const middle = items[1].cells.find((cell) => cell.column === "damage");
    expect(middle!.from).toBe("120");
    expect(middle!.to).toBe("130");
    expect(items[0].schemaChanged).toBe(false);

    const session = (await fetchViaPage(page, "/api/session")) as { capabilities: { history: boolean } };
    expect(session.capabilities.history).toBe(true);
  });

  // 依赖 Drawer / App 接线(E 阵列与主 loop 合入后启用):改动页签在抽屉中渲染两次修订,点击条目跳格。
  test.skip("改动页签列出两次修订与格级差异并可跳格(待 Drawer/App 接线)", async ({ page }) => {
    test.skip(!host, "host missing");
    if (!host) {
      throw new Error("host missing");
    }
    await page.goto(host.url);
    await page.getByTestId("univer-root").waitFor();
    await page.getByTestId("tab-diff").click();
    const revision = page.getByTestId("diff-revision").first();
    await expect(revision).toContainText("config(skills): raise fireball damage to 140");
    await expect(page.getByTestId("diff-cell").first()).toContainText("fireball · damage · 130 → 140");
    await page.getByTestId("diff-cell").first().click();
    await page.waitForFunction(() => {
      const cell = window.__lumioPoc?.extractTokens?.();
      return Boolean(cell);
    });
  });
});

test.describe("host history (none)", () => {
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r383-none-"));
    copyRepo(tmp);
    writeSettings(tmp, { vcs: "none", submit: { autoCommit: false, autoExport: false } });
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

  test("vcs=none:capabilities.history 为 false 且 history 端点为空(页签不渲染的接线条件)", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await page.goto(host.url);
    await page.getByTestId("univer-root").waitFor();
    const session = (await fetchViaPage(page, "/api/session")) as { capabilities: { history: boolean } };
    expect(session.capabilities.history).toBe(false);
    const body = (await fetchViaPage(page, "/api/tables/skills/history")) as { items: HistoryItem[] };
    expect(body.items).toEqual([]);
  });

  // 依赖 Drawer / App 接线(E 阵列与主 loop 合入后启用):svn / none 桩下 tab-diff 不出现。
  test.skip("svn / none 桩下改动页签不出现(待 Drawer/App 接线)", async ({ page }) => {
    test.skip(!host, "host missing");
    if (!host) {
      throw new Error("host missing");
    }
    await page.goto(host.url);
    await page.getByTestId("univer-root").waitFor();
    await expect(page.getByTestId("tab-diff")).toHaveCount(0);
  });
});

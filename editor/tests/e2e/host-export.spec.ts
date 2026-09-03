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

test.describe("host export", () => {
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-r364-export-"));
    copyRepo(tmp);
    await gitInit(tmp);
    host = await startHost(tmp);
  });

  test.afterAll(async () => {
    host?.child.kill();
  });

  test("drawer export tab writes csv with bom and readme, downloads via export-link", async ({ page }) => {
    if (!host) {
      throw new Error("host missing");
    }
    await page.goto(host.url);
    await page.getByTestId("univer-root").waitFor();
    // §8 导出页签:顶栏「导出」直达导出页签,页签内的 [导出] 发起导出。
    // (App 接线抽屉前 btn-export-top 为滚动定位、btn-export 在旧 ExportPanel,
    //  接线后 btn-export-top 打开导出页签、btn-export 在 ExportTab 内,两态都可走。)
    await page.getByTestId("btn-export-top").click();
    await page.getByTestId("btn-export").click();
    await expect(page.getByTestId("export-link").first()).toBeVisible();
    const hrefs = await page.locator("[data-testid=export-link]").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    const csvHref = hrefs.find((href) => href.endsWith("skills.csv"));
    const readmeHref = hrefs.find((href) => href.endsWith("README.txt"));
    expect(csvHref).toBeTruthy();
    expect(readmeHref).toBeTruthy();
    const csv = await page.evaluate(async (url) => {
      const token = sessionStorage.getItem("lumio-token");
      const response = await fetch(url ?? "", { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, bom: Array.from(bytes.slice(0, 3)), text: new TextDecoder().decode(bytes) };
    }, csvHref);
    expect(csv.status).toBe(200);
    expect(csv.bom).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.text).toContain("fireball");
    const readme = await page.evaluate(async (url) => {
      const token = sessionStorage.getItem("lumio-token");
      const response = await fetch(url ?? "", { headers: { Authorization: `Bearer ${token ?? ""}` } });
      return response.text();
    }, readmeHref);
    expect(readme).toContain("GENERATED / NOT AUTHORITATIVE — do not import back");
    expect(readme).toContain("source: repo");
    // 下载 export-link:点击锚点走 blob 下载(Authorization fetch → a[download])。
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('[data-testid="export-link"][href$="skills.csv"]').click(),
    ]);
    expect(download.suggestedFilename()).toBe("skills.csv");
  });
});

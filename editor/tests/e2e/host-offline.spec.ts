import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// M7-A(R-00396)S01/S03/S04:掉线态真正可感知的离线 E2E。
// 覆盖旅程:起 serve → 断言在线 → SIGKILL Host → ≤8s 整页阻断(S01)
// → 遮罩下切表不落 Failed/不白屏/无 uncaught(S03)→ 同端口重启 + 注入新 token
// → ≤12s 退避重连回在线且草稿未丢(S04)。实际耗时数值会打进测试输出供交回物引用。

const here = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(editorRoot, "..");
const distDir = path.join(repoRoot, "src", "lumio_config", "editor_static");
const python =
  process.env.PYTHON ?? "C:\\Users\\g923\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";

// 验收项原文:S01 断流 ≤8s 感知;S04 重启后 ≤12s 回在线。
const OFFLINE_BUDGET_MS = 8_000;
const RECONNECT_BUDGET_MS = 12_000;

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

// 固定端口起 serve:S04 要在同端口重启。Host 每次 serve 随机生成新 token,
// 无法真的同 token 重启;但 subscribeEvents 每次重连尝试都重读
// sessionStorage["lumio-token"](client.ts readToken),把新 token 写进
// sessionStorage 即等效于"同端口同 token"的原地恢复。
function startHost(root: string, port: number): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [path.join(repoRoot, "tools", "lumio_config.py"), "serve", "--port", String(port), "--no-open", "--root", root],
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

// S01 用 SIGKILL 模拟 Host 进程骤死:连接被强制复位,reader.read() 直接 reject,
// 走 onClose("error") 而不是优雅 ended。
function killHost(child: ChildProcessWithoutNullStreams) {
  return new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGKILL");
    setTimeout(resolve, 2_000);
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

test.describe("host offline (M7-A R-00396 S01/S03/S04)", () => {
  test.describe.configure({ mode: "serial" });
  // Host 页面带 CSP(default-src 'self'),会拦 waitForFunction 的轮询注入,照 host-drafts 放行。
  test.use({ bypassCSP: true });
  let tmp = "";
  let host: { child: ChildProcessWithoutNullStreams; url: string } | undefined;
  let port = 0;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("editor_static missing; run pnpm build before host e2e");
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-m7a-"));
    copyRepo(tmp);
    await gitInit(tmp);
    port = 18_800 + Math.floor(Math.random() * 200);
    host = await startHost(tmp, port);
  });

  test.afterAll(async () => {
    if (host) {
      await killHost(host.child);
    }
    if (tmp && fs.existsSync(tmp)) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* Windows may keep the python process handle briefly */
      }
    }
  });

  test("S01 kill->Blocked, S03 offline switch is inert, S04 restart reconnects with draft intact", async ({
    page,
  }) => {
    if (!host) {
      throw new Error("host missing");
    }
    // S03 哨兵:整条旅程(掉线感知 → 遮罩下操作 → 恢复)零未捕获异常。
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await waitPoc(page, host.url);
    await expect(page.getByTestId("status-online")).toHaveText(/在线/);
    await expect(page.getByRole("alertdialog")).toBeHidden();

    // 掉线前先落一份草稿(40001.display_name 四态 null)——S04 恢复后必须原样还在。
    const version = await page.evaluate(async () => {
      await window.__lumioPoc?.applyFourState("40001", "display_name", "null");
      return window.__lumioPoc?.saveDraftNow();
    });
    expect(version).toBeGreaterThan(0);

    // --- S01:SIGKILL Host,≤8s 内感知掉线(Blocked 整页阻断 + 离线胶囊) ---
    const killedAt = Date.now();
    await killHost(host.child);
    await page.locator('[role="alertdialog"]').waitFor({ timeout: OFFLINE_BUDGET_MS });
    const s01Ms = Date.now() - killedAt;
    // 交回物硬要求:打印实际耗时数值。
    console.log(`[M7-A S01] Blocked appeared ${s01Ms}ms after SIGKILL (budget ${OFFLINE_BUDGET_MS}ms)`);
    expect(s01Ms, "S01: offline must be perceived within 8s of host death").toBeLessThanOrEqual(
      OFFLINE_BUDGET_MS,
    );
    await expect(page.getByTestId("blocked")).toBeVisible();
    await expect(page.getByTestId("status-online")).toHaveText(/离线/);
    // 掉线派生态(phaseView 的 !online 分支):胶囊变红、阶段名是 Offline 而非 Failed;
    // 该分支同时给出 gridLocked + 四个 can 全 false,即表格锁定。
    await expect(page.getByTestId("status-phase")).toHaveAttribute("title", "Offline");
    await expect(page.getByTestId("status-phase")).toHaveAttribute("data-tone", "red");

    // --- S03:Blocked 是整页遮罩,真实点击会被拦截;DOM 直发点击模拟"遮罩下仍有事件到达"。
    // openTable 的掉线守卫应直接返回:不请求、不卸载工作簿、不落 failed。 ---
    await page.evaluate(() => {
      (document.querySelector('[data-testid="table-effects"]') as HTMLElement | null)?.click();
    });
    await expect(page.getByTestId("status-phase")).toHaveAttribute("title", "Offline");
    expect(await page.getByText("提交失败").count()).toBe(0);
    expect(pageErrors, `S03: uncaught page errors: ${pageErrors.map(String).join("; ")}`).toHaveLength(0);
    // Univer 实例保留——掉线白屏(审计 C-10)的直接回归哨兵。
    expect(await page.evaluate(() => window.__lumioPoc?.map?.() != null)).toBe(true);

    // --- S04:同端口重启 serve(新 token),写进 sessionStorage 后原地等退避重连 ---
    host = await startHost(tmp, port);
    const restartedAt = Date.now();
    const newToken = host.url.match(/#token=(.+)$/)?.[1] ?? "";
    expect(newToken.length, "restart url must carry a fresh token").toBeGreaterThan(0);
    await page.evaluate((token) => window.sessionStorage.setItem("lumio-token", token), newToken);
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="status-online"]')?.textContent ?? "").includes("在线"),
      undefined,
      { timeout: RECONNECT_BUDGET_MS },
    );
    const s04Ms = Date.now() - restartedAt;
    // 交回物硬要求:打印实际耗时数值。
    console.log(`[M7-A S04] back online ${s04Ms}ms after restart serve (budget ${RECONNECT_BUDGET_MS}ms)`);
    expect(s04Ms, "S04: reconnect must complete within 12s of restart").toBeLessThanOrEqual(
      RECONNECT_BUDGET_MS,
    );
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByTestId("status-online")).toHaveText(/在线/);
    // 草稿未丢:恢复后该格 token 仍是掉线前改的值(工作簿没被重载/卸载)。
    const restored = await page.evaluate(() => window.__lumioPoc?.extractTokens()?.["40001"]?.display_name?.raw);
    expect(restored).toBe("null");
    expect(pageErrors, `uncaught page errors across journey: ${pageErrors.map(String).join("; ")}`).toHaveLength(0);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

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

/**
 * 解码 Playwright 截图 PNG(仅支持无调色板的 RGB/RGBA 8bit)并统计
 * invalid 样式色 #C5221F 的核心笔画像素。只给 T0 的无红字守卫用,不追求通用。
 */
function countRedDominantPixels(png: Buffer): number {
  if (png.readUInt32BE(0) !== 0x89504e47) {
    throw new Error("not a png");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png: depth=${bitDepth} color=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  let prev = Buffer.alloc(stride);
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) {
        row[x] = (row[x] + left) & 0xff;
      } else if (filter === 2) {
        row[x] = (row[x] + up) & 0xff;
      } else if (filter === 3) {
        row[x] = (row[x] + ((left + up) >> 1)) & 0xff;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
    }
    for (let x = 0; x < stride; x += channels) {
      const r = row[x];
      const g = row[x + 1];
      const b = row[x + 2];
      if (r > 170 && g < 60 && b < 60) {
        count += 1;
      }
    }
    prev = row;
  }
  return count;
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
/** v3 两行列头(D3)后表头行高 36(单行 24 + 换行行)。 */
const HEADER_ROW = 36;

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
  await page.mouse.click(origin.x + columnCenter(2), origin.y + HEADER_BAND + HEADER_ROW + ROW_HEIGHT / 2);
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
    // v3 状态条:status-hint 是视觉隐藏 live region,空 hint 渲染空串(旧「就绪」占位已删)。
    await expect(page.getByTestId("status-hint")).toHaveText("");
    // S03 无红字:invalid 样式色 #C5221F 是 canvas 文本,模型层无 DOM 可断言,
    // 退回像素口径。判据收紧到该色核心笔画(r>170 且 g/b<60):干净加载实测 0,
    // 排除 Univer 自带 DV 角标(≈rgb(183,87,0),g≈87)与工具栏橙色图标的噪
    // 声;阳性对照(damage 键入 "abc")实测 24,信号可分辨。
    const shot = await page.getByTestId("univer-root").screenshot();
    const red = countRedDominantPixels(shot);
    expect(red, "invalid-red pixels on clean load").toBe(0);
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
    // v3 状态条(§12):0 脏格显示「无未提交改动」。
    await expect(page.getByTestId("status-dirty")).toContainText("无未提交改动");
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

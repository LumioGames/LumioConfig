/**
 * A4 spike · 四态徽标渲染扩展 demo(Univer OSS 0.25.1,pnpm 锁版)
 *
 * 证明:在「不改单元格 v」的前提下,经 CELL_CONTENT 拦截器给格子右下角画文本徽标 ∅。
 * 数据层:custom.lumio.badge 携带徽标文案(与生产 cellMeta.ts 同构);v / t 不写。
 * 渲染层:拦截器返回 customRender(canvas 绘制)与 markers(角标三角)。
 *
 * 本文件属于 spike 产出,不被 editor/src 引用、不进 build、不进 editor_static。
 */

import {
  LocaleType,
  LogLevel,
  Univer,
  InterceptorEffectEnum,
  IUniverInstanceService,
  UniverInstanceType,
  mergeLocales,
  type ICellCustomRender,
  type ICellDataForSheetInterceptor,
  type Worksheet,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
// preset-sheets-core 类型层 re-export 了 @univerjs/sheets(见其 lib/types/index.d.ts),
// 因此这里不需要新增 @univerjs/sheets 依赖即可拿到拦截器入口。
import {
  INTERCEPTOR_POINT,
  SheetInterceptorService,
  UniverSheetsCorePreset,
} from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";

import "@univerjs/preset-sheets-core/lib/index.css";

/* ------------------------------------------------------------------ */
/* 徽标绘制:ICellCustomRender.drawWith(ctx, info, skeleton, spreadsheets) */
/* 证据:node_modules/@univerjs/core/lib/types/types/interfaces/i-cell-custom-render.d.ts:38-48 */
/* 渲染消费:engine-render 内建 Custom 扩展(Z_INDEX 55)逐可见格调用 drawWith */
/* 证据:.pnpm/@univerjs+engine-render@0.25.1(含 peer 后缀)…/engine-render/lib/es/index.js:5509-5533 */
/* ------------------------------------------------------------------ */

const BADGE_COLOR: Record<string, string> = {
  missing: "#9AA0A6",
  empty: "#80868B",
  null: "#5F6B7A",
  default: "#9AA0A6",
};

const badgeRender: ICellCustomRender = {
  zIndex: 0,
  drawWith(ctx, info) {
    const badge = readBadge(info.data);
    if (!badge) return;
    const { endX, endY, startY } = info.primaryWithCoord; // ICellWithCoord:typedef.d.ts:510-544
    ctx.save();
    ctx.font = "italic 10px system-ui, sans-serif";
    ctx.fillStyle = BADGE_COLOR[badge.state] ?? "#80868B";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    // 右下角、内缩 4px;基线压到格子底边上方,与网格线留 3px
    ctx.fillText(badge.text, endX - 4, Math.min(endY - 3, startY + 14));
    ctx.restore();
  },
};

function readBadge(data: ICellDataForSheetInterceptor | null | undefined): {
  state: string;
  text: string;
} | null {
  const lumio = (data?.custom as Record<string, unknown> | undefined)?.lumio as
    | Record<string, unknown>
    | undefined;
  const state = lumio?.state;
  const text = lumio?.badge;
  if (typeof state === "string" && typeof text === "string") {
    return { state, text };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 工作簿数据:四态格的 v 全部不写(模型层即 null),徽标在 custom.lumio.badge */
/* 与生产 projection.ts/cellMeta.ts 同构(writeLumioCustom 的输出形状)。     */
/* ------------------------------------------------------------------ */

const STYLES = {
  header: { bl: { s: 1 }, bg: { rgb: "#EEF2F6" }, ht: 1, vt: 2, fs: 11 },
  idReadOnly: { bg: { rgb: "#F4F6F8" }, cl: { rgb: "#5C6570" }, ht: 1, vt: 2, fs: 11 },
  missing: { it: { s: 1 }, cl: { rgb: "#9AA0A6" }, fs: 10, vt: 2 },
  empty: { it: { s: 1 }, cl: { rgb: "#80868B" }, fs: 10, vt: 2 },
  nullState: { it: { s: 1 }, cl: { rgb: "#80868B" }, fs: 11, vt: 2, ht: 1 },
  default: { it: { s: 1 }, cl: { rgb: "#9AA0A6" }, fs: 11, vt: 2 },
  value: { fs: 11, vt: 2 },
};

/** 生产 buildCell:四态格 v 保持 undefined,只带 s + custom.lumio */
function stateCell(state: "missing" | "empty" | "null" | "default", badge: string) {
  return {
    s: state === "default" ? "default" : state === "null" ? "nullState" : state,
    custom: {
      lumio: {
        state,
        raw:
          state === "missing"
            ? "@missing"
            : state === "empty"
              ? '""'
              : state === "null"
                ? "null"
                : "@default",
        effective: null,
        column: "impact",
        rowKey: "row-1",
        badge,
      },
    },
  };
}

const SHEET_ID = "spike";
const workbookData = {
  id: "lumio-spike",
  appVersion: "0.25.1",
  locale: "zhCN",
  name: "spike",
  styles: STYLES,
  sheetOrder: [SHEET_ID],
  sheets: {
    [SHEET_ID]: {
      id: SHEET_ID,
      name: "四态",
      rowCount: 30,
      columnCount: 6,
      defaultColumnWidth: 130,
      defaultRowHeight: 24,
      freeze: { xSplit: 2, ySplit: 1, startRow: 1, startColumn: 2 },
      mergeData: [],
      zoomRatio: 1,
      showGridlines: 1,
      rightToLeft: 0,
      hidden: 0,
      cellData: {
        "0": {
          "0": { v: "id", t: 1, s: "header" },
          "1": { v: "name", t: 1, s: "header" },
          "2": { v: "impact", t: 1, s: "header" },
          "3": { v: "note", t: 1, s: "header" },
        },
        "1": {
          "0": { v: 1001, t: 2, s: "idReadOnly" },
          "1": { v: "fireball", t: 1, s: "value" },
          "2": stateCell("missing", "missing"), // 缺列:灰斜体徽标
          "3": { s: "value" }, // markers 角标演示格(右下三角)
        },
        "2": {
          "0": { v: 1002, t: 2, s: "idReadOnly" },
          "1": { v: "ice-lance", t: 1, s: "value" },
          "2": stateCell("empty", '""'), // 空字符串
          "3": { v: "v 为空,徽标在 custom.lumio", t: 1, s: "value" },
        },
        "3": {
          "0": { v: 1003, t: 2, s: "idReadOnly" },
          "1": { v: "thunder", t: 1, s: "value" },
          "2": stateCell("null", "∅"), // 明确空值:本 spike 的必答题
          "3": { v: "本格 v === null", t: 1, s: "value" },
        },
        "4": {
          "0": { v: 1004, t: 2, s: "idReadOnly" },
          "1": { v: "poison", t: 1, s: "value" },
          // 吃默认:幽灵默认值进 v(生产现状:default 态显示 effective),徽标照走 customRender
          "2": { v: 25, t: 2, s: "default", custom: { lumio: { state: "default", raw: "@default", effective: 25, column: "impact", rowKey: "row-4", badge: "默认" } } },
          "3": { v: "幽灵值 25 + 徽标", t: 1, s: "value" },
        },
        "5": {
          "0": { v: 1005, t: 2, s: "idReadOnly" },
          "1": { v: "slash", t: 1, s: "value" },
          "2": { v: 30, t: 2, s: "value" }, // 普通值对照:无徽标
          "3": { v: "对照格,无徽标", t: 1, s: "value" },
        },
      },
      columnData: {
        "0": { w: 90 },
        "1": { w: 120 },
        "2": { w: 130 },
        "3": { w: 210 },
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* 装配:与生产 univer.ts 同一预设面(preset-sheets-core)             */
/* ------------------------------------------------------------------ */

const container = document.getElementById("app");
if (!container) throw new Error("spike: #app container missing");

const univer = new Univer({
  locale: LocaleType.ZH_CN,
  locales: { [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN) },
  logLevel: LogLevel.WARN,
});

const preset = UniverSheetsCorePreset({
  container,
  header: true,
  toolbar: false,
  formulaBar: false,
  contextMenu: true,
  footer: { sheetBar: false, statisticBar: true, menus: false, zoomSlider: true },
});
for (const item of preset.plugins) {
  const [plugin, options] = Array.isArray(item) ? item : [item, undefined];
  univer.registerPlugin(plugin, options);
}

const univerAPI = FUniver.newAPI(univer);
univerAPI.createWorkbook(workbookData as Parameters<typeof univerAPI.createWorkbook>[0]);

/* ------------------------------------------------------------------ */
/* CELL_CONTENT 拦截器:渲染期把 customRender / markers 贴到视图格上      */
/* 证据:                                                               */
/*  - INTERCEPTOR_POINT.CELL_CONTENT: .pnpm/@univerjs+sheets@0.25.1(含 peer 后缀)      */
/*    …/@univerjs/sheets/lib/types/services/sheet-interceptor/interceptor-const.d.ts:18-23 */
/*  - SheetInterceptorService.intercept: 同目录 sheet-interceptor.service.d.ts:121   */
/*  - ICellInterceptor{effect}: node_modules/@univerjs/core/lib/types/common/interceptor.d.ts:27-34 */
/*  - effect=Style 时 getCellValueOnly 绕过本拦截器:node_modules/@univerjs/core/lib/types/sheets/worksheet.d.ts:263-276 */
/*  - 官方同款用法(data-validation-ui):                                     */
/*    .pnpm/@univerjs+sheets-data-validation-ui@0.25.1(含 peer 后缀)                */
/*    …/sheets-data-validation-ui/lib/es/index.js:1222-1301 */
/* ------------------------------------------------------------------ */

const injector = univer.__getInjector(); // univer.d.ts:81 __getInjector(): Injector
const sheetInterceptor = injector.get(SheetInterceptorService);

sheetInterceptor.intercept(INTERCEPTOR_POINT.CELL_CONTENT, {
  id: "lumio.spike.four-state-badge",
  effect: InterceptorEffectEnum.Style,
  handler: (cell, location, next) => {
    const lumio = (location.rawData?.custom as Record<string, unknown> | undefined)?.lumio as
      | Record<string, unknown>
      | undefined;
    if (!lumio) return next(cell);
    // 官方同款防御:cell 可能就是 rawData 本体,先浅拷贝再改
    if (!cell || cell === location.rawData) cell = { ...location.rawData };
    if (typeof lumio.badge === "string") {
      cell.customRender = [...(cell.customRender ?? []), badgeRender];
    }
    // markers 角标(备用机制演示):note 列第一行右下角画小三角
    if (lumio.state === "missing" && location.col === 3 && location.row === 1) {
      cell.markers = { ...cell.markers, br: { color: "#C5221F", size: 6 } };
    }
    return next(cell);
  },
});

/* ------------------------------------------------------------------ */
/* 复核面板:证明模型层 v 未被徽标污染,渲染层才出现 customRender/markers   */
/* ------------------------------------------------------------------ */

function dump() {
  // 面板走核心 Worksheet(facade FWorksheet 不暴露 getCell/getCellRaw):
  // IUniverInstanceService.getCurrentUnitOfType: instance.service.d.ts:69
  const sheet = injector
    .get(IUniverInstanceService)
    .getCurrentUnitOfType<import("@univerjs/core").Workbook>(UniverInstanceType.UNIVER_SHEET)
    ?.getSheetBySheetId(SHEET_ID) as Worksheet | undefined;
  if (!sheet) return "(no worksheet)";
  const lines: string[] = [];
  let pass = true;
  for (const row of [1, 2, 3, 4, 5]) {
    const raw = sheet.getCellRaw(row, 2); // worksheet.d.ts:277 getCellRaw(不经拦截器)
    const composed = sheet.getCell(row, 2); // worksheet.d.ts:262 getCell(经 CELL_CONTENT 组合)
    const state = (raw?.custom as Record<string, unknown> | undefined)?.lumio
      ? ((raw!.custom as Record<string, Record<string, unknown>>).lumio.state as string)
      : "value";
    if (raw && raw.v !== undefined && state !== "value" && state !== "default") {
      pass = false; // 四态中 missing/empty/null 三态的 v 必须不存在
    }
    lines.push(
      `r${row} [${String(state)}] ` +
        `模型层 v=${JSON.stringify(raw?.v ?? null)} | ` +
        `渲染层 customRender=${composed?.customRender ? `${composed.customRender.length} 个` : "无"}` +
        ` markers=${composed?.markers ? Object.keys(composed.markers).join("+") : "无"}`,
    );
  }
  lines.push("");
  lines.push(
    pass
      ? "PASS:missing/empty/null 三态模型层 v === null,徽标只存在于渲染层。"
      : "FAIL:四态格的 v 被污染,检查拦截器是否改写了 v。",
  );
  // 空串格显示:raw 序列化样例,直观看到 v/t 都不在
  const sample = sheet.getCellRaw(3, 2);
  lines.push(`样例(null 格 getCellRaw 序列化):${JSON.stringify(sample)}`);
  const el = document.getElementById("dump");
  if (el) el.textContent = lines.join("\n");
  return pass ? "PASS" : "FAIL";
}

document.getElementById("check")?.addEventListener("click", () => {
  const r = dump();
  const btn = document.getElementById("check");
  if (btn) btn.textContent = r === "PASS" ? "复核通过 ✓" : "复核失败 ✗";
});

setTimeout(dump, 400); // 等 skeleton 首帧渲染后输出

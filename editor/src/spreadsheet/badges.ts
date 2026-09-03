/**
 * ADR 0008 单一安装点:四态徽标与投影视觉的渲染扩展。
 *
 * 路线(与 editor/docs/spike/main.ts 同构,证据行号见 docs/four-state-render-spike.md):
 * 经 `SheetInterceptorService.intercept(INTERCEPTOR_POINT.CELL_CONTENT, { effect: Style })`
 * 在「视图组合结果」上追加 customRender / markers——模型层 `v` 与 token 不动,
 * 徽标 / 三角 / `!` / 占位文案一律不进 `v`(projection.roundtrip.test.ts 守卫)。
 *
 * 本文件负责的视觉(设计稿 §4/§6):
 * - 四态徽标:custom.lumio.badge 文本画在格子右下角,灰斜体;
 * - 脏格:custom.lumio.dirty → markers.tr 右上三角(#B7791F,§4 --color-dirty);
 * - 无效:custom.lumio.invalid → 右上 `!` 圆标(§4 --color-danger-text);与脏格互斥,无效优先;
 * - 首空行占位:custom.lumio.placeholder → 灰斜体占位文本(§3,不写 v);
 * - 列头 title:custom.lumio.headerTitle → 悬停 tooltip(默认值 / 范围 / 枚举 / 可见性)。
 *
 * 接线:安装点在 `createSheetsUniver`(spreadsheet/univer.ts,主 loop 接线)——
 * `installLumioBadges(univer)` 一行;升版时只有这一处要动(ADR 0008)。
 */

import {
  InterceptorEffectEnum,
  type ICellCustomRender,
  type Univer,
} from "@univerjs/core";
import {
  INTERCEPTOR_POINT,
  SheetInterceptorService,
} from "@univerjs/preset-sheets-core";

/** 装饰目标:拦截器收到的视图格(可变),字段与 ICellDataForSheetInterceptor 兼容。 */
export interface MutableViewCell {
  v?: unknown;
  customRender?: unknown[];
  markers?: Record<string, unknown>;
  [key: string]: unknown;
}

/** §4 语义色(spreadsheet 层允许字面色值,与 styles/tokens.css 同源)。 */
const BADGE_COLOR: Record<string, string> = {
  missing: "#9AA3B0",
  empty: "#9AA3B0",
  null: "#6A7280",
  default: "#9AA3B0",
};
const BADGE_COLOR_FALLBACK = "#9AA3B0";
/** 脏格右上三角:--color-dirty。 */
const DIRTY_MARKER = { color: "#B7791F", size: 6 } as const;
/** 无效 `!` 圆标:--color-danger-text。 */
const INVALID_COLOR = "#B3261E";
/** 占位文本:--color-text-faint。 */
const PLACEHOLDER_COLOR = "#9AA3B0";

const badgeRender: ICellCustomRender = {
  zIndex: 0,
  drawWith(ctx, info) {
    const lumio = readLumio(info.data);
    const badge = typeof lumio?.badge === "string" ? lumio.badge : null;
    if (!badge) {
      return;
    }
    const { endX, endY, startY } = info.primaryWithCoord;
    ctx.save();
    ctx.font = "italic 10px system-ui, sans-serif";
    ctx.fillStyle =
      (typeof lumio?.state === "string" ? BADGE_COLOR[lumio.state] : undefined) ??
      BADGE_COLOR_FALLBACK;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    // 右下角内缩 4px,基线压到格子底边上方 3px(与 spike demo 同口径)。
    ctx.fillText(badge, endX - 4, Math.min(endY - 3, startY + 14));
    ctx.restore();
  },
};

const invalidRender: ICellCustomRender = {
  zIndex: 1,
  drawWith(ctx, info) {
    const { endX, startY } = info.primaryWithCoord;
    ctx.save();
    // `!` 圆标:右上角 8px 圆 + 白色叹号(§4「无效=波浪下划线 + ! 圆标」)。
    const centerX = endX - 7;
    const centerY = startY + 7;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fillStyle = INVALID_COLOR;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", centerX, centerY + 0.5);
    ctx.restore();
  },
};

const placeholderRender: ICellCustomRender = {
  zIndex: 0,
  drawWith(ctx, info) {
    const lumio = readLumio(info.data);
    if (typeof lumio?.placeholder !== "string") {
      return;
    }
    // 一旦格子里有了真实值(v 非空),占位让位——占位永远只是渲染层提示。
    if (info.data?.v !== undefined && info.data?.v !== null && info.data?.v !== "") {
      return;
    }
    const { startX, endY } = info.primaryWithCoord;
    ctx.save();
    ctx.font = "italic 11px system-ui, sans-serif";
    ctx.fillStyle = PLACEHOLDER_COLOR;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(lumio.placeholder as string, startX + 4, endY - 3);
    ctx.restore();
  },
};

function tooltipEl(): HTMLDivElement {
  let el = document.querySelector<HTMLDivElement>("[data-lumio-badge-tooltip]");
  if (!el) {
    el = document.createElement("div");
    el.setAttribute("data-lumio-badge-tooltip", "");
    // 组件层色值只走 tokens.css 变量(硬红线约束同 panels/**)。
    el.style.cssText = [
      "position:fixed",
      "z-index:9999",
      "max-width:280px",
      "padding:6px 8px",
      "border-radius:4px",
      "background:var(--color-bg-surface)",
      "color:var(--color-text)",
      "border:1px solid var(--color-border)",
      "box-shadow:var(--shadow-menu)",
      "font:italic 11px system-ui, sans-serif",
      "pointer-events:none",
      "white-space:pre-wrap",
    ].join(";");
    document.body.appendChild(el);
  }
  return el;
}

const headerTitleRender: ICellCustomRender = {
  zIndex: 2,
  drawWith() {
    /* 列头 title 只做悬停提示,不画任何东西。 */
  },
  isHit(position, info) {
    const { startX, endX, startY, endY } = info.primaryWithCoord;
    return (
      position.x >= startX && position.x <= endX && position.y >= startY && position.y <= endY
    );
  },
  onPointerEnter(info, evt) {
    const lumio = readLumio(info.data);
    if (typeof lumio?.headerTitle !== "string") {
      return;
    }
    const event = evt as { clientX?: number; clientY?: number };
    const el = tooltipEl();
    el.textContent = lumio.headerTitle;
    const x = typeof event.clientX === "number" ? event.clientX + 10 : 0;
    const y = typeof event.clientY === "number" ? event.clientY + 12 : 0;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = "block";
  },
  onPointerLeave() {
    const el = document.querySelector<HTMLDivElement>("[data-lumio-badge-tooltip]");
    if (el) {
      el.style.display = "none";
    }
  },
};

function readLumio(data: unknown): Record<string, unknown> | undefined {
  const custom = (data as { custom?: unknown } | null | undefined)?.custom as
    | Record<string, unknown>
    | undefined;
  const lumio = custom?.lumio;
  return lumio && typeof lumio === "object" ? (lumio as Record<string, unknown>) : undefined;
}

/**
 * 纯装饰步骤(可单测):按 custom.lumio 的标记给视图格追加 customRender / markers。
 * 不改 v;无效优先于脏格三角(同格同时脏且无效时只画 `!`,§4 视觉不叠加)。
 */
export function decorateViewCell(cell: MutableViewCell, lumio: Record<string, unknown>): void {
  const append = (render: ICellCustomRender) => {
    cell.customRender = [...(cell.customRender ?? []), render];
  };
  if (lumio.invalid === true) {
    append(invalidRender);
  } else if (lumio.dirty === true) {
    cell.markers = { ...(cell.markers as Record<string, unknown> ?? {}), tr: { ...DIRTY_MARKER } };
  }
  if (typeof lumio.badge === "string") {
    append(badgeRender);
  }
  if (typeof lumio.placeholder === "string") {
    append(placeholderRender);
  }
  if (typeof lumio.headerTitle === "string") {
    append(headerTitleRender);
  }
}

/**
 * 安装渲染扩展(ADR 0008):在 CELL_CONTENT 上注册 effect: Style 拦截器。
 * 优先级取 8(< DATA_VALIDATION=9,见 InterceptCellContentPriority)。
 * 模型层 getCellRaw / 提取器不走本拦截器,effect: Style 让取值方整体绕过。
 */
export function installLumioBadges(univer: Univer): { dispose: () => void } {
  const interceptor = univer.__getInjector().get(SheetInterceptorService);
  const disposable = interceptor.intercept(INTERCEPTOR_POINT.CELL_CONTENT, {
    id: "lumio.badges.four-state",
    priority: 8,
    effect: InterceptorEffectEnum.Style,
    handler: (cell, location, next) => {
      const lumio = readLumio(location.rawData);
      if (!lumio) {
        return next(cell);
      }
      // 官方同款防御(data-validation 下拉图标同款路径):cell 可能就是 rawData
      // 本体,先浅拷贝再改,避免污染模型与 undo 栈。
      let view = cell;
      if (!view || view === location.rawData) {
        view = { ...location.rawData } as typeof cell;
      }
      decorateViewCell(view as MutableViewCell, lumio);
      return next(view);
    },
  });
  return {
    dispose() {
      disposable.dispose();
      document.querySelector("[data-lumio-badge-tooltip]")?.remove();
    },
  };
}

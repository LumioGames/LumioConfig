import { CommandType, ICommandService, type Injector } from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import { of } from "rxjs";
import {
  ContextMenuPosition,
  IMenuManagerService,
  MenuItemType,
  type IMenuButtonItem,
  type MenuSchemaType,
} from "@univerjs/preset-sheets-core";

import { FOUR_STATE_MENU, type FourStateKind } from "./fourState";

/**
 * 四态原生右键菜单(ADR 0004:四态四项以「单元格」分组注入原生 contextMenu,
 * 替代 App.tsx 自定义 four-state-menu)。
 *
 * 注入通道核实(0.25.1,详见 docs/univer-surface.md):
 * - `IMenuManagerService.mergeMenu(positionKey: {...})` 经 FUniver 的 protected
 *   `_injector` 取得 —— FUniver 未公开 injector 访问器
 *   (@univerjs/core/lib/types/facade/f-univer.d.ts:38),而 `Univer.__getInjector()`
 *   只在 Univer 实例上;此处走 `_injector` 接缝,升版需回归。
 * - preset 官方替代是 facade `univerAPI.createMenu(...).appendTo(...)`,但不支持
 *   disabled$/tooltip,无法满足「不可用项禁用并给 title」,故按 ADR 0004 用
 *   IMenuManagerService。
 */

export interface FourStateHandlers {
  empty(): void;
  null(): void;
  default(): void;
  missing(): void;
  /**
   * 可选可用性探测:菜单每次打开时调用,返回各 kind 是否可用(缺省视为全部
   * 可用,由 handler 侧兜底提示)。required / default 语义只有接线方
   * (App.tsx,主 loop 接线)知道,本层只负责渲染禁用态与 title。
   */
  availability?: () => Partial<Record<FourStateKind, boolean>>;
}

/** 禁用时的 title(任务书 Task 10 原文)。 */
export const FOUR_STATE_DISABLED_TITLE: Partial<Record<FourStateKind, string>> = {
  missing: "必填列不能设为缺列",
  default: "这一列没有默认值",
};

const FOUR_STATE_GROUP = "lumio.cell";
const FOUR_STATE_COMMAND_PREFIX = "lumio.four-state.";
/** Univer 菜单项渲染不支持 data-testid(实核 @univerjs/ui ContextMenuPanel),
 *  菜单打开后按按钮文本补盖 testid,供 E2E 与主 loop 接线验收使用。 */
const STAMP_SCAN_MS = 1500;
const STAMP_INTERVAL_MS = 120;

function stampFourStateTestids(availability: FourStateHandlers["availability"]): void {
  const labelToKind = new Map(FOUR_STATE_MENU.map((item) => [item.label, item.kind] as const));
  for (const button of Array.from(document.querySelectorAll("button"))) {
    const kind = labelToKind.get((button.textContent ?? "").trim());
    if (!kind || button.hasAttribute("data-lumio-four-state")) {
      continue;
    }
    button.setAttribute("data-lumio-four-state", kind);
    button.setAttribute("data-testid", `four-state-${kind}`);
    if (button.disabled) {
      const title = FOUR_STATE_DISABLED_TITLE[kind];
      if (title) {
        button.setAttribute("title", title);
      }
    }
  }
  // 右键后选区更新晚于菜单构建(menuItemFactory 构建时读到旧选区),构建期的
  // disabled$ 不可靠;菜单打开后的 stamp 轮询里按最新 availability 现场补盖
  // 禁用态与 title,点击 handler 侧仍会兜底校验。
  if (!availability) {
    return;
  }
  const current = availability();
  for (const [kind, available] of Object.entries(current) as Array<[FourStateKind, boolean]>) {
    const button = document.querySelector<HTMLButtonElement>(`[data-lumio-four-state="${kind}"]`);
    if (!button) {
      continue;
    }
    const disabled = !available;
    if (button.disabled !== disabled) {
      button.disabled = disabled;
    }
    const title = FOUR_STATE_DISABLED_TITLE[kind];
    if (disabled && title) {
      button.setAttribute("title", title);
    } else if (!disabled) {
      button.removeAttribute("title");
    }
  }
}

export function registerFourStateMenu(
  univerAPI: FUniver,
  handlers: FourStateHandlers,
): { dispose: () => void } {
  const injector = (univerAPI as unknown as { _injector?: Injector })._injector;
  if (!injector) {
    throw new Error("registerFourStateMenu: FUniver injector unavailable");
  }
  const menuManager = injector.get(IMenuManagerService);
  const commandService = injector.get(ICommandService);

  const disposables: Array<{ dispose(): void }> = [];
  const itemSchemas: Record<string, MenuSchemaType> = {};
  FOUR_STATE_MENU.forEach((item, index) => {
    const commandId = `${FOUR_STATE_COMMAND_PREFIX}${item.kind}`;
    disposables.push(
      commandService.registerCommand({
        id: commandId,
        type: CommandType.COMMAND,
        handler: () => {
          handlers[item.kind]();
          return true;
        },
      }),
    );
    itemSchemas[`four-state-${item.kind}`] = {
      order: index,
      menuItemFactory: (): IMenuButtonItem => {
        const available = handlers.availability?.()[item.kind] !== false;
        return {
          id: `four-state-${item.kind}`,
          type: MenuItemType.BUTTON,
          title: item.label,
          commandId,
          ...(available ? {} : { disabled$: of(true), tooltip: FOUR_STATE_DISABLED_TITLE[item.kind] }),
        };
      },
    };
  });

  // mergeMenu 源用「完整定位串做键」的单层结构:服务的递归下降会在
  // contextMenu 容器里找到同名键并深合并(runtime 实核 MenuManagerService.mergeMenu)。
  menuManager.mergeMenu({
    [ContextMenuPosition.MAIN_AREA]: {
      [FOUR_STATE_GROUP]: { order: 4, title: "单元格", ...itemSchemas },
    },
  });

  // 原生菜单在 contextmenu 后约 1~2 帧渲染;轮询补盖 data-testid。
  let stampTimer: ReturnType<typeof setTimeout> | null = null;
  let stamping = false;
  const onContextMenu = () => {
    if (stamping) {
      return;
    }
    stamping = true;
    const startedAt = Date.now();
    const tick = () => {
      stampFourStateTestids(handlers.availability);
      if (Date.now() - startedAt < STAMP_SCAN_MS) {
        stampTimer = setTimeout(tick, STAMP_INTERVAL_MS);
      } else {
        stamping = false;
      }
    };
    tick();
  };
  document.addEventListener("contextmenu", onContextMenu, true);

  return {
    dispose() {
      document.removeEventListener("contextmenu", onContextMenu, true);
      if (stampTimer) {
        clearTimeout(stampTimer);
      }
      for (const disposer of disposables) {
        disposer.dispose();
      }
      // mergeMenu 无对应撤销 API(实核 menu-manager.service.d.ts);菜单树条目
      // 随 univer.dispose() 一起消亡,切表重建实例即干净。
    },
  };
}

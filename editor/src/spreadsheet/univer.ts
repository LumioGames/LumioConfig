import {
  LocaleType,
  LogLevel,
  NilCommand,
  Univer,
  mergeLocales,
  type ILocales,
  type Plugin,
  type PluginCtor,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import {
  UniverSheetsCorePreset,
  IShortcutService,
  KeyCode,
  MetaKeys,
} from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import UniverPresetSheetsDataValidationZhCN from "@univerjs/preset-sheets-data-validation/locales/zh-CN";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import UniverPresetSheetsFilterZhCN from "@univerjs/preset-sheets-filter/locales/zh-CN";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import UniverPresetSheetsFindReplaceZhCN from "@univerjs/preset-sheets-find-replace/locales/zh-CN";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import UniverPresetSheetsSortZhCN from "@univerjs/preset-sheets-sort/locales/zh-CN";

import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";

import { COMMAND } from "./commands";
import { registerFourStateMenu, type FourStateHandlers } from "./menus";
import type { WorkbookData } from "./workbook-types";

type PresetPlugin = PluginCtor<Plugin> | [PluginCtor<Plugin>, unknown];

interface Preset {
  plugins: PresetPlugin[];
}

function createUniver(options: {
  locale: LocaleType;
  locales: ILocales;
  presets: Preset[];
}): { univer: Univer; univerAPI: FUniver } {
  const univer = new Univer({
    locale: options.locale,
    locales: options.locales,
    logLevel: LogLevel.WARN,
  });
  const registered = new Map<string, { plugin: PluginCtor<Plugin>; options?: unknown }>();
  for (const preset of options.presets) {
    for (const item of preset.plugins) {
      const [plugin, pluginOptions] = Array.isArray(item) ? item : [item, undefined];
      registered.set(plugin.pluginName, { plugin, options: pluginOptions });
    }
  }
  for (const { plugin, options: pluginOptions } of registered.values()) {
    univer.registerPlugin(plugin, pluginOptions);
  }
  return { univer, univerAPI: FUniver.newAPI(univer) };
}

export interface SheetsUniver {
  univer: Univer;
  univerAPI: FUniver;
  dispose: () => void;
}

/**
 * 设计稿 §3 / ADR 0004 的右键禁止项隐藏表。键为菜单项 id(Univer 内置
 * 菜单项 id = 命令 id),`hidden` 在每次菜单构建时经 MenuConfig 合并生效
 * (runtime 实核 @univerjs/ui MenuManagerService._buildMenuSchema)。
 * 字体 / 字号 / 加粗 / 颜色 / 边框 / 数字格式等禁止项只存在于工具栏,
 * 随 `toolbar: false` 一并消失;图表 / 透视 / 超链接 / 批注 / 图片 /
 * 条件格式对应 preset 未安装,天然不存在。核实结论见 docs/univer-surface.md。
 */
const HIDDEN_MENUS: Record<string, { hidden: boolean; disabled: boolean }> = {
  [COMMAND.merge]: { hidden: true, disabled: true },
  [COMMAND.mergeAll]: { hidden: true, disabled: true },
  [COMMAND.mergeVertical]: { hidden: true, disabled: true },
  [COMMAND.mergeHorizontal]: { hidden: true, disabled: true },
  [COMMAND.unmerge]: { hidden: true, disabled: true },
  [COMMAND.insertColBefore]: { hidden: true, disabled: true },
  [COMMAND.insertColAfter]: { hidden: true, disabled: true },
  [COMMAND.insertColByRange]: { hidden: true, disabled: true },
  [COMMAND.insertCol]: { hidden: true, disabled: true },
  [COMMAND.removeColConfirm]: { hidden: true, disabled: true },
  [COMMAND.removeColByRange]: { hidden: true, disabled: true },
  [COMMAND.removeCol]: { hidden: true, disabled: true },
  [COMMAND.confirmRemoveCol]: { hidden: true, disabled: true },
  [COMMAND.insertFunction]: { hidden: true, disabled: true },
  [COMMAND.moreFunctions]: { hidden: true, disabled: true },
  [COMMAND.pasteFormula]: { hidden: true, disabled: true },
};

/**
 * 快捷键中和表(「快捷键处找不到禁止项」):Ctrl+B/I/U、Ctrl+Shift+X
 * (删除线)与 Ctrl+Shift+7/8(数字格式)在 sheets-ui 注册为样式命令。
 * 用 Univer 官方冲突处理惯例——同绑定注册高优先级 NilCommand(runtime
 * 实核:@univerjs/core NilCommand = { id: "nil", handler: () => true },
 * zoom 快捷键即用此法压制浏览器默认行为)。
 */
const NEUTRALIZED_SHORTCUT_BINDINGS: number[] = [
  KeyCode.B | MetaKeys.CTRL_COMMAND,
  KeyCode.I | MetaKeys.CTRL_COMMAND,
  KeyCode.U | MetaKeys.CTRL_COMMAND,
  KeyCode.X | MetaKeys.SHIFT | MetaKeys.CTRL_COMMAND,
  KeyCode.Digit7 | MetaKeys.SHIFT | MetaKeys.CTRL_COMMAND,
  KeyCode.Digit8 | MetaKeys.SHIFT | MetaKeys.CTRL_COMMAND,
];

/** 配置面关不掉时的 CSS 兜底(ADR 0004;风险记录见 docs/univer-surface.md)。 */
const SURFACE_FALLBACK_CSS = [
  '[data-u-comp="ribbon-toolbar"]{display:none !important}',
  '[data-u-comp="formula-bar"]{display:none !important}',
].join("\n");

function trimForbiddenSurface(univer: Univer): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-lumio-surface", "trim");
  style.textContent = SURFACE_FALLBACK_CSS;
  document.head.appendChild(style);

  const shortcutService = univer.__getInjector().get(IShortcutService);
  const disposables = NEUTRALIZED_SHORTCUT_BINDINGS.map((binding) =>
    shortcutService.registerShortcut({
      id: NilCommand.id,
      binding,
      priority: 999,
      preconditions: () => true,
    }),
  );
  return () => {
    for (const disposer of disposables) {
      disposer.dispose();
    }
    style.remove();
  };
}

/** createSheetsUniver 的可选参数;App.tsx 传参由主 loop 接线(任务书 Task 10)。 */
export interface CreateSheetsUniverOptions {
  /** 四态原生右键菜单 handlers,不传则不注入「单元格」分组。 */
  fourState?: FourStateHandlers;
}

export function createSheetsUniver(
  container: HTMLElement,
  options?: CreateSheetsUniverOptions,
): SheetsUniver {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.ZH_CN,
    locales: {
      [LocaleType.ZH_CN]: mergeLocales(
        UniverPresetSheetsCoreZhCN,
        UniverPresetSheetsFilterZhCN,
        UniverPresetSheetsSortZhCN,
        UniverPresetSheetsDataValidationZhCN,
        UniverPresetSheetsFindReplaceZhCN,
      ),
    },
    presets: [
      UniverSheetsCorePreset({
        container,
        header: true,
        // ADR 0004:Univer 自带工具栏整体关闭,白名单动作由自建 32px 工具栏
        // 经 univerAPI.executeCommand 触发(命令 id 见 spreadsheet/commands.ts)。
        toolbar: false,
        formulaBar: false,
        contextMenu: true,
        footer: {
          sheetBar: false,
          statisticBar: true,
          menus: false,
          zoomSlider: false,
        },
        menu: HIDDEN_MENUS,
      }),
      UniverSheetsFilterPreset(),
      UniverSheetsSortPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsFindReplacePreset(),
    ],
  });

  const restoreSurface = trimForbiddenSurface(univer);
  const fourStateMenu = options?.fourState
    ? registerFourStateMenu(univerAPI, options.fourState)
    : undefined;

  return {
    univer,
    univerAPI,
    dispose() {
      fourStateMenu?.dispose();
      restoreSurface();
      univer.dispose();
    },
  };
}

export function loadWorkbook(univerAPI: FUniver, workbook: WorkbookData): void {
  univerAPI.createWorkbook(workbook as Parameters<FUniver["createWorkbook"]>[0]);
}

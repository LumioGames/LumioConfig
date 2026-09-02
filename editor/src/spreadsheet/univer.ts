import {
  LocaleType,
  LogLevel,
  Univer,
  mergeLocales,
  type ILocales,
  type Plugin,
  type PluginCtor,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
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

import { COMMAND } from "./interceptors";
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

const HIDDEN_MENUS: Record<string, { hidden: boolean; disabled: boolean }> = {
  [COMMAND.merge]: { hidden: true, disabled: true },
  [COMMAND.mergeAll]: { hidden: true, disabled: true },
  [COMMAND.mergeVertical]: { hidden: true, disabled: true },
  [COMMAND.mergeHorizontal]: { hidden: true, disabled: true },
  [COMMAND.insertColBefore]: { hidden: true, disabled: true },
  [COMMAND.insertFunction]: { hidden: true, disabled: true },
  [COMMAND.moreFunctions]: { hidden: true, disabled: true },
  [COMMAND.pasteFormula]: { hidden: true, disabled: true },
};

export function createSheetsUniver(container: HTMLElement): SheetsUniver {
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
        toolbar: true,
        formulaBar: false,
        contextMenu: true,
        footer: {
          sheetBar: false,
          statisticBar: true,
          menus: true,
          zoomSlider: true,
        },
        menu: HIDDEN_MENUS,
      }),
      UniverSheetsFilterPreset(),
      UniverSheetsSortPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsFindReplacePreset(),
    ],
  });

  return {
    univer,
    univerAPI,
    dispose() {
      univer.dispose();
    },
  };
}

export function loadWorkbook(univerAPI: FUniver, workbook: WorkbookData): void {
  univerAPI.createWorkbook(workbook as Parameters<FUniver["createWorkbook"]>[0]);
}

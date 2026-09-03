/**
 * Univer 命令 id 集中登记处(ADR 0004:白名单动作走自建工具栏,命令 id 从
 * interceptors.ts 抽出,升版时在此逐项回归)。
 *
 * 注释口径(锁版 @univerjs/* 0.25.1,实核于本仓 node_modules):
 * - `d.ts:<行号>` = 该 id 字面量直接写在 .d.ts 常量里,可直接引用;
 * - `runtime 实核:<包>` = 命令类在 d.ts 里声明,但 id 字面量在装饰器元数据里,
 *   d.ts 不含字面量,已对照该包 lib 产物的运行时代码核实。
 * 拦截器消费的禁止项 id 与白名单动作 id 混在同一张表里,分组见注释。
 */

export const COMMAND = {
  /** —— 白名单:全局动作(自建 32px 工具栏经 univerAPI.executeCommand 触发)—— */
  // @univerjs/core/lib/types/services/undoredo/undoredo.service.d.ts:75(UndoCommandId)
  undo: "univer.command.undo",
  // @univerjs/core/lib/types/services/undoredo/undoredo.service.d.ts:76(RedoCommandId)
  redo: "univer.command.redo",
  // @univerjs/ui/lib/types/services/clipboard/clipboard.command.d.ts:18(CutCommand;id 字面量 runtime 实核 @univerjs/ui/lib/es/index.js)
  cut: "univer.command.cut",
  // @univerjs/ui/lib/types/services/clipboard/clipboard.command.d.ts:17(CopyCommand;同上)
  copy: "univer.command.copy",
  // @univerjs/ui/lib/types/services/clipboard/clipboard.command.d.ts:19(PasteCommand;同上)
  paste: "univer.command.paste",
  // runtime 实核:@univerjs/preset-sheets-find-replace/lib/umd/index.js(OpenFindReplaceDialog)
  find: "ui.operation.open-find-dialog",
  // runtime 实核:@univerjs/preset-sheets-find-replace/lib/umd/index.js(OpenReplaceReplaceDialog 同族)
  replace: "ui.operation.open-replace-dialog",
  // runtime 实核:@univerjs/preset-sheets-filter/lib/umd/index.js(SmartToggleFilterCommand)
  filterToggle: "sheet.command.smart-toggle-filter",
  // runtime 实核:@univerjs/preset-sheets-filter/lib/umd/index.js(ClearFilterCriteriaCommand)
  filterClear: "sheet.command.clear-filter-criteria",
  // runtime 实核:@univerjs/preset-sheets-filter/lib/umd/index.js(RemoveSheetFilterCommand)
  filterRemove: "sheet.command.remove-sheet-filter",
  // runtime 实核:@univerjs/preset-sheets-sort/lib/umd/index.js(SortRangeAscendingCommand;右键 -ctx 变体同源)
  sortAsc: "sheet.command.sort-range-asc",
  // runtime 实核:@univerjs/preset-sheets-sort/lib/umd/index.js(SortRangeDescendingCommand)
  sortDesc: "sheet.command.sort-range-desc",
  // @univerjs/sheets/lib/types/commands/commands/set-frozen.command.d.ts:25(SetFrozenCommand;id 字面量 runtime 实核)
  freeze: "sheet.command.set-frozen",
  // @univerjs/sheets-ui/lib/types/commands/commands/set-zoom-ratio.command.d.ts(SetZoomRatioCommand;id 字面量 runtime 实核;four-state.spec 已在用)
  zoom: "sheet.command.set-zoom-ratio",

  /** —— 白名单:行操作(insertRow / deleteRow 全族;copyRow 为 lumio 复合操作,
   *    无独立 Univer id:insertRowAfter 发号新 draft key 后逐列 setRangeValues,
   *    见 App.tsx __lumioPoc.copyRow 与 interceptors.applyInsert)—— */
  insertRowBefore: "sheet.command.insert-row-before",
  insertRowAfter: "sheet.command.insert-row-after",
  insertRowByRange: "sheet.command.insert-row-by-range",
  removeRowConfirm: "sheet.command.remove-row-confirm",
  removeRowByRange: "sheet.command.remove-row-by-range",
  confirmRemoveRow: "sheet.confirm.remove-row",

  /** —— 数据写入(拦截器 / 桥)—— */
  setRangeValues: "sheet.command.set-range-values",
  setRangeValuesMutation: "sheet.mutation.set-range-values",

  /** —— 禁止项:合并(0-7 §4;menu 隐藏 + 拦截)—— */
  merge: "sheet.command.add-worksheet-merge",
  mergeAll: "sheet.command.add-worksheet-merge-all",
  mergeVertical: "sheet.command.add-worksheet-merge-vertical",
  mergeHorizontal: "sheet.command.add-worksheet-merge-horizontal",
  // runtime 实核:@univerjs/preset-sheets-core/lib/umd/index.js(RemoveWorksheetMergeCommand,右键「取消合并」)
  unmerge: "sheet.command.remove-worksheet-merge",

  /** —— 禁止项:插列 / 删列(0-7 §4;menu 隐藏 + 拦截)—— */
  insertColBefore: "sheet.command.insert-col-before",
  insertColAfter: "sheet.command.insert-col-after",
  insertColByRange: "sheet.command.insert-col-by-range",
  insertCol: "sheet.command.insert-col",
  removeColConfirm: "sheet.command.remove-col-confirm",
  removeColByRange: "sheet.command.remove-col-by-range",
  confirmRemoveCol: "sheet.confirm.remove-col",
  // runtime 实核:@univerjs/preset-sheets-core/lib/umd/index.js(RemoveColCommand,右键「删除选中列」族)
  removeCol: "sheet.command.remove-col",

  /** —— 禁止项:公式(0-7 §4;menu 隐藏 + 拦截)—— */
  insertFunction: "formula-ui.operation.insert-function",
  moreFunctions: "formula-ui.operation.more-functions",
  pasteFormula: "sheet.command.paste-formula",

  /** —— 粘贴族(拦截器剥公式;白名单允许值粘贴)—— */
  pasteNamed: "sheet.command.paste",
  pasteShortKey: "sheet.command.paste-by-short-key",
  pasteValue: "sheet.command.paste-value",
  pasteOptional: "sheet.command.optional-paste",
  pasteBesidesBorder: "sheet.command.paste-besides-border",

  /** —— 清空(拦截器转四态写入)—— */
  clearSelectionContent: "sheet.command.clear-selection-content",
  clearSelectionAll: "sheet.command.clear-selection-all",
  clearContent: "sheet.command.clear-selection",
  autoFill: "sheet.command.auto-fill",
} as const;

/**
 * 用户可见文案唯一来源(设计稿 §12 文案表 + §5 横幅文案 + §8 抽屉空态,ADR 0005)。
 * 键名英文、值中文;带参数的用函数。
 * copy.test.ts 用正则守卫:值里不得出现英文阶段名、autoCommit / autoExport、local.json、sha256: 全文。
 */
export const COPY = {
  /** §12:标题 `LumioConfig · skills`。 */
  title: (table: string) => `LumioConfig · ${table}`,
  /** §5 顶栏状态文案。 */
  phase: {
    opening: "正在打开…",
    readyClean: "与仓库一致",
    dirty: (n: number) => `${n} 格未提交`,
    savingDraft: "正在保存草稿…",
    validating: "正在预检…",
    readyToSubmit: "预检通过，可提交",
    submitting: "正在提交…",
    conflicted: (n: number) => `${n} 处冲突待处理`,
    stale: "仓库已更新，正在合并",
    failed: "提交失败",
    failedSchemaChanged: "表结构已变化",
    failedDraftConflict: "草稿已在别处更新",
    closed: "会话已结束",
    offline: "无法连接本机服务",
    reconnecting: "正在重新连接…",
  },
  /** §5/§12:状态条辅助文案。 */
  status: {
    noUncommitted: "无未提交改动",
    uncommittedMerges: (n: number) => `${n} 次合入未 commit`,
  },
  /** §5 横幅文案。 */
  banner: {
    conflicted: (n: number) => `合并遇到 ${n} 处冲突，请逐处处理后重新提交。`,
    stale: (n: number, revision: string | null) =>
      revision
        ? `仓库已更新（${revision}）。正在把你的 ${n} 处草稿改动合并到新底稿，草稿不会丢。`
        : `仓库已更新。正在把你的 ${n} 处草稿改动合并到新底稿，草稿不会丢。`,
    failedVcs: "提交失败：改动已合入表文件，但 commit 未完成。请在终端手动提交。",
    failedSchemaChanged: "这张表的结构已变化，需要刷新后重放草稿；草稿已保存。",
    failedDraftConflict: "另一个标签页保存了这张表的草稿。此页已停止编辑，刷新后接着改。",
    offline: "无法连接本机服务。请重新运行 serve，再打开新链接。",
    reconnecting: "与本机服务断开了，正在自动重连。若一直连不上，请回终端重新运行 serve。",
    closed: "会话已结束。请重新打开链接；若链接已失效，请重新运行 serve 后打开新链接。",
    /** §8 末段 J3:打开表时修订/指纹与上次看到的不同 → 蓝底横幅 + [知道了](ack 写 seen)。 */
    changedSinceSeen: "自你上次打开以来这张表已变化",
  },
  /** §5 横幅动作按钮。 */
  bannerActions: {
    refresh: "刷新",
    resolve: "处理冲突",
    cancelSubmit: "取消本次提交",
    retry: "重试",
    details: "查看详情",
    ack: "知道了",
  },
  /** §5 可用动作列的置灰 tooltip。 */
  tooltip: {
    nothingToValidate: "没有改动可预检",
    validateBeforeSubmit: "先预检通过",
    fingerprintCopy: "点击复制指纹全文",
  },
  /** M7-D:顶栏表名菜单里的源文件 / Schema 路径条目与复制 toast。 */
  paths: {
    sourceFile: (path: string) => `源文件 ${path}`,
    schemaFile: (path: string) => `Schema ${path}`,
    copied: "已复制路径",
  },
  /** §8 补丁页签目标行:`→ main · a10eb3f · 自动 commit`。 */
  patchTarget: (branch: string, sha: string, autoCommit: boolean) =>
    `→ ${branch} · ${sha}${autoCommit ? " · 自动 commit" : ""}`,
  /** §12 提交确认:仅当会 commit 或导表时弹出(ADR 0005),四种组合的句子。 */
  submitConfirm: (
    n: number,
    branch: string,
    sha: string,
    table: string,
    summary: string,
    autoCommit: boolean,
    autoExport: boolean,
  ): string => {
    const target = `将把 ${n} 处改动提交到 ${branch}（${sha}）`;
    const commit = `并以「config(${table}): ${summary}」自动 commit`;
    if (autoCommit && autoExport) return `${target}，${commit}，同时导出表文件。`;
    if (autoCommit) return `${target}，${commit}；不导表。`;
    if (autoExport) return `${target}，并导出表文件；不会自动 commit。`;
    return `${target}。`;
  },
  /** §12:autoCommit ☑ 行 + 设置对话框标题/第二项/关闭。 */
  settings: {
    title: "设置",
    autoCommitLabel: "提交后自动 commit 到当前分支",
    autoExportLabel: "提交后自动导表",
    savedToast: "已保存到本机设置",
    close: "关闭",
  },
  /** §10 表列表(侧栏)。 */
  sidebar: {
    ariaLabel: "表",
    searchPlaceholder: "搜索表",
    rowCount: (n: number) => `${n} 行`,
    collapse: "折叠表列表",
    expand: "展开表列表",
    conflictBadge: "冲突",
    conflictBadgeTitle: "有冲突待处理",
  },
  /** 表格区工具栏(原型 README「表格区工具栏」段)。 */
  toolbar: {
    ariaLabel: "表格工具",
    undo: "撤销",
    undoTitle: "撤销（Ctrl+Z）",
    redo: "重做",
    redoTitle: "重做（Ctrl+Y）",
    find: "查找",
    findTitle: "查找 / 替换（Ctrl+F / Ctrl+H）",
    filter: "筛选",
    filterTitle: "筛选（只影响视图）",
    sort: "排序",
    sortTitle: "视图排序（不写回行序）",
    sortAsc: "升序",
    sortDesc: "降序",
    freeze: "冻结",
    freezeTitle: "冻结首列 / 首行",
    insertRow: "新增行",
    insertRowTitle: "在下方插入行",
    copyRow: "复制行",
    copyRowTitle: "复制当前行为新行（取新草稿键）",
    deleteRow: "删除行",
    deleteRowTitle: "删除当前行（提交时生效）",
    zoom: "缩放",
    viewHint: (n: number) => `${n} 列 · 排序 / 筛选只影响视图`,
    notReady: "表格未就绪",
    notEditable: "当前状态不可编辑",
    noSelection: "先选中一个单元格",
    noBridge: "复制行暂不可用",
  },
  /** M7-E:表列表右键菜单(TableList)。 */
  tableMenu: {
    viewSource: "查看源文件",
    viewSchema: "查看 Schema",
    reveal: "在资源管理器中显示",
  },
  /** M7-E:源文件只读查看器(SourceViewDialog)。 */
  sourceView: {
    title: (path: string) => `${path}（只读）`,
    readOnlyNote: "只读快照。改这里不会改仓库；要改表请在表格里改，再提交补丁。",
    loading: "正在读取…",
    tooLarge: "文件太大，编辑器里不显示。请在编辑器外打开。",
    failed: "读取失败。",
    copyAll: "复制全文",
    copied: "已复制全文",
  },
  /** §12:首次打开 toast,不常驻。 */
  onboardingToast: "草稿会自动保存在本机，提交前不会写进仓库",
  /** §12:导出说明。 */
  exportNote: "单向生成物，不会导回仓库；输出到 build/export",
  /** §8 抽屉「导出」页签的标签(CSV/TSV、S/C/V 是格式/列组标识,非文案)。 */
  export: {
    tables: "表",
    format: "格式",
    source: "来源",
    sourceRepo: "仓库",
    sourceDraft: "含我的草稿",
    target: "目标列",
    targetAll: "全部",
    submit: "导出",
    /** M7-F:TXT 权威文本格式选项与两条说明(不做回导,ADR 0-1 §2)。 */
    formatTxt: "TXT（权威文本格式）",
    txtNote: "TXT 是源表格式的只读快照，不能拷回仓库覆盖。改表请在表格里改，再提交补丁。",
    txtDraftNote: "含未提交草稿，与仓库不一致。",
  },
  /** §12:required 列守卫。 */
  validation: {
    requiredMissingColumn: "必填列不能设为缺列",
    requiredNoDefault: (column: string) => `${column} 是必填列且没有默认值，Delete 不改动它`,
  },
  /** §12:右键菜单。 */
  cellMenu: {
    setNull: "设为 null ∅",
  },
  /** §3:表格首空行 name 格占位,只由渲染层画(不进 v / token);M7-C 其余为列头图例。 */
  grid: {
    placeholderNewRow: "在此输入名称新增一行…",
    visibilityLegend: "S 服务端 · C 客户端 · V 体素",
    visibilityLegendTitle: "列的可见性",
    visibilityLegendBody:
      "S 服务端：只进服务端投影。C 客户端：会进客户端包，未标 C 的列在客户端投影里物理不存在。V 体素：进体素投影。多字母（如 SCV）表示这一列同时进多端。某列第一次标 C 是披露变更，必须过生产激活单，不能只在表里改。",
    fullColumnName: (name: string) => `完整列名：${name}`,
  },
  /** M7-C:schema 类型字面量 → 中文名;未知类型的回落原字面量由消费方(Task 4)处理。 */
  columnType: {
    u32: "整数",
    i32: "整数",
    f32: "小数",
    f64: "小数",
    string: "文本",
    bool: "是否",
    ref: "引用",
  } as Record<string, string>,
  /** M7-C:可见性单字符 → 中文名;未知字符原样保留由消费方(Task 4)处理。 */
  visibility: {
    S: "服务端",
    C: "客户端",
    V: "体素",
  } as Record<string, string>,
  /** §6/§7:只读检查器文案。 */
  inspector: {
    emptyHint: "选中单元格后，此处显示详情",
    requiredTag: "必填",
    readonlyTag: "只读",
    stateLabels: {
      empty: "空字符串",
      null: "null ∅",
      default: "默认",
      missing: "缺列",
      value: "普通值",
    },
    currentValue: "当前值",
    baseline: "基线",
    revert: "还原",
    goToConflicts: "去冲突面板",
    deleteRulePrefix: "按 Delete 会落到：",
    rowStatus: {
      existing: "已有行",
      new: "新行",
      deleted: "已删行",
    },
    deleteRow: "删除行",
    undeleteRow: "撤销删除",
    close: "关闭",
    noDefaultReason: "这一列没有默认值",
    constraintTitle: "列约束",
    constraintLabels: {
      type: "类型",
      required: "必填",
      default: "默认值",
      enum: "枚举",
      range: "范围",
      visibility: "可见性",
      description: "描述",
    },
    constraintValues: {
      yes: "是",
      no: "否",
      none: "无",
    },
    invalid: {
      requiredMissing: "必填列不能是缺列",
      requiredMissingSuggestion: "填一个值，或改设为 null ∅",
      typeMismatch: "这一列需要数字",
      typeMismatchSuggestion: "改成数字再提交",
      boolMismatch: "这一列只能是 true 或 false",
      enumInvalid: "不在枚举选项内",
      enumInvalidSuggestion: "从下拉选项中选择",
      outOfRange: "数值超出允许范围",
      outOfRangeSuggestion: "改回允许范围内",
    },
  },
  /** §8 抽屉空态。 */
  drawer: {
    patchEmpty: "还没有改动…",
    errorsEmpty: {
      clean: "还没有改动",
      dirty: (n: number) => `有 ${n} 处改动（尚未预检）`,
      validated: "预检通过，没有发现问题",
    },
    /** §8 冲突页签:进度 / 三列 / 选项 / 底部动作;取消动作复用 bannerActions.cancelSubmit。 */
    conflict: {
      resolved: (n: number, m: number) => `已解决 ${n} / ${m}`,
      progressLabel: "冲突解决进度",
      colBase: "打开时",
      colCurrent: "仓库当前",
      colDraft: "我的草稿",
      pickRepo: "采仓库值",
      pickMine: "采我的值",
      pickInput: "手工输入",
      pickDefault: "恢复默认",
      pickNull: "设为 ∅",
      drop: "放弃我的改动",
      resubmit: "重新预检并提交",
      inputPlaceholder: "输入替换值，回车确认",
      jumpTitle: "在表格中定位",
    },
  },
} as const;

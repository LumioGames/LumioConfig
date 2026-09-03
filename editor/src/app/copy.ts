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
    closed: "会话已结束。请重新打开链接；若链接已失效，请重新运行 serve 后打开新链接。",
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
  /** §12:autoCommit ☑ 行。 */
  settings: {
    autoCommitLabel: "提交后自动 commit 到当前分支",
    savedToast: "已保存到本机设置",
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
  /** §12:首次打开 toast,不常驻。 */
  onboardingToast: "草稿会自动保存在本机，提交前不会写进仓库",
  /** §12:导出说明。 */
  exportNote: "单向生成物，不会导回仓库；输出到 build/export",
  /** §12:required 列守卫。 */
  validation: {
    requiredMissingColumn: "必填列不能设为缺列",
    requiredNoDefault: (column: string) => `${column} 是必填列且没有默认值，Delete 不改动它`,
  },
  /** §12:右键菜单。 */
  cellMenu: {
    setNull: "设为 null ∅",
  },
  /** §8 抽屉空态。 */
  drawer: {
    patchEmpty: "还没有改动…",
    errorsEmpty: {
      clean: "还没有改动",
      dirty: (n: number) => `有 ${n} 处改动（尚未预检）`,
      validated: "预检通过，没有发现问题",
    },
  },
} as const;

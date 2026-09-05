import { useState, type CSSProperties, type MouseEvent } from "react";
import { COPY } from "../app/copy";
import type { PhaseView, PhaseViewTone } from "../app/phaseView";
import { Button, Menu, useToast, type MenuItem } from "../components/ui";

/**
 * 顶栏(设计稿 §2、原型 README「顶栏」):42px,折叠按钮 · 品牌 / 表名 ⌄ · 修订 ·
 * 状态胶囊 · [导出] | [预检][提交补丁] · ⋯ · 检查器开关。
 * 样式全部走 tokens.css 变量(panels/** 不写字面色)。
 */

export interface TopBarRevision {
  vcs: string;
  id: string;
  branch: string | null;
}

export interface TopBarProps {
  tableName: string;
  /**
   * M7-D:仓库相对源文件 / Schema 路径(Host 下发 `tables/<name>.txt` /
   * `schemas/<name>.json`,POSIX 分隔符)。可选——宿主未接线时不渲染 ⌄ 路径菜单,
   * 表名按钮 title 退化为按表名推导,不显示绝对路径。
   */
  sourcePath?: string;
  schemaPath?: string;
  revision: TopBarRevision | null;
  view: PhaseView;
  dirtyCount: number;
  inspectorOpen: boolean;
  onToggleSidebar(): void;
  onOpenPalette(): void;
  onExport(): void;
  onValidate(): void;
  onSubmit(): void;
  onOpenSettings(): void;
  onOpenShortcuts(): void;
  onToggleInspector(): void;
}

/** 修订段:git → `分支 · 短 sha(7)`;svn → `r<id>`;none → 不显示(ADR 0005)。 */
function revisionText(revision: TopBarRevision | null): string | null {
  if (!revision || revision.vcs === "none") return null;
  if (revision.vcs === "svn") return `r${revision.id}`;
  const sha = revision.id.slice(0, 7);
  return revision.branch ? `${revision.branch} · ${sha}` : sha;
}

/**
 * 英文阶段名只允许出现在状态胶囊的 title / data-phase 属性(设计稿 §5 口径)。
 * PhaseView 只携带中文 label,这里按 label 反查;静态文案精确匹配,
 * 带参数的两条(N 格未提交 / N 处冲突待处理)用数字正则。
 * Failed 三种 failKind 的 label 各自不同,但枚举值同为 "Failed"。
 */
const STATIC_PHASE_NAMES: ReadonlyArray<readonly [string, string]> = [
  [COPY.phase.opening, "Opening"],
  [COPY.phase.readyClean, "ReadyClean"],
  [COPY.phase.savingDraft, "SavingDraft"],
  [COPY.phase.validating, "Validating"],
  [COPY.phase.readyToSubmit, "ReadyToSubmit"],
  [COPY.phase.submitting, "Submitting"],
  [COPY.phase.stale, "Stale"],
  [COPY.phase.failed, "Failed"],
  [COPY.phase.failedSchemaChanged, "Failed"],
  [COPY.phase.failedDraftConflict, "Failed"],
  [COPY.phase.closed, "Closed"],
  [COPY.phase.offline, "Offline"],
  // QA P2-5:「正在重新连接…」是掉线叠加态的重连变体(§5 同一行),枚举值仍 Offline。
  [COPY.phase.reconnecting, "Offline"],
];
const NUMBERED_PHASE_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\d+ 格未提交$/, "ReadyDirty"],
  [/^\d+ 处冲突待处理$/, "Conflicted"],
];

export function phaseNameOf(view: PhaseView): string {
  for (const [label, name] of STATIC_PHASE_NAMES) {
    if (view.label === label) return name;
  }
  for (const [pattern, name] of NUMBERED_PHASE_NAMES) {
    if (pattern.test(view.label)) return name;
  }
  return "Unknown";
}

const TONE_COLORS: Record<PhaseViewTone, { fg: string; bg: string }> = {
  gray: { fg: "var(--color-text-muted)", bg: "var(--color-bg-app)" },
  green: { fg: "var(--color-accent)", bg: "var(--color-accent-bg)" },
  amber: { fg: "var(--color-dirty)", bg: "var(--color-dirty-bg)" },
  blue: { fg: "var(--color-new)", bg: "var(--color-new-bg)" },
  purple: { fg: "var(--color-conflict)", bg: "var(--color-conflict-bg)" },
  red: { fg: "var(--color-danger-text)", bg: "var(--color-danger-bg)" },
};

const SPIN_KEYFRAMES = "@keyframes lumio-pill-spin { to { transform: rotate(360deg); } }";

const BAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 42,
  padding: "0 10px",
  background: "var(--color-bg-surface)",
  borderBottom: "1px solid var(--color-border)",
  flex: "0 0 auto",
};

const ICON_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  border: 0,
  borderRadius: "var(--radius-4)",
  background: "transparent",
  color: "var(--color-text-muted)",
  cursor: "pointer",
};

const BRAND_STYLE: CSSProperties = {
  fontSize: "var(--font-size-13)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
  margin: 0,
  display: "inline-flex",
  alignItems: "center",
};

const SLASH_STYLE: CSSProperties = {
  color: "var(--color-text-faint)",
};

const REVISION_STYLE: CSSProperties = {
  fontSize: "var(--font-size-12)",
  color: "var(--color-text-muted)",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const PILL_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 24,
  padding: "0 10px",
  borderRadius: "var(--radius-12)",
  fontSize: "var(--font-size-12)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const DOT_STYLE: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "currentColor",
  flex: "0 0 auto",
};

const SPIN_STYLE: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  borderTop: "1.5px solid currentColor",
  borderRight: "1.5px solid transparent",
  borderBottom: "1.5px solid transparent",
  borderLeft: "1.5px solid transparent",
  animation: "lumio-pill-spin 0.9s linear infinite",
  flex: "0 0 auto",
};

const ACTION_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 28,
  padding: "0 10px",
  borderRadius: "var(--radius-4)",
  fontSize: "var(--font-size-12)",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const DIVIDER_STYLE: CSSProperties = {
  width: 1,
  height: 18,
  background: "var(--color-border)",
  flex: "0 0 auto",
};

/** 表名旁 ⌄ 路径菜单触发钮(M7-D):与表名视觉成组,只承载菜单开合。 */
const TABLE_MENU_TRIGGER_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 26,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "var(--color-text-muted)",
  cursor: "pointer",
};

function IconSidebar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12.5" cy="8" r="1.2" />
    </svg>
  );
}

function IconPanel() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3v10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function TopBar({
  tableName,
  sourcePath,
  schemaPath,
  revision,
  view,
  dirtyCount,
  inspectorOpen,
  onToggleSidebar,
  onOpenPalette,
  onExport,
  onValidate,
  onSubmit,
  onOpenSettings,
  onOpenShortcuts,
  onToggleInspector,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [tableMenuAnchor, setTableMenuAnchor] = useState({ x: 0, y: 0 });
  const push = useToast();
  const revisionLabel = revisionText(revision);
  const tone = TONE_COLORS[view.tone];
  const phaseName = phaseNameOf(view);

  /**
   * M7-D S04:status-table 的 title 是需求的原始落点(已接线,见 StatusBar);
   * 表名按钮的 title 是同一口径的第二悬浮点。优先用 Host 下发的 sourcePath,
   * 未接线时按表名推导,口径 `<表名> · tables/<表名>.txt`。
   */
  const sourceLabel = sourcePath ?? `tables/${tableName}.txt`;
  /** M7-D:⌄ 菜单的两条只读路径条目,单独成组(group 空串:若日后前置切表项,自动出现组分隔)。 */
  const pathMenuItems: MenuItem[] = [];
  if (sourcePath) {
    pathMenuItems.push({
      id: "source-path",
      group: "",
      label: COPY.paths.sourceFile(sourcePath),
      onSelect: () => copyPath(sourcePath),
    });
  }
  if (schemaPath) {
    pathMenuItems.push({
      id: "schema-path",
      group: "",
      label: COPY.paths.schemaFile(schemaPath),
      onSelect: () => copyPath(schemaPath),
    });
  }
  const hasPaths = pathMenuItems.length > 0;

  function openMoreMenu(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuAnchor({ x: rect.right, y: rect.bottom + 4 });
    setMenuOpen(true);
  }

  function openTableMenu(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTableMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
    setTableMenuOpen(true);
  }

  /** M7-D:复制路径 + toast,与 StatusBar 指纹复制同款交互。 */
  function copyPath(path: string) {
    void navigator.clipboard.writeText(path).then(() => {
      push(COPY.paths.copied);
    });
  }

  return (
    <header className="top-bar" data-testid="top-bar" data-dirty-count={dirtyCount} style={BAR_STYLE}>
      <style>{SPIN_KEYFRAMES}</style>
      <button
        type="button"
        data-testid="topbar-sidebar"
        aria-label="折叠表列表"
        title="折叠表列表"
        style={ICON_BUTTON_STYLE}
        onClick={onToggleSidebar}
      >
        <IconSidebar />
      </button>
      <h1 style={BRAND_STYLE}>LumioConfig</h1>
      <span aria-hidden="true" style={SLASH_STYLE}>
        /
      </span>
      <button
        type="button"
        data-testid="topbar-table"
        title={`${tableName} · ${sourceLabel}`}
        style={{
          ...ACTION_BUTTON_STYLE,
          border: 0,
          background: "transparent",
          padding: "0 4px",
          fontSize: "var(--font-size-14)",
          fontWeight: 600,
          color: "var(--color-text)",
        }}
        onClick={onOpenPalette}
      >
        {tableName}
      </button>
      {hasPaths ? (
        <button
          type="button"
          data-testid="topbar-table-menu"
          aria-haspopup="menu"
          aria-expanded={tableMenuOpen}
          style={TABLE_MENU_TRIGGER_STYLE}
          onClick={openTableMenu}
        >
          <IconChevronDown />
        </button>
      ) : null}
      {hasPaths ? (
        <Menu
          open={tableMenuOpen}
          anchor={tableMenuAnchor}
          onClose={() => setTableMenuOpen(false)}
          items={pathMenuItems}
        />
      ) : null}
      {revisionLabel ? (
        <span data-testid="top-revision" title={revision ? revision.id : undefined} style={REVISION_STYLE}>
          {revisionLabel}
        </span>
      ) : null}
      <span style={{ flex: "1 1 0" }} aria-hidden="true" />
      <span
        data-testid="status-phase"
        data-phase={phaseName}
        data-tone={view.tone}
        title={phaseName}
        style={{ ...PILL_STYLE, color: tone.fg, background: tone.bg }}
      >
        {view.spin ? (
          <span aria-hidden="true" style={SPIN_STYLE} />
        ) : (
          <span aria-hidden="true" style={DOT_STYLE} />
        )}
        {view.label}
      </span>
      <span style={{ flex: "1 1 0" }} aria-hidden="true" />
      <Button
        data-testid="btn-export-top"
        disabled={!view.can.export}
        onClick={onExport}
        style={{
          ...ACTION_BUTTON_STYLE,
          border: "1px solid var(--color-accent-border)",
          background: "var(--color-accent-bg)",
          color: "var(--color-accent)",
          fontWeight: 600,
        }}
      >
        <IconDownload />
        导出
      </Button>
      <span aria-hidden="true" style={DIVIDER_STYLE} />
      <Button
        data-testid="btn-validate"
        disabled={!view.can.validate}
        disabledReason={!view.can.validate ? COPY.tooltip.nothingToValidate : undefined}
        onClick={onValidate}
        style={{
          ...ACTION_BUTTON_STYLE,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-surface)",
          color: "var(--color-text)",
          fontWeight: 500,
        }}
      >
        预检
      </Button>
      <Button
        data-testid="btn-submit"
        disabled={!view.can.submit}
        disabledReason={!view.can.submit ? COPY.tooltip.validateBeforeSubmit : undefined}
        onClick={onSubmit}
        style={{
          ...ACTION_BUTTON_STYLE,
          border: "1px solid var(--color-accent)",
          background: "var(--color-accent)",
          color: "var(--color-bg-surface)",
          fontWeight: 600,
        }}
      >
        提交补丁
      </Button>
      <Button
        data-testid="topbar-more"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={openMoreMenu}
        style={ICON_BUTTON_STYLE}
      >
        <IconMore />
      </Button>
      <Menu
        open={menuOpen}
        anchor={menuAnchor}
        onClose={() => setMenuOpen(false)}
        items={[
          { id: "palette", label: "命令面板", shortcut: "Ctrl+K", onSelect: onOpenPalette },
          { id: "settings", label: "设置", onSelect: onOpenSettings },
          { id: "shortcuts", label: "快捷键", onSelect: onOpenShortcuts },
        ]}
      />
      <Button
        data-testid="topbar-inspector"
        aria-label="检查器"
        aria-pressed={inspectorOpen}
        onClick={onToggleInspector}
        style={{
          ...ICON_BUTTON_STYLE,
          color: inspectorOpen ? "var(--color-accent)" : "var(--color-text-muted)",
        }}
      >
        <IconPanel />
      </Button>
    </header>
  );
}

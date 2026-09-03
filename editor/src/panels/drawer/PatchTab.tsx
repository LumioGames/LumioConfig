import type { CSSProperties } from "react";
import type { SubmitResult } from "../../api/draftSession";
import type { PatchObject, PatchOp } from "../../api/types";
import { COPY } from "../../app/copy";

/**
 * 抽屉「补丁」页签(设计稿 §8「补丁」、原型 README「抽屉」段):人话摘要 + 目标行、
 * 按行分组卡(更新/新增/改名/删除色标)、update 逐列 expect → set、每项点击跳格、
 * 空态、提交后顶部结果卡(新指纹 8 位裸 hex、assignedIds、vcs、export)。
 *
 * onJump(row, column) 的 row 是分组的 1 基序号(= groupPatch(patch) 下标 + 1):
 * App 接线时用同一个导出的 groupPatch 还原 ops 顺序,再经 rowKey → setActiveRange +
 * scrollToCell 完成跳格(Task 17 DiffTab 复用同一分组与 onJump 模式)。
 *
 * 简报口径 patch: Patch;实作接受 PatchObject | null(null 或空 ops 且无结果卡时进空态,
 * DiffPreview 先例)。App 接线负责把开合/页签记 viewState、在提交成功后传入 result。
 */
export interface PatchTabTarget {
  branch: string | null;
  sha: string;
  autoCommit: boolean;
  autoExport: boolean;
}

export interface PatchTabProps {
  patch: PatchObject | null;
  summary: string;
  target: PatchTabTarget;
  result: SubmitResult | null;
  onJump(row: number, column: string): void;
}

export interface PatchLine {
  column: string;
  from: string;
  to: string;
}

export interface PatchGroup {
  /** patch.ops 下标(0 基);onJump 传 index + 1。 */
  index: number;
  kind: PatchOp["op"];
  name: string;
  lines: PatchLine[];
}

/** 把 buildPatch 的 ops 整理成渲染分组(update 逐列 expect → set;rename 名字进卡头)。 */
export function groupPatch(patch: PatchObject | null): PatchGroup[] {
  return (patch?.ops ?? []).map((op, index) => {
    if (op.op === "rename") {
      return { index, kind: op.op, name: `${op.name} → ${op.to ?? ""}`, lines: [] };
    }
    if (op.op === "create") {
      const lines = Object.entries(op.set ?? {}).map(([column, value]) => ({
        column,
        from: op.expect?.[column] ?? "",
        to: String(value),
      }));
      return { index, kind: op.op, name: op.name, lines };
    }
    if (op.op === "delete") {
      return { index, kind: op.op, name: op.name, lines: [] };
    }
    const columns = new Set([...Object.keys(op.set ?? {}), ...Object.keys(op.expect ?? {})]);
    const lines: PatchLine[] = [];
    for (const column of columns) {
      lines.push({
        column,
        from: op.expect?.[column] ?? "",
        to: column in (op.set ?? {}) ? String(op.set?.[column]) : "",
      });
    }
    return { index, kind: op.op, name: op.name, lines };
  });
}

/** 色标(§8):更新琥珀 / 新增蓝 / 改名灰 / 删除红,一律 tokens.css 变量。 */
const KIND_STYLE: Record<PatchOp["op"], { label: string; fg: string; bg: string }> = {
  update: { label: "更新", fg: "var(--color-dirty)", bg: "var(--color-dirty-bg)" },
  create: { label: "新增", fg: "var(--color-new)", bg: "var(--color-new-bg)" },
  rename: { label: "改名", fg: "var(--color-text-muted)", bg: "var(--color-border-subtle)" },
  delete: { label: "删除", fg: "var(--color-danger-text)", bg: "var(--color-danger-bg)" },
};

const ROOT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const SUMMARY_STYLE: CSSProperties = { fontWeight: 600, fontSize: "var(--font-size-13)" };

const TARGET_STYLE: CSSProperties = { color: "var(--color-text-muted)", fontSize: "var(--font-size-12)" };

const EMPTY_STYLE: CSSProperties = {
  // a11y:faint 对白底 ≈2.6:1,空态正文用 muted(≥4.5:1)。
  color: "var(--color-text-muted)",
  padding: "16px 0",
  textAlign: "center",
  fontSize: "var(--font-size-12)",
};

const CARD_STYLE: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-4)",
  overflow: "hidden",
};

const CARD_HEAD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 8px",
  border: 0,
  background: "var(--color-bg-app)",
  cursor: "pointer",
  textAlign: "left",
};

const KIND_PILL_BASE: CSSProperties = {
  fontSize: "var(--font-size-10)",
  lineHeight: "16px",
  padding: "0 5px",
  borderRadius: 3,
  fontWeight: 600,
};

const CARD_NAME_STYLE: CSSProperties = { fontWeight: 600, fontFamily: "var(--font-mono)" };

const CARD_META_STYLE: CSSProperties = {
  color: "var(--color-text-faint)",
  fontSize: "var(--font-size-11)",
};

const LINE_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: 8,
  width: "100%",
  padding: "3px 8px 3px 30px",
  border: 0,
  borderTop: "1px solid var(--color-border-subtle)",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "var(--font-size-12)",
};

const LINE_COLUMN_STYLE: CSSProperties = {
  color: "var(--color-text-muted)",
  fontFamily: "var(--font-mono)",
};

const LINE_VALUES_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  display: "flex",
  gap: 6,
  alignItems: "center",
  minWidth: 0,
};

const LINE_FROM_STYLE: CSSProperties = {
  color: "var(--color-text-faint)",
  textDecoration: "line-through",
};

const LINE_ARROW_STYLE: CSSProperties = { color: "var(--color-text-faint)" };

const LINE_TO_STYLE: CSSProperties = { fontWeight: 600 };

const RESULT_STYLE: CSSProperties = {
  border: "1px solid var(--color-accent-border)",
  background: "var(--color-accent-bg)",
  borderRadius: "var(--radius-4)",
  padding: "8px 10px",
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "3px 12px",
  fontSize: "var(--font-size-12)",
};

const RESULT_TITLE_STYLE: CSSProperties = {
  gridColumn: "1 / -1",
  fontWeight: 600,
  color: "var(--color-accent)",
};

const RESULT_LABEL_STYLE: CSSProperties = { color: "var(--color-text-muted)" };

const MONO_STYLE: CSSProperties = { fontFamily: "var(--font-mono)" };

/** 指纹显示 8 位裸 hex(去掉 sha256: 前缀,StatusBar 先例);title 保留全文。 */
function bareFingerprint(fingerprint: string): string {
  return fingerprint.replace(/^sha256:/, "").slice(0, 8);
}

function ResultCard({ result }: { result: NonNullable<SubmitResult["result"]> }) {
  const assigned = Object.entries(result.assignedIds ?? {})
    .map(([draftKey, id]) => `${draftKey} → ${id}`)
    .join("、");
  const vcs =
    result.vcs && result.vcs.action && result.vcs.action !== "none"
      ? `${result.vcs.branch ? `${result.vcs.branch} · ` : ""}${result.vcs.action} ${result.vcs.id.slice(0, 7)}`
      : "—";
  const exported = result.export ? `${result.export.files} 个文件 → ${result.export.outDir}` : "—";
  return (
    <div data-testid="submit-result" style={RESULT_STYLE}>
      <span style={RESULT_TITLE_STYLE}>已提交</span>
      <span style={RESULT_LABEL_STYLE}>新底稿指纹</span>
      <span style={MONO_STYLE} title={result.sourceFingerprint}>
        {bareFingerprint(result.sourceFingerprint)}
      </span>
      <span style={RESULT_LABEL_STYLE}>发号</span>
      <span style={MONO_STYLE}>{assigned || "—"}</span>
      <span style={RESULT_LABEL_STYLE}>版本库</span>
      <span>{vcs}</span>
      <span style={RESULT_LABEL_STYLE}>导表</span>
      <span>{exported}</span>
    </div>
  );
}

export function PatchTab({ patch, summary, target, result, onJump }: PatchTabProps) {
  const groups = groupPatch(patch);
  const submitResult = result?.result ?? null;
  return (
    <div style={ROOT_STYLE}>
      {submitResult ? <ResultCard result={submitResult} /> : null}
      {groups.length === 0 && !submitResult ? <p style={EMPTY_STYLE}>{COPY.drawer.patchEmpty}</p> : null}
      {groups.length > 0 ? (
        <div style={HEADER_STYLE}>
          <span data-testid="diff-summary" style={SUMMARY_STYLE}>
            {summary}
          </span>
          <span data-testid="diff-target" style={TARGET_STYLE}>
            {target.branch ? COPY.patchTarget(target.branch, target.sha, target.autoCommit) : `→ ${target.sha}`}
          </span>
        </div>
      ) : null}
      {groups.map((group) => {
        const kind = KIND_STYLE[group.kind];
        const meta =
          group.kind === "update"
            ? `${group.lines.length} 格`
            : group.kind === "create"
              ? "合入时发号"
              : group.kind === "delete"
                ? "合入后登记墓碑"
                : "";
        return (
          <div
            key={`${group.index}-${group.kind}-${group.name}`}
            style={CARD_STYLE}
          >
            <button type="button" style={CARD_HEAD_STYLE} onClick={() => onJump(group.index + 1, "name")}>
              <span style={{ ...KIND_PILL_BASE, background: kind.bg, color: kind.fg }}>{kind.label}</span>
              <span style={CARD_NAME_STYLE}>{group.name}</span>
              {meta ? <span style={CARD_META_STYLE}>{meta}</span> : null}
            </button>
            {group.lines.map((line) => (
              <button
                key={line.column}
                type="button"
                title="跳到此格"
                style={LINE_STYLE}
                onClick={() => onJump(group.index + 1, line.column)}
              >
                <span style={LINE_COLUMN_STYLE}>{line.column}</span>
                <span style={LINE_VALUES_STYLE}>
                  {line.from ? <span style={LINE_FROM_STYLE}>{line.from}</span> : null}
                  <span style={LINE_ARROW_STYLE}>→</span>
                  <span style={LINE_TO_STYLE}>{line.to}</span>
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

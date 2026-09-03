import { COPY } from "./copy";
import type { EditorState } from "./state";

/** 设计稿 §5:状态胶囊色。 */
export type PhaseViewTone = "gray" | "green" | "amber" | "blue" | "purple" | "red";

/** 设计稿 §5:横幅动作的分派目标。 */
export type PhaseViewBannerActionKind = "refresh" | "resolve" | "cancel" | "retry" | "details" | "ack";

export interface PhaseViewBannerAction {
  label: string;
  action: PhaseViewBannerActionKind;
}

export interface PhaseViewBanner {
  text: string;
  actions: Array<PhaseViewBannerAction>;
}

export interface PhaseView {
  label: string;
  tone: PhaseViewTone;
  spin: boolean;
  banner?: PhaseViewBanner;
  gridLocked: boolean;
  can: { edit: boolean; validate: boolean; submit: boolean; export: boolean };
}

/** `/api/session` 的修订信息(ADR 0005:git → 分支 · 短 sha;svn → r<id>;none → 不显示)。 */
export interface PhaseViewRevision {
  vcs: string;
  id: string;
  branch: string;
}

/**
 * EditorState 不携带的派生上下文:
 * - `revision`:Stale 横幅「仓库已更新(main · sha)」的修订段;
 * - `conflictCount`:Conflicted 的「N 处冲突待处理」计数(缺省回退 dirtyCount)。
 */
export interface PhaseViewContext {
  revision?: PhaseViewRevision | null;
  conflictCount?: number;
}

const NO_CAN: PhaseView["can"] = { edit: false, validate: false, submit: false, export: false };

function revisionLabel(revision: PhaseViewRevision | null | undefined): string | null {
  if (!revision || revision.vcs === "none") return null;
  if (revision.vcs === "svn") return `r${revision.id}`;
  const sha = revision.id.slice(0, 8);
  return revision.branch ? `${revision.branch} · ${sha}` : sha;
}

/**
 * 会话状态 → 界面派生层,逐行等于设计稿 §5 状态表(ADR 0005)。
 * `online === false` 是叠加在任一阶段上的派生态,优先于阶段分派。
 */
export function phaseView(state: EditorState, context?: PhaseViewContext): PhaseView {
  if (!state.online) {
    return {
      label: COPY.phase.offline,
      tone: "red",
      spin: false,
      banner: { text: COPY.banner.offline, actions: [] },
      gridLocked: true,
      can: { ...NO_CAN },
    };
  }
  switch (state.phase) {
    case "Opening":
      return { label: COPY.phase.opening, tone: "gray", spin: true, gridLocked: true, can: { ...NO_CAN } };
    case "ReadyClean":
      return {
        label: COPY.phase.readyClean,
        tone: "green",
        spin: false,
        gridLocked: false,
        can: { edit: true, validate: false, submit: false, export: true },
      };
    case "ReadyDirty":
      return {
        label: COPY.phase.dirty(state.dirtyCount),
        tone: "amber",
        spin: false,
        gridLocked: false,
        can: { edit: true, validate: state.dirtyCount > 0, submit: false, export: true },
      };
    case "SavingDraft":
      return {
        label: COPY.phase.savingDraft,
        tone: "gray",
        spin: true,
        gridLocked: false,
        can: { edit: true, validate: state.dirtyCount > 0, submit: false, export: true },
      };
    case "Validating":
      return {
        label: COPY.phase.validating,
        tone: "gray",
        spin: true,
        gridLocked: true,
        can: { edit: false, validate: false, submit: false, export: true },
      };
    case "ReadyToSubmit":
      return {
        label: COPY.phase.readyToSubmit,
        tone: "green",
        spin: false,
        gridLocked: false,
        can: { edit: true, validate: state.dirtyCount > 0, submit: true, export: false },
      };
    case "Submitting":
      return { label: COPY.phase.submitting, tone: "gray", spin: true, gridLocked: true, can: { ...NO_CAN } };
    case "Conflicted": {
      const conflicts = context?.conflictCount ?? state.dirtyCount;
      return {
        label: COPY.phase.conflicted(conflicts),
        tone: "purple",
        spin: false,
        banner: {
          text: COPY.banner.conflicted(conflicts),
          actions: [
            { label: COPY.bannerActions.resolve, action: "resolve" },
            { label: COPY.bannerActions.cancelSubmit, action: "cancel" },
          ],
        },
        gridLocked: true,
        can: { ...NO_CAN },
      };
    }
    case "Stale":
      return {
        label: COPY.phase.stale,
        tone: "blue",
        spin: true,
        banner: { text: COPY.banner.stale(state.dirtyCount, revisionLabel(context?.revision)), actions: [] },
        gridLocked: true,
        can: { ...NO_CAN },
      };
    case "Failed":
      switch (state.failKind) {
        case "VCS":
          return {
            label: COPY.phase.failed,
            tone: "red",
            spin: false,
            banner: {
              text: COPY.banner.failedVcs,
              actions: [
                { label: COPY.bannerActions.details, action: "details" },
                { label: COPY.bannerActions.retry, action: "retry" },
              ],
            },
            gridLocked: true,
            can: { ...NO_CAN },
          };
        case "SCHEMA_CHANGED":
          return {
            label: COPY.phase.failedSchemaChanged,
            tone: "red",
            spin: false,
            banner: {
              text: COPY.banner.failedSchemaChanged,
              actions: [{ label: COPY.bannerActions.refresh, action: "refresh" }],
            },
            gridLocked: true,
            can: { ...NO_CAN },
          };
        case "DRAFT_VERSION_CONFLICT":
          return {
            label: COPY.phase.failedDraftConflict,
            tone: "red",
            spin: false,
            banner: {
              text: COPY.banner.failedDraftConflict,
              actions: [{ label: COPY.bannerActions.refresh, action: "refresh" }],
            },
            gridLocked: true,
            can: { ...NO_CAN },
          };
        default:
          // 未归类失败:§5 无此行,不派生横幅;产生点接线后应消失(见任务报告)。
          return { label: COPY.phase.failed, tone: "red", spin: false, gridLocked: true, can: { ...NO_CAN } };
      }
    case "Closed":
      return {
        label: COPY.phase.closed,
        tone: "gray",
        spin: false,
        banner: { text: COPY.banner.closed, actions: [] },
        gridLocked: true,
        can: { ...NO_CAN },
      };
  }
}

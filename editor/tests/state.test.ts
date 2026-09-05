import { describe, expect, it } from "vitest";
import {
  INITIAL_EDITOR_STATE,
  canEdit,
  canRefreshOnly,
  canSave,
  canSubmit,
  canValidate,
  failKindFromCode,
  reducer,
  type EditorState,
} from "../src/app/state";
import type { EditorPhase } from "../src/api/types";

describe("editor reducer", () => {
  it("moves Opening to ReadyClean then ReadyDirty and SavingDraft", () => {
    const opened = reducer(INITIAL_EDITOR_STATE, {
      type: "open",
      table: "skills",
      fingerprint: "fp",
      rowCount: 2,
    });
    expect(opened.phase).toBe("ReadyClean");
    // ADR 0005:ReadyClean 且无改动时预检置灰,canValidate 需要 dirtyCount > 0。
    expect(canValidate(opened)).toBe(false);
    expect(canSubmit(opened)).toBe(false);
    const dirty = reducer(opened, { type: "dirty", dirtyCount: 1 });
    expect(dirty.phase).toBe("ReadyDirty");
    expect(canSave(dirty)).toBe(true);
    expect(canSubmit(dirty)).toBe(false);
    const saving = reducer(dirty, { type: "saving" });
    expect(saving.phase).toBe("SavingDraft");
    const saved = reducer(saving, { type: "saved", draftVersion: 2 });
    expect(saved.draftVersion).toBe(2);
    const stale = reducer(saved, { type: "stale", hint: "仓库已变化，草稿保留" });
    expect(stale.phase).toBe("Stale");
    const failed = reducer(saved, { type: "failed", hint: "另一个标签页已保存，请刷新", failKind: "DRAFT_VERSION_CONFLICT" });
    expect(failed.phase).toBe("Failed");
    expect(canSave(failed)).toBe(false);
  });

  it("moves ReadyDirty through Validating and ReadyToSubmit", () => {
    const dirty = reducer(INITIAL_EDITOR_STATE, { type: "dirty", dirtyCount: 1 });
    const validating = reducer(dirty, { type: "validate" });
    expect(validating.phase).toBe("Validating");
    const ready = reducer(validating, { type: "validated", ok: true, hint: "skills:" });
    expect(ready.phase).toBe("ReadyToSubmit");
    expect(canSubmit(ready)).toBe(true);
    const submitting = reducer(ready, { type: "submit" });
    expect(submitting.phase).toBe("Submitting");
    const done = reducer(submitting, { type: "submitted", fingerprint: "fp2" });
    expect(done.phase).toBe("ReadyClean");
    expect(done.fingerprint).toBe("fp2");
  });

  it("moves Stale to ReadyDirty after rebase and Conflicted on cell conflict", () => {
    const stale = reducer(INITIAL_EDITOR_STATE, { type: "stale", hint: "仓库已变化，草稿保留" });
    expect(stale.phase).toBe("Stale");
    const merged = reducer(stale, { type: "rebased", merged: 2, draftVersion: 4 });
    expect(merged.phase).toBe("ReadyDirty");
    expect(merged.hint).toContain("已合入仓库 2 处改动");
    const conflicted = reducer(merged, { type: "conflicted", hint: "单元格冲突" });
    expect(conflicted.phase).toBe("Conflicted");
    expect(canSubmit(conflicted)).toBe(false);
    const stillConflicted = reducer(conflicted, { type: "dirty", dirtyCount: 2 });
    expect(stillConflicted.phase).toBe("Conflicted");
    const resolved = reducer(stillConflicted, { type: "conflictsResolved" });
    expect(resolved.phase).toBe("ReadyDirty");
    const schema = reducer(merged, { type: "schemaChanged" });
    expect(schema.phase).toBe("Failed");
    expect(schema.hint).toContain("SCHEMA_CHANGED");
  });
});

describe("failKind 契约(ADR 0005:取代 hint 子串判断)", () => {
  it("failed 动作携带 failKind,canRefreshOnly 按 failKind 分派", () => {
    const vcs = reducer(INITIAL_EDITOR_STATE, { type: "failed", hint: "未提交", failKind: "VCS" });
    expect(vcs.phase).toBe("Failed");
    expect(vcs.failKind).toBe("VCS");
    expect(canRefreshOnly(vcs)).toBe(false);
    const draftConflict = reducer(INITIAL_EDITOR_STATE, {
      type: "failed",
      hint: "另一个标签页已保存，请刷新",
      failKind: "DRAFT_VERSION_CONFLICT",
    });
    expect(canRefreshOnly(draftConflict)).toBe(true);
    const unclassified = reducer(INITIAL_EDITOR_STATE, { type: "failed", hint: "boom" });
    expect(unclassified.failKind).toBe("");
    expect(canRefreshOnly(unclassified)).toBe(false);
  });

  it("schemaChanged 映射为 Failed + SCHEMA_CHANGED(0-8 §8 Conflicted 语义的代码归位)", () => {
    const state = reducer(INITIAL_EDITOR_STATE, { type: "schemaChanged" });
    expect(state.phase).toBe("Failed");
    expect(state.failKind).toBe("SCHEMA_CHANGED");
    expect(canRefreshOnly(state)).toBe(true);
  });

  it("hint 子串不再参与控制流:含「标签页」的 hint 也必须由 failKind 说了算", () => {
    const state: EditorState = {
      ...INITIAL_EDITOR_STATE,
      phase: "Failed",
      hint: "另一个标签页已保存，请刷新",
      failKind: "",
    };
    expect(canRefreshOnly(state)).toBe(false);
    const typed: EditorState = { ...state, failKind: "DRAFT_VERSION_CONFLICT" };
    expect(canRefreshOnly(typed)).toBe(true);
  });

  it("QA P2-8:draftSaveFailed 回可编辑态保脏格,不落 Failed", () => {
    const dirty = reducer(INITIAL_EDITOR_STATE, { type: "dirty", dirtyCount: 1 });
    const saving = reducer(dirty, { type: "saving" });
    const failed = reducer(saving, { type: "draftSaveFailed", hint: "草稿暂未保存，改动仍在表格里，稍后自动重试" });
    expect(failed.phase).toBe("ReadyDirty");
    expect(failed.dirtyCount).toBe(1);
    expect(failed.hint).toContain("草稿暂未保存");
    expect(canEdit(failed)).toBe(true);
    // 无脏格时回 ReadyClean。
    const clean = reducer(INITIAL_EDITOR_STATE, { type: "open", table: "skills", fingerprint: "fp", rowCount: 1 });
    const cleanAfter = reducer(clean, { type: "draftSaveFailed", hint: "草稿暂未保存，改动仍在表格里，稍后自动重试" });
    expect(cleanAfter.phase).toBe("ReadyClean");
  });

  it("QA P2-1/P2-8:recover 只清连接类残留,不清业务 failKind 的 Failed", () => {
    // SavingDraft 卡死(掉线发生在保存中)→ 按脏格数恢复。
    const saving = reducer(INITIAL_EDITOR_STATE, { type: "dirty", dirtyCount: 2 });
    const savingStuck = reducer(saving, { type: "saving" });
    expect(reducer(savingStuck, { type: "recover" }).phase).toBe("ReadyDirty");
    // 无 failKind 的 Failed(首连失败/连接类)→ 恢复。
    const genericFailed = reducer(savingStuck, { type: "failed", hint: "无法连接本机服务" });
    expect(reducer(genericFailed, { type: "recover" }).phase).toBe("ReadyDirty");
    // 业务终态(VCS / SCHEMA_CHANGED / DRAFT_VERSION_CONFLICT)不恢复。
    for (const failKind of ["VCS", "SCHEMA_CHANGED", "DRAFT_VERSION_CONFLICT"] as const) {
      const business = reducer(savingStuck, { type: "failed", hint: "x", failKind });
      expect(reducer(business, { type: "recover" }).phase).toBe("Failed");
    }
    // 其余阶段是 no-op。
    expect(reducer(saving, { type: "recover" }).phase).toBe("ReadyDirty");
  });

  it("离开 Failed 的动作清空 failKind", () => {
    const failed = reducer(INITIAL_EDITOR_STATE, { type: "schemaChanged" });
    const opened = reducer(failed, { type: "open", table: "skills", fingerprint: "fp", rowCount: 1 });
    expect(opened.phase).toBe("ReadyClean");
    expect(opened.failKind).toBe("");
    const failedAgain = reducer(opened, { type: "failed", hint: "x", failKind: "VCS" });
    const rebased = reducer(failedAgain, { type: "rebased", merged: 1, draftVersion: 3 });
    expect(rebased.failKind).toBe("");
    const failedThird = reducer(rebased, { type: "failed", hint: "y", failKind: "DRAFT_VERSION_CONFLICT" });
    const conflicted = reducer(failedThird, { type: "conflicted", hint: "单元格冲突" });
    expect(conflicted.failKind).toBe("");
  });

  it("failKindFromCode:VCS_COMMIT_FAILED / EXPORT_FAILED → VCS;SCHEMA_CHANGED;409 的 DRAFT_VERSION_CONFLICT", () => {
    expect(failKindFromCode("VCS_COMMIT_FAILED")).toBe("VCS");
    expect(failKindFromCode("EXPORT_FAILED")).toBe("VCS");
    expect(failKindFromCode("SCHEMA_CHANGED")).toBe("SCHEMA_CHANGED");
    expect(failKindFromCode("DRAFT_VERSION_CONFLICT")).toBe("DRAFT_VERSION_CONFLICT");
    expect(failKindFromCode(undefined)).toBe("");
    expect(failKindFromCode("WHATEVER")).toBe("");
  });

  it("canValidate 需要 dirtyCount > 0(ADR 0005)", () => {
    const clean = reducer(INITIAL_EDITOR_STATE, { type: "open", table: "skills", fingerprint: "fp", rowCount: 2 });
    expect(clean.phase).toBe("ReadyClean");
    expect(canValidate(clean)).toBe(false);
    const dirty = reducer(clean, { type: "dirty", dirtyCount: 1 });
    expect(canValidate(dirty)).toBe(true);
    const drained = reducer(dirty, { type: "dirty", dirtyCount: 0 });
    expect(drained.phase).toBe("ReadyClean");
    expect(canValidate(drained)).toBe(false);
  });
});

describe("phase capability matrix(11 阶段 × canEdit / canValidate / canSubmit / canRefreshOnly)", () => {
  const base = { ...INITIAL_EDITOR_STATE, online: true };

  interface Row {
    phase: EditorPhase;
    state?: Partial<typeof base>;
    edit: boolean;
    validate: boolean;
    submit: boolean;
    refreshOnly: boolean;
  }

  const rows: Row[] = [
    { phase: "Opening", edit: false, validate: false, submit: false, refreshOnly: false },
    { phase: "ReadyClean", edit: true, validate: false, submit: false, refreshOnly: false },
    { phase: "ReadyDirty", state: { dirtyCount: 3 }, edit: true, validate: true, submit: false, refreshOnly: false },
    // 简报口径:canValidate 仅在现有阶段集上增加 dirtyCount > 0,不含 SavingDraft;
    // §5「SavingDraft 同 ReadyDirty」的可用动作由 phaseView 派生层表达(phaseView.test.ts)。
    { phase: "SavingDraft", state: { dirtyCount: 3 }, edit: true, validate: false, submit: false, refreshOnly: false },
    { phase: "Validating", state: { dirtyCount: 3 }, edit: false, validate: false, submit: false, refreshOnly: false },
    { phase: "ReadyToSubmit", state: { dirtyCount: 3 }, edit: true, validate: true, submit: true, refreshOnly: false },
    { phase: "Submitting", state: { dirtyCount: 3 }, edit: false, validate: false, submit: false, refreshOnly: false },
    { phase: "Conflicted", state: { dirtyCount: 3 }, edit: false, validate: false, submit: false, refreshOnly: false },
    { phase: "Stale", state: { dirtyCount: 3 }, edit: false, validate: false, submit: false, refreshOnly: false },
    { phase: "Failed", state: { failKind: "VCS" }, edit: false, validate: false, submit: false, refreshOnly: false },
    {
      phase: "Failed",
      state: { failKind: "SCHEMA_CHANGED" },
      edit: false,
      validate: false,
      submit: false,
      refreshOnly: true,
    },
    {
      phase: "Failed",
      state: { failKind: "DRAFT_VERSION_CONFLICT" },
      edit: false,
      validate: false,
      submit: false,
      refreshOnly: true,
    },
    { phase: "Failed", state: { failKind: "" }, edit: false, validate: false, submit: false, refreshOnly: false },
    { phase: "Closed", edit: false, validate: false, submit: false, refreshOnly: false },
  ];

  for (const row of rows) {
    const suffix = row.state?.failKind ? ` · failKind=${row.state.failKind}` : "";
    it(`${row.phase}${suffix} → edit=${row.edit} validate=${row.validate} submit=${row.submit} refreshOnly=${row.refreshOnly}`, () => {
      const state = { ...base, phase: row.phase, ...(row.state ?? {}) };
      expect(canEdit(state)).toBe(row.edit);
      expect(canValidate(state)).toBe(row.validate);
      expect(canSubmit(state)).toBe(row.submit);
      expect(canRefreshOnly(state)).toBe(row.refreshOnly);
    });
  }
});

import { describe, expect, it } from "vitest";
import { INITIAL_EDITOR_STATE, canSave, canSubmit, canValidate, reducer } from "../src/app/state";

describe("editor reducer", () => {
  it("moves Opening to ReadyClean then ReadyDirty and SavingDraft", () => {
    const opened = reducer(INITIAL_EDITOR_STATE, {
      type: "open",
      table: "skills",
      fingerprint: "fp",
      rowCount: 2,
    });
    expect(opened.phase).toBe("ReadyClean");
    expect(canValidate(opened)).toBe(true);
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
    const failed = reducer(saved, { type: "failed", hint: "另一个标签页已保存，请刷新" });
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
    const schema = reducer(merged, { type: "schemaChanged" });
    expect(schema.phase).toBe("Failed");
    expect(schema.hint).toContain("SCHEMA_CHANGED");
  });
});

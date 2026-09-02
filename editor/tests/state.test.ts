import { describe, expect, it } from "vitest";
import { INITIAL_EDITOR_STATE, canSave, canSubmit, reducer } from "../src/app/state";

describe("editor reducer", () => {
  it("moves Opening to ReadyClean then ReadyDirty and SavingDraft", () => {
    const opened = reducer(INITIAL_EDITOR_STATE, {
      type: "open",
      table: "skills",
      fingerprint: "fp",
      rowCount: 2,
    });
    expect(opened.phase).toBe("ReadyClean");
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
});

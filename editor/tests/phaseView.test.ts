import { describe, expect, it } from "vitest";
import { INITIAL_EDITOR_STATE, type EditorState } from "../src/app/state";
import { phaseView } from "../src/app/phaseView";

function at(phase: EditorState["phase"], overrides: Partial<EditorState> = {}): EditorState {
  return { ...INITIAL_EDITOR_STATE, phase, online: true, dirtyCount: 2, ...overrides };
}

describe("phaseView 按 §5 状态表派生", () => {
  it("Opening:灰·转圈,无动作,骨架(锁定)", () => {
    const view = phaseView(at("Opening"));
    expect(view.label).toBe("正在打开…");
    expect(view.tone).toBe("gray");
    expect(view.spin).toBe(true);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner).toBeUndefined();
  });

  it("ReadyClean:绿,编辑/导出可用,预检置灰", () => {
    const view = phaseView(at("ReadyClean", { dirtyCount: 0 }));
    expect(view.label).toBe("与仓库一致");
    expect(view.tone).toBe("green");
    expect(view.spin).toBe(false);
    expect(view.gridLocked).toBe(false);
    expect(view.can).toEqual({ edit: true, validate: false, submit: false, export: true });
    expect(view.banner).toBeUndefined();
  });

  it("ReadyDirty:N 格未提交,琥珀,提交置灰", () => {
    const view = phaseView(at("ReadyDirty", { dirtyCount: 5 }));
    expect(view.label).toBe("5 格未提交");
    expect(view.tone).toBe("amber");
    expect(view.spin).toBe(false);
    expect(view.gridLocked).toBe(false);
    expect(view.can).toEqual({ edit: true, validate: true, submit: false, export: true });
    expect(view.banner).toBeUndefined();
  });

  it("SavingDraft:可用动作同 ReadyDirty,灰·转圈,可编辑", () => {
    const view = phaseView(at("SavingDraft", { dirtyCount: 2 }));
    expect(view.label).toBe("正在保存草稿…");
    expect(view.tone).toBe("gray");
    expect(view.spin).toBe(true);
    expect(view.gridLocked).toBe(false);
    expect(view.can).toEqual({ edit: true, validate: true, submit: false, export: true });
    expect(view.banner).toBeUndefined();
  });

  it("Validating:无动作(导出可),锁定遮罩", () => {
    const view = phaseView(at("Validating", { dirtyCount: 3 }));
    expect(view.label).toBe("正在预检…");
    expect(view.tone).toBe("gray");
    expect(view.spin).toBe(true);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: true });
    expect(view.banner).toBeUndefined();
  });

  it("ReadyToSubmit:绿,提交(主)、预检、编辑", () => {
    const view = phaseView(at("ReadyToSubmit", { dirtyCount: 3 }));
    expect(view.label).toBe("预检通过，可提交");
    expect(view.tone).toBe("green");
    expect(view.spin).toBe(false);
    expect(view.gridLocked).toBe(false);
    expect(view.can).toEqual({ edit: true, validate: true, submit: true, export: false });
    expect(view.banner).toBeUndefined();
  });

  it("Submitting:灰·转圈,全部禁用,锁定遮罩", () => {
    const view = phaseView(at("Submitting", { dirtyCount: 3 }));
    expect(view.label).toBe("正在提交…");
    expect(view.tone).toBe("gray");
    expect(view.spin).toBe(true);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner).toBeUndefined();
  });

  it("Conflicted:紫,横幅带 [处理冲突][取消本次提交],锁定 + 冲突标记", () => {
    const view = phaseView(at("Conflicted", { dirtyCount: 2 }), { conflictCount: 4 });
    expect(view.label).toBe("4 处冲突待处理");
    expect(view.tone).toBe("purple");
    expect(view.spin).toBe(false);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner?.text).toContain("合并遇到 4 处冲突");
    expect(view.banner?.actions).toEqual([
      { label: "处理冲突", action: "resolve" },
      { label: "取消本次提交", action: "cancel" },
    ]);
  });

  it("Conflicted 无 conflictCount 上下文时回退 dirtyCount 计数", () => {
    const view = phaseView(at("Conflicted", { dirtyCount: 2 }));
    expect(view.label).toBe("2 处冲突待处理");
  });

  it("Stale:蓝·转圈,横幅给修订与草稿数,无动作(自动合并)", () => {
    const view = phaseView(at("Stale", { dirtyCount: 2 }), {
      revision: { vcs: "git", id: "a10eb3f1234567890abcd", branch: "main" },
    });
    expect(view.label).toBe("仓库已更新，正在合并");
    expect(view.tone).toBe("blue");
    expect(view.spin).toBe(true);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner?.text).toBe("仓库已更新（main · a10eb3f1）。正在把你的 2 处草稿改动合并到新底稿，草稿不会丢。");
    expect(view.banner?.actions).toEqual([]);
  });

  it("Stale 无修订上下文时省略括号段", () => {
    const view = phaseView(at("Stale", { dirtyCount: 2 }));
    expect(view.banner?.text).toBe("仓库已更新。正在把你的 2 处草稿改动合并到新底稿，草稿不会丢。");
  });

  it("Stale 修订显示按 ADR 0005:svn → r<id>,vcs=none → 不显示修订段", () => {
    const svn = phaseView(at("Stale", { dirtyCount: 2 }), { revision: { vcs: "svn", id: "1234", branch: "" } });
    expect(svn.banner?.text).toContain("仓库已更新（r1234）");
    const none = phaseView(at("Stale", { dirtyCount: 2 }), { revision: { vcs: "none", id: "zzz", branch: "" } });
    expect(none.banner?.text).toContain("仓库已更新。正在");
  });

  it("Failed · failKind=VCS:红,横幅 [查看详情][重试],锁定", () => {
    const view = phaseView(at("Failed", { failKind: "VCS" }));
    expect(view.label).toBe("提交失败");
    expect(view.tone).toBe("red");
    expect(view.spin).toBe(false);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner?.text).toBe("提交失败：改动已合入表文件，但 commit 未完成。请在终端手动提交。");
    expect(view.banner?.actions).toEqual([
      { label: "查看详情", action: "details" },
      { label: "重试", action: "retry" },
    ]);
  });

  it("Failed · failKind=SCHEMA_CHANGED:红,横幅 [刷新],锁定", () => {
    const view = phaseView(at("Failed", { failKind: "SCHEMA_CHANGED" }));
    expect(view.label).toBe("表结构已变化");
    expect(view.tone).toBe("red");
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner?.text).toBe("这张表的结构已变化，需要刷新后重放草稿；草稿已保存。");
    expect(view.banner?.actions).toEqual([{ label: "刷新", action: "refresh" }]);
  });

  it("Failed · failKind=DRAFT_VERSION_CONFLICT:红,横幅 [刷新],锁定", () => {
    const view = phaseView(at("Failed", { failKind: "DRAFT_VERSION_CONFLICT" }));
    expect(view.label).toBe("草稿已在别处更新");
    expect(view.tone).toBe("red");
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner?.text).toBe("另一个标签页保存了这张表的草稿。此页已停止编辑，刷新后接着改。");
    expect(view.banner?.actions).toEqual([{ label: "刷新", action: "refresh" }]);
  });

  it("Failed 未归类(空 failKind):红、锁定、无横幅,产生点由主 loop 归类", () => {
    const view = phaseView(at("Failed", { failKind: "" }));
    expect(view.label).toBe("提交失败");
    expect(view.tone).toBe("red");
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner).toBeUndefined();
  });

  it("Closed:灰,无动作,整页阻断 + 重连指引,表格隐藏", () => {
    const view = phaseView(at("Closed"));
    expect(view.label).toBe("会话已结束");
    expect(view.tone).toBe("gray");
    expect(view.spin).toBe(false);
    expect(view.gridLocked).toBe(true);
    expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(view.banner?.text).toContain("会话已结束");
    expect(view.banner?.actions).toEqual([]);
  });

  it("online=false 派生态覆盖任何阶段(含 Failed 三分支)", () => {
    for (const failKind of ["VCS", "SCHEMA_CHANGED", "DRAFT_VERSION_CONFLICT"] as const) {
      const view = phaseView(at("Failed", { failKind, online: false }));
      expect(view.label).toBe("无法连接本机服务");
      expect(view.tone).toBe("red");
      expect(view.gridLocked).toBe(true);
      expect(view.can).toEqual({ edit: false, validate: false, submit: false, export: false });
      expect(view.banner?.text).toContain("无法连接本机服务");
    }
    const ready = phaseView(at("ReadyDirty", { online: false }));
    expect(ready.label).toBe("无法连接本机服务");
    expect(ready.can).toEqual({ edit: false, validate: false, submit: false, export: false });
    expect(ready.gridLocked).toBe(true);
  });
});

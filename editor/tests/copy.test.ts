import { describe, expect, it } from "vitest";
import { COPY } from "../src/app/copy";

/** ADR 0005 / 设计稿 §12:用户可见文案不得出现英文阶段名、autoCommit / autoExport、local.json、sha256: 全文。 */
const BANNED = /Ready(Clean|Dirty|ToSubmit)|Submitting|Validating|Stale|Conflicted|autoCommit|autoExport|local\.json|sha256:/;

/** 函数型文案的取样参数,按函数名索引;缺项即抛错,逼着新函数补样。 */
const sampleArgs: Record<string, unknown[]> = {
  title: ["skills"],
  dirty: [3],
  conflicted: [4],
  uncommittedMerges: [1],
  stale: [2, "main · a10eb3f1"],
  patchTarget: ["main", "a10eb3f", true],
  submitConfirm: [3, "main", "a10eb3f", "skills", "update skills", true, false],
  requiredNoDefault: ["cost"],
  rowCount: [4],
  viewHint: [9],
};

interface CopyEntry {
  path: string;
  text: string;
}

function collectStrings(node: unknown, path: string, out: CopyEntry[]): void {
  if (typeof node === "string") {
    out.push({ path, text: node });
  } else if (typeof node === "function") {
    const args = sampleArgs[node.name];
    if (!args) {
      throw new Error(`copy.test.ts 缺少取样参数: ${path}(${node.name})`);
    }
    const result = (node as (...args: unknown[]) => unknown)(...args);
    collectStrings(result, `${path}()`, out);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe("COPY 文案表", () => {
  it("遍历全部字符串(含函数取样输出),不出现英文阶段名 / autoCommit / autoExport / local.json / sha256:", () => {
    const entries: CopyEntry[] = [];
    collectStrings(COPY, "COPY", entries);
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const { path, text } of entries) {
      expect(text, path).not.toBe("");
      expect(BANNED.test(text), `${path} 命中禁用正则: ${text}`).toBe(false);
    }
  });

  it("键名英文、值中文,逐条覆盖 §12 关键文案", () => {
    expect(COPY.title("skills")).toBe("LumioConfig · skills");
    expect(COPY.phase.readyClean).toBe("与仓库一致");
    expect(COPY.phase.dirty(3)).toBe("3 格未提交");
    expect(COPY.phase.readyToSubmit).toBe("预检通过，可提交");
    expect(COPY.phase.stale).toBe("仓库已更新，正在合并");
    expect(COPY.phase.conflicted(4)).toBe("4 处冲突待处理");
    expect(COPY.phase.failed).toBe("提交失败");
    expect(COPY.status.noUncommitted).toBe("无未提交改动");
    expect(COPY.status.uncommittedMerges(1)).toBe("1 次合入未 commit");
    expect(COPY.settings.autoCommitLabel).toBe("提交后自动 commit 到当前分支");
    expect(COPY.settings.autoExportLabel).toBe("提交后自动导表");
    expect(COPY.settings.savedToast).toBe("已保存到本机设置");
    expect(COPY.validation.requiredMissingColumn).toBe("必填列不能设为缺列");
    expect(COPY.validation.requiredNoDefault("cost")).toBe("cost 是必填列且没有默认值，Delete 不改动它");
    expect(COPY.cellMenu.setNull).toBe("设为 null ∅");
    expect(COPY.onboardingToast).toBe("草稿会自动保存在本机，提交前不会写进仓库");
    expect(COPY.exportNote).toBe("单向生成物，不会导回仓库；输出到 build/export");
    expect(COPY.export.source).toBe("来源");
    expect(COPY.export.sourceRepo).toBe("仓库");
    expect(COPY.export.sourceDraft).toBe("含我的草稿");
    expect(COPY.export.targetAll).toBe("全部");
    expect(COPY.export.submit).toBe("导出");
    expect(COPY.drawer.patchEmpty).toBe("还没有改动…");
    expect(COPY.drawer.errorsEmpty.clean).toBe("还没有改动");
    expect(COPY.drawer.errorsEmpty.dirty(3)).toBe("有 3 处改动（尚未预检）");
  });

  it("补丁目标行(§12:→ main · a10eb3f · 自动 commit)", () => {
    expect(COPY.patchTarget("main", "a10eb3f", true)).toBe("→ main · a10eb3f · 自动 commit");
    expect(COPY.patchTarget("main", "a10eb3f", false)).toBe("→ main · a10eb3f");
  });

  it("提交确认四组合(§12 原句为 commit-only 形态)", () => {
    expect(COPY.submitConfirm(3, "main", "a10eb3f", "skills", "update skills", true, false)).toBe(
      "将把 3 处改动提交到 main（a10eb3f），并以「config(skills): update skills」自动 commit；不导表。",
    );
    expect(COPY.submitConfirm(3, "main", "a10eb3f", "skills", "update skills", true, true)).toBe(
      "将把 3 处改动提交到 main（a10eb3f），并以「config(skills): update skills」自动 commit，同时导出表文件。",
    );
    expect(COPY.submitConfirm(3, "main", "a10eb3f", "skills", "update skills", false, true)).toBe(
      "将把 3 处改动提交到 main（a10eb3f），并导出表文件；不会自动 commit。",
    );
    expect(COPY.submitConfirm(3, "main", "a10eb3f", "skills", "update skills", false, false)).toBe(
      "将把 3 处改动提交到 main（a10eb3f）。",
    );
  });
});

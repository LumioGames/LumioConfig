import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SubmitResult } from "../src/api/draftSession";
import type { PatchObject } from "../src/api/types";
import { COPY } from "../src/app/copy";
import { PatchTab } from "../src/panels/drawer/PatchTab";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

const TARGET = { branch: "main", sha: "a10eb3f", autoCommit: true, autoExport: false };

const PATCH: PatchObject = {
  table: "skills",
  base: { sourceFingerprint: "47f6f165" },
  ops: [
    { op: "update", name: "fireball", set: { damage: 133 }, expect: { damage: "120" } },
    { op: "create", name: "nova", draftRowKey: "draft:1", set: { damage: 90 } },
    { op: "rename", name: "old-name", to: "new-name", expect: { name: "old-name" } },
    { op: "delete", name: "gone", expect: { id: "40003" } },
  ],
};

const RESULT: SubmitResult = {
  ok: true,
  summary: "4 处改动",
  errors: [],
  result: {
    sourceFingerprint: "sha256:9c1d3e2a7b0f44d1",
    assignedIds: { "draft:1": 40007 },
    vcs: { action: "commit", id: "7b3e2a1c9d0e4f5a", branch: "main" },
    export: { outDir: "build/export", files: 3 },
  },
};

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

describe("PatchTab", () => {
  it("groups ops by kind with 更新/新增/改名/删除 pills", () => {
    const el = mount(<PatchTab patch={PATCH} summary="4 处改动" target={TARGET} result={null} onJump={() => {}} />);
    const body = textOf(el);
    expect(body).toContain("更新");
    expect(body).toContain("新增");
    expect(body).toContain("改名");
    expect(body).toContain("删除");
    expect(body).toContain("fireball");
    expect(body).toContain("nova");
    expect(body).toContain("gone");
  });

  it("renders update columns as expect → set and rename as old → new", () => {
    const el = mount(<PatchTab patch={PATCH} summary="s" target={TARGET} result={null} onJump={() => {}} />);
    const body = textOf(el);
    expect(body).toContain("damage");
    expect(body).toContain("120");
    expect(body).toContain("133");
    expect(body).toContain("old-name");
    expect(body).toContain("new-name");
  });

  it("shows the summary line and the copy-driven target line", () => {
    const el = mount(<PatchTab patch={PATCH} summary="4 处改动" target={TARGET} result={null} onJump={() => {}} />);
    expect(textOf(el.querySelector('[data-testid="diff-summary"]'))).toBe("4 处改动");
    expect(textOf(el.querySelector('[data-testid="diff-target"]'))).toBe(COPY.patchTarget("main", "a10eb3f", true));
  });

  it("falls back to the bare sha in the target line when branch is null", () => {
    const el = mount(
      <PatchTab patch={PATCH} summary="s" target={{ ...TARGET, branch: null }} result={null} onJump={() => {}} />,
    );
    expect(textOf(el.querySelector('[data-testid="diff-target"]'))).toBe("→ a10eb3f");
  });

  it("clicking a row header or a column line calls onJump with the 1-based group ordinal", () => {
    const jumps: Array<[number, string]> = [];
    const el = mount(
      <PatchTab patch={PATCH} summary="s" target={TARGET} result={null} onJump={(row, column) => jumps.push([row, column])} />,
    );
    const buttons = Array.from(el.querySelectorAll("button"));
    const damageLine = buttons.find((button) => textOf(button).startsWith("damage"));
    act(() => {
      damageLine?.click();
    });
    const fireballHeader = buttons.find((button) => textOf(button).includes("fireball"));
    act(() => {
      fireballHeader?.click();
    });
    const novaDamage = buttons.find((button) => textOf(button).startsWith("damage") && button !== damageLine);
    act(() => {
      novaDamage?.click();
    });
    expect(jumps).toEqual([
      [1, "damage"],
      [1, "name"],
      [2, "damage"],
    ]);
  });

  it("shows the copy-driven empty state only when there are no ops and no result", () => {
    const empty = mount(<PatchTab patch={null} summary="" target={TARGET} result={null} onJump={() => {}} />);
    expect(textOf(empty)).toContain(COPY.drawer.patchEmpty);
    const afterResult = mount(<PatchTab patch={null} summary="" target={TARGET} result={RESULT} onJump={() => {}} />);
    expect(textOf(afterResult)).not.toContain(COPY.drawer.patchEmpty);
  });

  it("renders the submit result card with 8-hex fingerprint, assigned ids, vcs and export", () => {
    const el = mount(<PatchTab patch={PATCH} summary="s" target={TARGET} result={RESULT} onJump={() => {}} />);
    const card = el.querySelector('[data-testid="submit-result"]');
    expect(card).toBeTruthy();
    const body = textOf(card);
    expect(body).toContain("9c1d3e2a");
    expect(body).not.toContain("sha256:");
    expect(body).toContain("draft:1");
    expect(body).toContain("40007");
    expect(body).toContain("commit");
    expect(body).toContain("7b3e2a1");
    expect(body).toContain("main");
    expect(body).toContain("build/export");
    expect(body).toContain("3");
    // title 里保留指纹全文(StatusBar 先例),可见文本只有 8 位。
    expect(card?.querySelector('[title="sha256:9c1d3e2a7b0f44d1"]')).toBeTruthy();
  });

  it("uses — for absent vcs/export entries in the result card", () => {
    const result: SubmitResult = {
      ok: true,
      summary: "",
      errors: [],
      result: {
        sourceFingerprint: "deadbeefdeadbeef",
        assignedIds: {},
        vcs: null,
        export: null,
      },
    };
    const el = mount(<PatchTab patch={PATCH} summary="s" target={TARGET} result={result} onJump={() => {}} />);
    const body = textOf(el.querySelector('[data-testid="submit-result"]'));
    expect(body).toContain("deadbeef");
    expect(body).toContain("—");
  });
});

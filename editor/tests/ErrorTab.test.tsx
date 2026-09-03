import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorTab } from "../src/panels/drawer/ErrorTab";
import type { ValidationError } from "../src/spreadsheet/cellMeta";

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

function item(overrides: Partial<ValidationError> & { table?: string }): ValidationError {
  return {
    column: "damage",
    code: "TYPE_MISMATCH",
    message: "这一列需要数字",
    suggestion: "改成数字再提交",
    ...overrides,
  };
}

describe("ErrorTab 空态(§8「错误」三种空态,文案全部来自 COPY)", () => {
  it("state=no-changes 显示「还没有改动」", () => {
    const el = mount(<ErrorTab errors={[]} state="no-changes" onJump={() => undefined} />);
    expect(el.textContent).toBe("还没有改动");
  });

  it("state=not-validated 显示「有 N 处改动（尚未预检）」(N=dirtyCount)", () => {
    const el = mount(
      <ErrorTab errors={[]} state="not-validated" dirtyCount={3} onJump={() => undefined} />,
    );
    expect(el.textContent).toBe("有 3 处改动（尚未预检）");
  });

  it("state=clean 显示「预检通过，没有发现问题」", () => {
    const el = mount(<ErrorTab errors={[]} state="clean" onJump={() => undefined} />);
    expect(el.textContent).toBe("预检通过，没有发现问题");
  });

  it("state=errors 且列表为空时不渲染空态文案", () => {
    const el = mount(<ErrorTab errors={[]} state="errors" onJump={() => undefined} />);
    expect(el.textContent).toBe("");
    expect(el.children.length).toBe(0);
  });
});

describe("ErrorTab 错误列表(按表 / 行分组红头卡,点击跳格)", () => {
  it("同一行聚合为一组,组头是 表 · 行", () => {
    const el = mount(
      <ErrorTab
        errors={[
          item({ table: "skills", row: "fireball", rowId: "40001", column: "damage" }),
          item({ table: "skills", row: "fireball", rowId: "40001", column: "icon", code: "ENUM_INVALID" }),
        ]}
        state="errors"
        onJump={() => undefined}
      />,
    );
    const headers = Array.from(el.querySelectorAll("[data-group-header]")).map((n) => n.textContent);
    expect(headers).toEqual(["skills · fireball"]);
    expect(el.querySelectorAll("[data-error-item]").length).toBe(2);
  });

  it("不同表 / 不同行分组,顺序保持输入顺序", () => {
    const el = mount(
      <ErrorTab
        errors={[
          item({ table: "skills", row: "fireball", rowId: "40001" }),
          item({ table: "effects", row: "burn", rowId: "50001" }),
          item({ table: "skills", row: "frostbolt", rowId: "40002" }),
        ]}
        state="errors"
        onJump={() => undefined}
      />,
    );
    const headers = Array.from(el.querySelectorAll("[data-group-header]")).map((n) => n.textContent);
    expect(headers).toEqual(["skills · fireball", "effects · burn", "skills · frostbolt"]);
  });

  it("无 table 字段时组头只显示行", () => {
    const el = mount(
      <ErrorTab
        errors={[item({ row: "fireball", rowId: "40001" })]}
        state="errors"
        onJump={() => undefined}
      />,
    );
    expect(el.querySelector("[data-group-header]")?.textContent).toBe("fireball");
  });

  it("每项文本为 列 · message · 建议 · code,点击回调 onJump(row, column)", () => {
    const jumps: Array<[string, string]> = [];
    const el = mount(
      <ErrorTab
        errors={[item({ table: "skills", row: "fireball", rowId: "40001" })]}
        state="errors"
        onJump={(row, column) => jumps.push([row, column])}
      />,
    );
    const entry = el.querySelector("[data-error-item]") as HTMLElement;
    expect(entry.textContent).toContain("damage · 这一列需要数字 · 改成数字再提交 · TYPE_MISMATCH");
    act(() => {
      entry.click();
    });
    expect(jumps).toEqual([["fireball", "damage"]]);
  });

  it("行缺失的项回退 rowId 跳格,无建议时不拼建议段", () => {
    const jumps: Array<[string, string]> = [];
    const el = mount(
      <ErrorTab
        errors={[item({ rowId: "40002", suggestion: undefined })]}
        state="errors"
        onJump={(row, column) => jumps.push([row, column])}
      />,
    );
    const entry = el.querySelector("[data-error-item]") as HTMLElement;
    expect(entry.textContent).toContain("damage · 这一列需要数字 · TYPE_MISMATCH");
    act(() => {
      entry.click();
    });
    expect(jumps).toEqual([["40002", "damage"]]);
  });

  it("组头用危险色 token(红头卡)", () => {
    const el = mount(
      <ErrorTab errors={[item({ row: "fireball" })]} state="errors" onJump={() => undefined} />,
    );
    const header = el.querySelector("[data-group-header]") as HTMLElement;
    expect(header.style.background).toBe("var(--color-danger-bg)");
    expect(header.style.color).toBe("var(--color-danger-text)");
  });
});

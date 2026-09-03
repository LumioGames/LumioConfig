---
status: pending
---

# 新增 Panel 基础组件

在 `editor/src/components/ui/Panel.tsx` 新增可复用的 `Panel` 组件，替代 ConflictPanel/DiffPreview/ExportPanel/SettingsPanel/ErrorPanel 各自手写的外壳标签。新组件，属于"大任务"，先写失败测试再实现。

## 涉及范围

- 新增：`editor/src/components/ui/Panel.tsx`
- 新增：`editor/tests/Panel.test.tsx`

## 接口

**Produces**（供 `editor-ui-index-barrel` 及后续迁移卡使用，签名必须精确一致）：

```ts
export type PanelTone = "default" | "warning";
export type PanelVariant = "docked" | "boxed"; // 默认 "docked"
export type PanelTag = "section" | "div" | "ul"; // 默认 "section"

export interface PanelProps {
  tone?: PanelTone;      // 默认 "default"
  variant?: PanelVariant;
  as?: PanelTag;
  title?: React.ReactNode;    // 若提供，渲染为子元素最前面的 <h2>{title}</h2>
  className?: string;
  "data-testid"?: string;
  children: React.ReactNode;
}

export function Panel(props: PanelProps): JSX.Element;
```

渲染输出的 class 名规则（`editor-ui-tokens-styles` 卡的 `ui.css` 已按此约定写好）：`"panel"` + （`variant === "boxed"` 时追加 `"panel--boxed"`）+ （`tone === "warning"` 时追加 `"panel--warning"`）+ 调用方 `className`（追加在最后）。`data-testid` 原样透传到根节点。

## 步骤

- [ ] **Step 1：写失败测试** —— 完整写入 `editor/tests/Panel.test.tsx`：

```tsx
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Panel } from "../src/components/ui/Panel";

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

describe("Panel", () => {
  it("renders a <section> with the base panel class by default", () => {
    const el = mount(
      <Panel data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.tagName).toBe("SECTION");
    expect(node.className).toBe("panel");
  });

  it("adds panel--boxed for variant=boxed", () => {
    const el = mount(
      <Panel variant="boxed" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.className).toBe("panel panel--boxed");
  });

  it("adds panel--warning for tone=warning", () => {
    const el = mount(
      <Panel tone="warning" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.className).toBe("panel panel--warning");
  });

  it("renders as the requested tag via `as`", () => {
    const el = mount(
      <Panel as="ul" data-testid="p">
        <li>item</li>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.tagName).toBe("UL");
  });

  it("renders an optional title as an <h2> before children", () => {
    const el = mount(
      <Panel title="提交冲突" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.firstElementChild?.tagName).toBe("H2");
    expect(node.firstElementChild?.textContent).toBe("提交冲突");
  });

  it("renders no <h2> when title is omitted", () => {
    const el = mount(
      <Panel data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.querySelector("h2")).toBeNull();
  });

  it("merges a caller-provided className after the modifier classes", () => {
    const el = mount(
      <Panel tone="warning" className="conflict-panel" data-testid="p">
        <p>body</p>
      </Panel>,
    );
    const node = el.querySelector('[data-testid="p"]') as HTMLElement;
    expect(node.className).toBe("panel panel--warning conflict-panel");
  });
});
```

- [ ] **Step 2：确认测试失败** —— 运行 `pnpm vitest run tests/Panel.test.tsx`，预期报错 `Failed to resolve import "../src/components/ui/Panel"`。

- [ ] **Step 3：写最小实现** —— 完整写入 `editor/src/components/ui/Panel.tsx`：

```tsx
import type { ReactNode } from "react";

export type PanelTone = "default" | "warning";
export type PanelVariant = "docked" | "boxed";
export type PanelTag = "section" | "div" | "ul";

export interface PanelProps {
  tone?: PanelTone;
  variant?: PanelVariant;
  as?: PanelTag;
  title?: ReactNode;
  className?: string;
  "data-testid"?: string;
  children: ReactNode;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  tone = "default",
  variant = "docked",
  as = "section",
  title,
  className,
  "data-testid": dataTestId,
  children,
}: PanelProps) {
  const Tag = as;
  return (
    <Tag
      className={cx(
        "panel",
        variant === "boxed" && "panel--boxed",
        tone === "warning" && "panel--warning",
        className,
      )}
      data-testid={dataTestId}
    >
      {title ? <h2>{title}</h2> : null}
      {children}
    </Tag>
  );
}
```

- [ ] **Step 4：确认测试通过** —— 运行 `pnpm vitest run tests/Panel.test.tsx`，全部 PASS。

- [ ] **Step 5：提交**

```bash
git add editor/src/components/ui/Panel.tsx editor/tests/Panel.test.tsx
git commit -m "feat(editor): add Panel UI primitive"
```

## 验收标准

- [ ] `editor/tests/Panel.test.tsx` 全部用例通过。
- [ ] `pnpm lint`、`pnpm build`（`tsc --noEmit` 部分）通过——若 `<Tag>` 多态标签写法被 TS 拒绝，改用 `createElement(as, { className, "data-testid": dataTestId }, title ? <h2>{title}</h2> : null, children)`（需 `import { createElement } from "react"`），行为不变。

## 依赖

无

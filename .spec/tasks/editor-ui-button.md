---
status: pending
---

# 新增 Button 基础组件

在 `editor/src/components/ui/Button.tsx` 新增可复用的 `Button` 组件，替代各面板里散落的裸 `<button type="button" data-testid=... onClick=...>`。这是新组件，属于"大任务"（本卡预计新增有效行数 ≥ 50），按项目测试分级要求先写失败测试再实现。

## 涉及范围

- 新增：`editor/src/components/ui/Button.tsx`
- 新增：`editor/tests/Button.test.tsx`

## 接口

**Produces**（供 `editor-ui-index-barrel` 及后续迁移卡使用，签名必须精确一致）：

```ts
export type ButtonVariant = "default" | "primary" | "nav" | "menu";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // 默认 "default"
  active?: boolean;        // 默认 false，仅 nav 变体渲染选中态（追加 "is-active" class）
}

export function Button(props: ButtonProps): JSX.Element;
```

渲染输出的 class 名规则（`editor-ui-tokens-styles` 卡的 `ui.css` 已按此约定写好，不可更改）：`"btn btn--<variant>"`，`active` 为真时追加 `"is-active"`，调用方传入的 `className` 追加在最后。`type` 默认值为 `"button"`（可被调用方覆盖，但目前没有调用方需要覆盖）。原生 `ButtonHTMLAttributes`（`onClick`/`disabled`/`data-testid`/…）全部透传。

## 步骤

- [ ] **Step 1：写失败测试** —— 完整写入 `editor/tests/Button.test.tsx`：

```tsx
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "../src/components/ui/Button";

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

describe("Button", () => {
  it("defaults to variant=default and type=button", () => {
    const el = mount(<Button data-testid="btn">Go</Button>);
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.className).toBe("btn btn--default");
    expect(button.textContent).toBe("Go");
  });

  it("applies the requested variant class", () => {
    const el = mount(
      <Button variant="primary" data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--primary");
  });

  it("adds is-active only when active is true", () => {
    const el = mount(
      <Button variant="nav" active data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--nav is-active");
  });

  it("does not add is-active when active is false", () => {
    const el = mount(
      <Button variant="nav" data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--nav");
  });

  it("merges a caller-provided className after the variant class", () => {
    const el = mount(
      <Button className="conflict-panel" data-testid="btn">
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.className).toBe("btn btn--default conflict-panel");
  });

  it("forwards native button attributes like disabled and onClick", () => {
    let clicks = 0;
    const el = mount(
      <Button data-testid="btn" onClick={() => (clicks += 1)} disabled={false}>
        Go
      </Button>,
    );
    const button = el.querySelector('[data-testid="btn"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    act(() => {
      button.click();
    });
    expect(clicks).toBe(1);
  });
});
```

- [ ] **Step 2：确认测试失败** —— 运行 `pnpm vitest run tests/Button.test.tsx`，预期报错 `Failed to resolve import "../src/components/ui/Button"`（文件不存在）。

- [ ] **Step 3：写最小实现** —— 完整写入 `editor/src/components/ui/Button.tsx`：

```tsx
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "primary" | "nav" | "menu";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  active?: boolean;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Button({ variant = "default", active = false, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", `btn--${variant}`, active && "is-active", className)}
      {...rest}
    />
  );
}
```

- [ ] **Step 4：确认测试通过** —— 运行 `pnpm vitest run tests/Button.test.tsx`，全部 PASS。

- [ ] **Step 5：提交**

```bash
git add editor/src/components/ui/Button.tsx editor/tests/Button.test.tsx
git commit -m "feat(editor): add Button UI primitive"
```

## 验收标准

- [ ] `editor/tests/Button.test.tsx` 全部用例通过。
- [ ] `pnpm lint`、`pnpm build`（`tsc --noEmit` 部分）通过。

## 依赖

无

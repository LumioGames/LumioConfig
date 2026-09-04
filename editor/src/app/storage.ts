/**
 * 取一个永不抛异常的 Storage。取不到真实实现时回落到进程内 Map 垫片。
 * 覆盖三种取不到的情况：浏览器隐私模式、站点禁用存储、Node 26 的全局 localStorage 遮蔽
 * （Node 26 定义了一个不带 --localstorage-file 就返回 undefined 的全局访问器，
 *  vitest 的 jsdom 环境不会覆盖它，详见 docs/reviews/2026-09-04-editor-v3-completion-audit.md §G-2）。
 *
 * 这是 M7-K 的根治手段：`editor/src/**` 一律经 safeStorage 访问 local/session storage，
 * 不得裸用 `localStorage.` / `sessionStorage.`（守卫见 tests/no-bare-localstorage.test.ts）。
 */

/** 探针键：写一个再删掉，用来验证真实 storage 可读且可写；用 lumio 命名空间避免与业务键混淆。 */
const PROBE_KEY = "lumio-config-editor:storage-probe";

/** 进程内 Map 垫片：实现完整 Storage 接口，刷新即丢——垫片生效意味着持久化已退化。 */
class MemoryStorageShim implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** 同一 kind 的垫片必须共享状态（组件间互通），所以按 kind 缓存单例。 */
const shims = new Map<"local" | "session", MemoryStorageShim>();

function shimFor(kind: "local" | "session"): Storage {
  let shim = shims.get(kind);
  if (!shim) {
    shim = new MemoryStorageShim();
    shims.set(kind, shim);
  }
  return shim;
}

/**
 * 探测真实 storage 是否可读**且可写**：写探针键 → 读回校验 → 删掉。
 * 只读不写（setItem 被吞）也算不可用。任何一步抛异常或访问不到都返回 undefined，永不抛。
 */
function usableStorage(kind: "local" | "session"): Storage | undefined {
  try {
    const candidate = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!candidate) {
      return undefined;
    }
    const stamp = String(Date.now());
    candidate.setItem(PROBE_KEY, stamp);
    const echoed = candidate.getItem(PROBE_KEY) === stamp;
    try {
      candidate.removeItem(PROBE_KEY);
    } catch {
      // 连删探针都抛的实现不可信赖。
      return undefined;
    }
    return echoed ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/** 真实可用时直通全局实现，否则回落垫片；同一 kind 多次调用返回同一实例。 */
export function safeStorage(kind: "local" | "session"): Storage {
  return usableStorage(kind) ?? shimFor(kind);
}

/** 垫片是否在生效（供 UI 决定是否退化，例如 onboarding toast 改为每次都提示）。 */
export function isStorageFallback(kind: "local" | "session"): boolean {
  return usableStorage(kind) === undefined;
}

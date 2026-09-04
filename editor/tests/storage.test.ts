import { describe, expect, it } from "vitest";
import { isStorageFallback, safeStorage } from "../src/app/storage";
import type { SessionCapabilities, SessionTableSummary, SourceFileResponse } from "../src/api/types";

/**
 * M7-X / M7-K:storage 访问器契约测试。
 * Node 24(vitest jsdom 会注入可用的 jsdom Storage)走真实直通路径;
 * 「全局 undefined / 抛异常」用 defineProperty 显式替换 `globalThis.localStorage` 模拟
 * Node 26 的遮蔽行为(见 docs/reviews/2026-09-04-editor-v3-completion-audit.md §G-2),测完还原原描述符。
 */

const REAL_KEY = "lumio-config-editor:test:real";

/** 模块加载时(任何用例替换全局之前)探测真实 localStorage 是否可读可写。 */
const realLocalStorageUsable = (() => {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return false;
    }
    storage.setItem(REAL_KEY, "1");
    const echoed = storage.getItem(REAL_KEY) === "1";
    storage.removeItem(REAL_KEY);
    return echoed;
  } catch {
    return false;
  }
})();

/** 用 defineProperty 整体替换全局 storage(不依赖原描述符可写),返回还原函数。 */
function replaceGlobal(kind: "local" | "session", value: unknown): () => void {
  const name = kind === "local" ? "localStorage" : "sessionStorage";
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, name, original);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  };
}

/** setItem 正常但 getItem 抛异常的坏 storage(隐私模式里读被拦的形态)。 */
function getItemThrowing(): Storage {
  return {
    length: 0,
    clear() {},
    key: () => null,
    getItem() {
      throw new Error("SecurityError: read denied");
    },
    setItem() {},
    removeItem() {},
  };
}

/** setItem 直接抛异常的坏 storage(隐私模式 / 配额满 / 站点禁用存储的形态)。 */
function setItemThrowing(): Storage {
  return {
    length: 0,
    clear() {},
    key: () => null,
    getItem: () => null,
    setItem() {
      throw new Error("QuotaExceededError: write denied");
    },
    removeItem() {},
  };
}

/** setItem 静默吞写(只读实现)——契约要求「只读不写也算不可用」。 */
function writeSwallowing(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {},
    key: () => null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem(_key: string, _value: string) {},
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("safeStorage:真实可用时直通", () => {
  // Node 26 上全局 localStorage 被遮蔽(返回 undefined),真实路径在该环境不可测,跳过。
  (realLocalStorageUsable ? it : it.skip)(
    "returns the real globalThis.localStorage and it behaves normally",
    () => {
      const storage = safeStorage("local");
      // 直通:拿到的就是全局真实 Storage 实例本身,不是垫片。
      expect(storage).toBe(globalThis.localStorage);
      // 同 kind 多次调用返回同一实例(真实路径:全局对象本身稳定)。
      expect(safeStorage("local")).toBe(storage);
      expect(isStorageFallback("local")).toBe(false);
      expect(isStorageFallback("session")).toBe(false);
      // 行为正常:普通键 round-trip(用完即清)。
      storage.setItem(REAL_KEY, "ok");
      expect(storage.getItem(REAL_KEY)).toBe("ok");
      storage.removeItem(REAL_KEY);
      expect(storage.getItem(REAL_KEY)).toBeNull();
    },
  );
});

describe("safeStorage:取不到真实实现时回落垫片(永不抛)", () => {
  it("falls back when getItem throws", () => {
    const restore = replaceGlobal("local", getItemThrowing());
    try {
      const storage = safeStorage("local");
      expect(storage).not.toBe(globalThis.localStorage);
      expect(isStorageFallback("local")).toBe(true);
      // 垫片可写可读,不抛。
      storage.setItem("t:storage:getitem", "v");
      expect(storage.getItem("t:storage:getitem")).toBe("v");
    } finally {
      restore();
    }
  });

  it("falls back when setItem throws", () => {
    const restore = replaceGlobal("local", setItemThrowing());
    try {
      const storage = safeStorage("local");
      expect(storage).not.toBe(globalThis.localStorage);
      expect(isStorageFallback("local")).toBe(true);
      storage.setItem("t:storage:setitem", "v");
      expect(storage.getItem("t:storage:setitem")).toBe("v");
    } finally {
      restore();
    }
  });

  it("falls back when setItem silently swallows writes (read-only storage)", () => {
    const restore = replaceGlobal("local", writeSwallowing());
    try {
      // 只读不写也算不可用:探针写不进 → 必须回落垫片。
      expect(isStorageFallback("local")).toBe(true);
      const storage = safeStorage("local");
      storage.setItem("t:storage:readonly", "v");
      expect(storage.getItem("t:storage:readonly")).toBe("v");
    } finally {
      restore();
    }
  });

  it("falls back when globalThis.localStorage is undefined (Node 26 shadowing)", () => {
    const restore = replaceGlobal("local", undefined);
    try {
      const storage = safeStorage("local");
      expect(isStorageFallback("local")).toBe(true);
      storage.setItem("t:storage:undefined", "v");
      expect(storage.getItem("t:storage:undefined")).toBe("v");
      // 只替换了 local,session(真实可用)不受影响。
      expect(isStorageFallback("session")).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("垫片实现完整 Storage 接口(六成员)", () => {
  it("getItem/setItem/removeItem/clear/key/length behave per Storage semantics", () => {
    const restore = replaceGlobal("local", undefined);
    try {
      const storage = safeStorage("local");
      // 垫片是同 kind 单例,先清掉其他用例留下的共享状态。
      storage.clear();
      expect(storage.length).toBe(0);
      expect(storage.getItem("missing")).toBeNull();
      expect(storage.key(0)).toBeNull();

      storage.setItem("a", "1");
      storage.setItem("b", "2");
      expect(storage.length).toBe(2);
      expect(storage.getItem("a")).toBe("1");
      expect(storage.getItem("b")).toBe("2");

      // 同键覆盖不增计数,值更新。
      storage.setItem("a", "3");
      expect(storage.length).toBe(2);
      expect(storage.getItem("a")).toBe("3");

      // key() 按插入顺序;越界返回 null。
      expect(storage.key(0)).toBe("a");
      expect(storage.key(1)).toBe("b");
      expect(storage.key(2)).toBeNull();

      storage.removeItem("a");
      expect(storage.getItem("a")).toBeNull();
      expect(storage.length).toBe(1);
      // removeItem 幂等:删不存在的键不抛也不减。
      storage.removeItem("a");
      expect(storage.length).toBe(1);

      storage.clear();
      expect(storage.length).toBe(0);
      expect(storage.getItem("b")).toBeNull();
    } finally {
      restore();
    }
  });
});

describe("同 kind 单例(垫片状态在组件间共享)", () => {
  it("returns the same shim instance per kind and shares state; kinds stay isolated", () => {
    const restoreLocal = replaceGlobal("local", undefined);
    const restoreSession = replaceGlobal("session", undefined);
    try {
      const a1 = safeStorage("local");
      const a2 = safeStorage("local");
      expect(a2).toBe(a1);
      a1.setItem("shared", "yes");
      expect(a2.getItem("shared")).toBe("yes");

      const s1 = safeStorage("session");
      const s2 = safeStorage("session");
      expect(s2).toBe(s1);
      // 不同 kind 各自隔离:local 垫片与 session 垫片是两个实例、两个存储。
      expect(s1).not.toBe(a1);
      expect(s1.getItem("shared")).toBeNull();
    } finally {
      restoreSession();
      restoreLocal();
    }
  });
});

describe("isStorageFallback 两种返回", () => {
  it("true on the fallback path, false on the real path", () => {
    // 真实路径:本机(Node 24 jsdom)session 真实可用。
    if (realLocalStorageUsable) {
      expect(isStorageFallback("session")).toBe(false);
    }
    const restore = replaceGlobal("session", setItemThrowing());
    try {
      expect(isStorageFallback("session")).toBe(true);
      // 只影响被替换的 kind;local 未被动过。
      if (realLocalStorageUsable) {
        expect(isStorageFallback("local")).toBe(false);
      }
    } finally {
      restore();
    }
  });
});

describe("M7-X 契约类型冒烟(types.ts 冻结签名)", () => {
  it("SourceFileResponse / SessionTableSummary.sourcePath / SessionCapabilities.reveal", () => {
    const source: SourceFileResponse = {
      table: "skills",
      kind: "table",
      path: "tables/skills.txt",
      text: "id\tname\n",
      bytes: 9,
    };
    expect(source.kind).toBe("table");
    expect(source.path).toBe("tables/skills.txt");

    const summary: SessionTableSummary = {
      name: "skills",
      schemaPath: "schemas/skills.json",
      rowCount: 1,
      sourceFingerprint: "47f6f165",
      schemaFingerprint: "9c2f1a70",
      sourcePath: "tables/skills.txt",
    };
    expect(summary.sourcePath).toBe("tables/skills.txt");

    const capabilities: SessionCapabilities = {
      submit: true,
      commit: true,
      export: ["csv", "tsv", "txt"],
      events: true,
      history: true,
      reveal: false,
    };
    expect(capabilities.reveal).toBe(false);
    expect(capabilities.export).toContain("txt");
  });
});

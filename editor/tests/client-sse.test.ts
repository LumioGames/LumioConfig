import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  createLivenessWatchdog,
  HostApiError,
  reconnectDelayMs,
  SSE_LIVENESS_TIMEOUT_MS,
  subscribeEvents,
  subscribeEventsWithReconnect,
  type EventStreamCallbacks,
} from "../src/api/client";
import { LocalDraftSessionProvider } from "../src/api/draftSession";

/** 真实 timers 下的一个宏任务拍:让 pump() 的微任务队列走完。 */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeCallbacks(): EventStreamCallbacks {
  return {
    onEvent: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onHeartbeat: vi.fn(),
  };
}

function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  // reader 被 cancel 后控制器即关闭,后续 enqueue/close/error 会抛——测试里静默忽略。
  return {
    stream,
    push(chunk: string) {
      try {
        controller.enqueue(encoder.encode(chunk));
      } catch {
        // 控制器已关闭
      }
    },
    close() {
      try {
        controller.close();
      } catch {
        // 控制器已关闭
      }
    },
    fail() {
      try {
        controller.error(new Error("stream broke"));
      } catch {
        // 控制器已关闭
      }
    },
  };
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, statusText: "OK", body: stream } as unknown as Response;
}

function jsonResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "test",
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("subscribeEvents 生命周期", () => {
  it("建流成功(HTTP 200 且拿到 body)→ onOpen 恰好一次", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    await subscribeEvents(cb);
    expect(cb.onOpen).toHaveBeenCalledTimes(1);
    expect(cb.onClose).not.toHaveBeenCalled();
  });

  it("收到 `:\\n\\n` 心跳注释块 → onHeartbeat 且不派发 onEvent", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    await subscribeEvents(cb);
    src.push(":\n\n");
    await tick();
    expect(cb.onHeartbeat).toHaveBeenCalledTimes(1);
    expect(cb.onEvent).not.toHaveBeenCalled();
    src.push(":\n\n");
    await tick();
    expect(cb.onHeartbeat).toHaveBeenCalledTimes(2);
    expect(cb.onEvent).not.toHaveBeenCalled();
  });

  it("收到真事件 → onEvent(解析后的 JSON)且同样计入 onHeartbeat", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    await subscribeEvents(cb);
    src.push('event: table_changed\ndata: {"table":"skills","version":7}\n\n');
    await tick();
    expect(cb.onEvent).toHaveBeenCalledTimes(1);
    expect(cb.onEvent).toHaveBeenCalledWith("table_changed", { table: "skills", version: 7 });
    expect(cb.onHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("!response.ok → onClose('error'),不抛", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(503, '{"code":"UNAVAILABLE"}')));
    const cb = makeCallbacks();
    const dispose = await subscribeEvents(cb);
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith("error");
    expect(cb.onOpen).not.toHaveBeenCalled();
    expect(typeof dispose).toBe("function");
  });

  it("response.ok 但无 body → onClose('error')", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 } as unknown as Response)));
    const cb = makeCallbacks();
    await subscribeEvents(cb);
    expect(cb.onClose).toHaveBeenCalledWith("error");
    expect(cb.onOpen).not.toHaveBeenCalled();
  });

  it("fetch reject → onClose('error') 且 promise 不 reject 给调用方", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const cb = makeCallbacks();
    // 直接 await:若 promise reject,这里会抛出使测试失败——即"不 reject 给调用方"的断言。
    const dispose = await subscribeEvents(cb);
    expect(typeof dispose).toBe("function");
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith("error");
    expect(cb.onOpen).not.toHaveBeenCalled();
    dispose();
  });

  it("流 done → onClose('ended')", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    await subscribeEvents(cb);
    src.close();
    await tick();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith("ended");
  });

  it("read() 抛错 → onClose('error')", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    await subscribeEvents(cb);
    src.fail();
    await tick();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith("error");
  });

  it("主动 dispose(调用方 cancel)→ 不触发 onClose", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    const dispose = await subscribeEvents(cb);
    dispose();
    src.push(":\n\n");
    src.close();
    await tick();
    await tick();
    expect(cb.onClose).not.toHaveBeenCalled();
    expect(cb.onEvent).not.toHaveBeenCalled();
  });
});

describe("createLivenessWatchdog", () => {
  it("超时只触发一次 onDead;feed() 复活后可再次触发", () => {
    vi.useFakeTimers();
    const onDead = vi.fn();
    const watchdog = createLivenessWatchdog({ timeoutMs: 5_000, onDead });
    watchdog.feed();
    vi.advanceTimersByTime(4_999);
    expect(onDead).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDead).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(onDead).toHaveBeenCalledTimes(1);
    watchdog.feed();
    vi.advanceTimersByTime(5_000);
    expect(onDead).toHaveBeenCalledTimes(2);
  });

  it("feed() 重置计时窗口", () => {
    vi.useFakeTimers();
    const onDead = vi.fn();
    const watchdog = createLivenessWatchdog({ timeoutMs: 5_000, onDead });
    watchdog.feed();
    vi.advanceTimersByTime(3_000);
    watchdog.feed();
    vi.advanceTimersByTime(3_000);
    expect(onDead).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("SSE_LIVENESS_TIMEOUT_MS 为 5000(Host 心跳 1s 的 5 倍余量)", () => {
    expect(SSE_LIVENESS_TIMEOUT_MS).toBe(5_000);
  });
});

describe("退避重连", () => {
  it("reconnectDelayMs 序列 1s → 2s → 5s → 10s → 10s…", () => {
    expect([1, 2, 3, 4, 5, 9].map(reconnectDelayMs)).toEqual([
      1_000,
      2_000,
      5_000,
      10_000,
      10_000,
      10_000,
    ]);
  });

  it("subscribeEventsWithReconnect 按退避序列重连,每次失败只写一条 console,dispose 停止重连", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const cb = makeCallbacks();
    const dispose = subscribeEventsWithReconnect(cb);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith("error");
    expect(warnSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(warnSpy).toHaveBeenCalledTimes(6);

    dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("重连成功 → 再次走 onOpen 且失败计数清零(下一次失败仍从 1s 起算)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const src = controlledStream();
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 2) {
          return sseResponse(src.stream);
        }
        throw new TypeError("Failed to fetch");
      }),
    );
    const cb = makeCallbacks();
    const dispose = subscribeEventsWithReconnect(cb);

    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onOpen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cb.onOpen).toHaveBeenCalledTimes(1);

    src.push('event: ping\ndata: {"ok":true}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onEvent).toHaveBeenCalledWith("ping", { ok: true });
    expect(cb.onHeartbeat).toHaveBeenCalledTimes(1);

    src.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onClose).toHaveBeenCalledWith("ended");
    // 计数已清零:ended 后第一次重连延迟是 1s(未清零则是 2s)
    await vi.advanceTimersByTimeAsync(999);
    expect(call).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(call).toBe(3);
    dispose();
  });
});

describe("api 网络不可达", () => {
  it("fetch 本身 reject → 抛 HostApiError('NETWORK_UNREACHABLE')", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const error = await api("/api/session").then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HostApiError);
    expect((error as HostApiError).code).toBe("NETWORK_UNREACHABLE");
  });

  it("HTTP 层业务错误码保持现状,不被改写为 NETWORK_UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, '{"code":"VERSION_CONFLICT"}')));
    const error = await api("/api/tables/skills").then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HostApiError);
    expect((error as HostApiError).code).toBe("VERSION_CONFLICT");
  });
});

describe("LocalDraftSessionProvider.subscribe 透传", () => {
  it("透传 EventStreamCallbacks,onOpen/onHeartbeat/onEvent 都到达;主动 stop 不误报 onClose", async () => {
    const src = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(src.stream)));
    const cb = makeCallbacks();
    const provider = new LocalDraftSessionProvider();
    const stop = provider.subscribe(cb);
    await tick();
    expect(cb.onOpen).toHaveBeenCalledTimes(1);
    src.push(":\n\n");
    await tick();
    expect(cb.onHeartbeat).toHaveBeenCalledTimes(1);
    src.push('event: revision\ndata: {"rev":"r1"}\n\n');
    await tick();
    expect(cb.onEvent).toHaveBeenCalledWith("revision", { rev: "r1" });
    stop();
    src.close();
    await tick();
    expect(cb.onClose).not.toHaveBeenCalled();
  });
});

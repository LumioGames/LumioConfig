import { safeStorage } from "../app/storage";
import type { HistoryEntry, SourceFileResponse } from "./types";

export class HostApiError extends Error {
  readonly code: string;
  readonly errors: unknown[];

  constructor(code: string, message: string, errors: unknown[] = []) {
    super(message);
    this.code = code;
    this.errors = errors;
  }
}

const TOKEN_KEY = "lumio-token";

export function readToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = params.get("token");
  if (fromHash) {
    // M7-K:session 存取统一走 safeStorage,隐私模式/存储被禁时不抛(见 no-bare-localstorage 守卫)。
    safeStorage("session").setItem(TOKEN_KEY, fromHash);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  return safeStorage("session").getItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    // M7-A §2:fetch 本身 reject(如 Host 进程没了的 TypeError: Failed to fetch)是
    // "网络不可达",与 HTTP 层业务错误码区分;后者维持现状透传。
    const message = error instanceof Error ? error.message : "network unreachable";
    throw new HostApiError("NETWORK_UNREACHABLE", message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let payload: { code?: string; message?: string; errors?: unknown[] } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    throw new HostApiError(payload.code ?? "ERROR", payload.message ?? response.statusText, payload.errors ?? []);
  }
  return payload as T;
}

/** §9:修订级差异。`since` 缺省取最近 `limit` 条(Host 上限 100)。 */
export async function history(
  table: string,
  since?: string,
  limit = 20,
): Promise<{ items: HistoryEntry[] }> {
  const params = new URLSearchParams();
  if (since) {
    params.set("since", since);
  }
  params.set("limit", String(limit));
  return api(`/api/tables/${encodeURIComponent(table)}/history?${params.toString()}`);
}

/**
 * M7-E §3:只读源文件快照。`kind` 是闭合枚举,路径由 Host 按两个写死前缀拼装,
 * 前端只传表名与 kind;超 2 MiB 时 Host 回 413 PAYLOAD_TOO_LARGE(走 HostApiError)。
 */
export async function sourceFile(
  table: string,
  kind: "table" | "schema",
): Promise<SourceFileResponse> {
  const params = new URLSearchParams({ kind });
  return api(`/api/tables/${encodeURIComponent(table)}/source?${params.toString()}`);
}

/** M7-A §1:SSE 订阅生命周期回调。 */
export interface EventStreamCallbacks {
  onEvent(name: string, data: unknown): void;
  /** 单次订阅内首次成功建立流(HTTP 200 且拿到 body)时调用一次。 */
  onOpen?(): void;
  /** 流结束或出错时调用一次;主动 dispose 不触发。reason 只用于日志与测试断言,不进用户文案。 */
  onClose?(reason: "ended" | "error" | "stale"): void;
  /** 收到任意字节(含 `:` 心跳注释块)时调用,供调用方喂看门狗。 */
  onHeartbeat?(): void;
}

export async function subscribeEvents(cb: EventStreamCallbacks): Promise<() => void> {
  const token = readToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch("/api/events", { headers });
  } catch {
    // M7-A §1:建流失败不抛给调用方,统一走 onClose("error")。
    cb.onClose?.("error");
    return () => {};
  }
  if (!response.ok || !response.body) {
    cb.onClose?.("error");
    return () => {};
  }
  cb.onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let cancelled = false;
  let reported = false;
  const report = (reason: "ended" | "error") => {
    // M7-A §1:主动 dispose(调用方 cancel)不触发 onClose,避免切表/卸载误报掉线。
    if (cancelled || reported) {
      return;
    }
    reported = true;
    cb.onClose?.(reason);
  };
  const pump = async () => {
    try {
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        // M7-A:Host 的心跳是 `:\n\n` 注释块(server.py:422-426 的 Empty 超时分支),
        // 块里没有 data: 行,onEvent 分支看不到它——存活探测必须做在
        // reader.read() 的字节层:每次返回非空 value 就喂一次 onHeartbeat。
        if (value && value.length > 0) {
          cb.onHeartbeat?.();
        }
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          let name = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) {
              name = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              data = line.slice(5).trim();
            }
          }
          if (data) {
            try {
              cb.onEvent(name, JSON.parse(data));
            } catch {
              cb.onEvent(name, data);
            }
          }
        }
      }
      report("ended");
    } catch {
      report("error");
    }
  };
  void pump();
  return () => {
    cancelled = true;
    void reader.cancel().catch(() => undefined);
  };
}

/**
 * M7-A §4:存活看门狗超时。Host 的 SSE 循环每 1 秒发一次 `:\n\n` 心跳注释
 * (src/lumio_config/editor/server.py:422-426 的 Empty 超时分支),
 * 取 5 秒 = 5 倍余量:连续 5 个心跳窗口没收到任何字节才判死。
 */
export const SSE_LIVENESS_TIMEOUT_MS = 5_000;

/**
 * M7-A §4:存活看门狗。`feed()` 重置计时;`timeoutMs` 内没被 feed 过就调一次
 * `onDead`(只调一次,直到下次 `feed()` 复活)。创建后不计时,首次 `feed()` 才开始。
 */
export function createLivenessWatchdog(opts: {
  timeoutMs: number;
  onDead: () => void;
}): { feed(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;
  return {
    feed() {
      dead = false;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        if (dead) {
          return;
        }
        dead = true;
        opts.onDead();
      }, opts.timeoutMs);
    },
  };
}

/** M7-A §5:重连退避序列 1s → 2s → 5s → 10s → 10s…(连续失败次数从 1 起计,封顶 10s)。 */
const RECONNECT_STEPS_MS: readonly number[] = [1_000, 2_000, 5_000, 10_000];

/** 第 `consecutiveFailures` 次连续失败后应等待的毫秒数。 */
export function reconnectDelayMs(consecutiveFailures: number): number {
  const index = Math.min(Math.max(consecutiveFailures - 1, 0), RECONNECT_STEPS_MS.length - 1);
  return RECONNECT_STEPS_MS[index];
}

/**
 * M7-A §5:带退避重连的事件流订阅。断线/建流失败后按 reconnectDelayMs 重连,
 * 重连成功再次走 onOpen(失败计数清零);重连期间不刷数据、不动草稿(由调用方保证);
 * 每次失败只写一条 console.warn,不刷屏。dispose 后立即停止重连。
 */
export function subscribeEventsWithReconnect(cb: EventStreamCallbacks): () => void {
  let disposed = false;
  let failures = 0;
  let stopStream: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const clearRetry = () => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const connect = () => {
    if (disposed) {
      return;
    }
    void subscribeEvents({
      onEvent: (name, data) => {
        if (!disposed) {
          cb.onEvent(name, data);
        }
      },
      onHeartbeat: () => {
        if (!disposed) {
          cb.onHeartbeat?.();
        }
      },
      onOpen: () => {
        if (!disposed) {
          failures = 0;
          cb.onOpen?.();
        }
      },
      onClose: (reason) => {
        if (disposed) {
          return;
        }
        cb.onClose?.(reason);
        stopStream?.();
        stopStream = undefined;
        failures += 1;
        const delayMs = reconnectDelayMs(failures);
        console.warn(`[sse] 事件流断开(${reason}),${delayMs / 1000}s 后第 ${failures} 次重连`);
        clearRetry();
        retryTimer = setTimeout(connect, delayMs);
      },
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      stopStream = dispose;
    });
  };

  connect();
  return () => {
    disposed = true;
    clearRetry();
    stopStream?.();
    stopStream = undefined;
  };
}

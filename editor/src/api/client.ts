import type { HistoryEntry } from "./types";

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
    sessionStorage.setItem(TOKEN_KEY, fromHash);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  return sessionStorage.getItem(TOKEN_KEY);
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
  const response = await fetch(path, { ...init, headers });
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

export async function subscribeEvents(handler: (name: string, data: unknown) => void): Promise<() => void> {
  const token = readToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch("/api/events", { headers });
  if (!response.ok || !response.body) {
    throw new HostApiError("EVENTS", "event stream unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let cancelled = false;
  const pump = async () => {
    while (!cancelled) {
      const { done, value } = await reader.read();
      if (done) {
        break;
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
            handler(name, JSON.parse(data));
          } catch {
            handler(name, data);
          }
        }
      }
    }
  };
  void pump();
  return () => {
    cancelled = true;
    void reader.cancel();
  };
}

import type { Draft, PatchApplyResponse, PatchObject, RebaseResponse, TableResponse } from "./types";
import { api, type EventStreamCallbacks, HostApiError, subscribeEvents } from "./client";

export type SubmitResult = PatchApplyResponse;

export interface DraftSessionProvider {
  load(table: string): Promise<{ table: TableResponse; draft?: Draft }>;
  saveDraft(table: string, draft: Draft, expectedVersion: number): Promise<number>;
  submit(patch: unknown): Promise<SubmitResult>;
  rebase(table: string, expectedVersion: number): Promise<RebaseResponse>;
  subscribe(cb: EventStreamCallbacks): () => void;
}

export class LocalDraftSessionProvider implements DraftSessionProvider {
  async load(table: string): Promise<{ table: TableResponse; draft?: Draft }> {
    const tableResponse = await api<TableResponse>(`/api/tables/${table}`);
    try {
      const draft = await api<Draft>(`/api/drafts/${table}`);
      return { table: tableResponse, draft };
    } catch (error) {
      if (error instanceof HostApiError && (error.code === "NOT_FOUND" || error.code === "UNKNOWN_TABLE")) {
        return { table: tableResponse };
      }
      throw error;
    }
  }

  async saveDraft(table: string, draft: Draft, expectedVersion: number): Promise<number> {
    const body = { ...draft, expectedDraftVersion: expectedVersion };
    const result = await api<{ draftVersion: number }>(`/api/drafts/${table}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return result.draftVersion;
  }

  async submit(patch: unknown): Promise<SubmitResult> {
    return api<PatchApplyResponse>("/api/patch/apply", {
      method: "POST",
      body: JSON.stringify(patch as PatchObject),
    });
  }

  async rebase(table: string, expectedVersion: number): Promise<RebaseResponse> {
    return api<RebaseResponse>(`/api/drafts/${table}/rebase`, {
      method: "POST",
      body: JSON.stringify({ expectedDraftVersion: expectedVersion }),
    });
  }

  subscribe(cb: EventStreamCallbacks): () => void {
    let stop: (() => void) | undefined;
    let disposed = false;
    void subscribeEvents(cb)
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        stop = dispose;
      })
      .catch(() => {
        // M7-A §3:订阅生命周期不再吞异常——意外 reject 也回调 onClose("error")。
        if (!disposed) {
          cb.onClose?.("error");
        }
      });
    return () => {
      disposed = true;
      stop?.();
      stop = undefined;
    };
  }
}

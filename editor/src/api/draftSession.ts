import type { Draft, PatchApplyResponse, PatchObject, RebaseResponse, TableResponse } from "./types";
import { api, HostApiError, subscribeEvents } from "./client";

export type SubmitResult = PatchApplyResponse;

export interface DraftSessionProvider {
  load(table: string): Promise<{ table: TableResponse; draft?: Draft }>;
  saveDraft(table: string, draft: Draft, expectedVersion: number): Promise<number>;
  submit(patch: unknown): Promise<SubmitResult>;
  rebase(table: string, expectedVersion: number): Promise<RebaseResponse>;
  subscribe(handler: (name: string, data: unknown) => void): () => void;
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

  subscribe(handler: (name: string, data: unknown) => void): () => void {
    let stop: (() => void) | undefined;
    void subscribeEvents(handler).then((dispose) => {
      stop = dispose;
    });
    return () => stop?.();
  }
}

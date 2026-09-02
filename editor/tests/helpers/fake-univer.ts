import type { CommandInterceptEvent, InterceptorHost } from "../../src/spreadsheet/interceptors";

export class FakeUniver implements InterceptorHost {
  Event = {
    BeforeCommandExecute: "BeforeCommandExecute",
    CommandExecuted: "CommandExecuted",
  };
  executed: Array<{ id: string; params?: unknown }> = [];
  private befores: Array<(event: CommandInterceptEvent) => void> = [];
  private afters: Array<(event: CommandInterceptEvent) => void> = [];

  addEvent(event: unknown, handler: (event: CommandInterceptEvent) => void) {
    if (event === this.Event.BeforeCommandExecute) {
      this.befores.push(handler);
    } else {
      this.afters.push(handler);
    }
    return {
      dispose: () => {
        this.befores = this.befores.filter((item) => item !== handler);
        this.afters = this.afters.filter((item) => item !== handler);
      },
    };
  }

  emit(id: string, params?: unknown): CommandInterceptEvent {
    const event: CommandInterceptEvent = { id, params };
    for (const handler of this.befores) {
      handler(event);
    }
    if (!event.cancel) {
      for (const handler of this.afters) {
        handler(event);
      }
    }
    return event;
  }

  executeCommand(id: string, params?: unknown) {
    this.executed.push({ id, params });
    return this.emit(id, params);
  }
}

export class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

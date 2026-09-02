import type { PocBridge } from "./app/App";

declare global {
  interface Window {
    __lumioPoc?: PocBridge;
  }
}

export {};

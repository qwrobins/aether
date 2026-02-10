/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      invoke: <K extends string>(channel: K, ...args: unknown[]) => Promise<unknown>;
      on: <K extends string>(channel: K, callback: (data: unknown) => void) => () => void;
    };
  }
}

export {};

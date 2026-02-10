/// <reference types="vite/client" />

import type { IpcInvokeMap, IpcEventMap } from '@shared/types/ipc';

declare global {
  interface Window {
    api: {
      invoke: <K extends keyof IpcInvokeMap>(
        channel: K,
        ...args: IpcInvokeMap[K]['args']
      ) => Promise<IpcInvokeMap[K]['return']>;
      on: <K extends keyof IpcEventMap>(
        channel: K,
        callback: (data: IpcEventMap[K]) => void
      ) => () => void;
    };
  }
}

export {};

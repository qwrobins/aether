import { create } from 'zustand';
import { useTransferStore } from './transferStore';
import type { TaildropAvailability, TaildropReceiveResult, TaildropTarget } from '@shared/types/taildrop';
import type { TransferItem, TransferRequest } from '@shared/types/transfer';

interface TaildropHistoryItem {
  id: string;
  kind: 'sent' | 'received';
  fileName: string;
  targetName?: string;
  destinationPath?: string;
  status: 'completed' | 'failed';
  createdAt: string;
  error?: string;
}

interface TaildropState {
  availability: TaildropAvailability | null;
  targets: TaildropTarget[];
  history: TaildropHistoryItem[];
  isLoading: boolean;
  error: string | null;

  refresh: (options?: { silent?: boolean }) => Promise<void>;
  sendFiles: (target: TaildropTarget, files: Array<{ path: string; name: string; size?: number; isDirectory?: boolean }>) => Promise<void>;
  collectReceived: (destinationPath: string) => Promise<TaildropReceiveResult>;
  addHistory: (item: TaildropHistoryItem) => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function itemFromTransfer(
  id: string,
  request: TransferRequest,
  fileName: string,
  size = 0,
): TransferItem {
  return {
    id,
    fileName,
    sourcePath: request.sourcePath,
    destinationPath: request.destinationPath,
    direction: 'upload',
    connectionId: request.connectionId,
    connectionType: 'taildrop',
    targetName: request.targetName,
    size,
    bytesTransferred: 0,
    status: 'queued',
    speed: 0,
    retryCount: 0,
  };
}

export const useTaildropStore = create<TaildropState>((set, get) => ({
  availability: null,
  targets: [],
  history: [],
  isLoading: false,
  error: null,

  refresh: async (options = {}) => {
    if (!options.silent) {
      set({ isLoading: true, error: null });
    } else {
      set({ error: null });
    }
    try {
      const availability = await window.api.invoke('taildrop:status');
      if (availability.status !== 'available') {
        set({
          availability,
          targets: [],
          isLoading: false,
          error: availability.message ?? 'Tailscale Taildrop is not available',
        });
        return;
      }

      const targets = await window.api.invoke('taildrop:list-targets');
      set({ availability, targets, isLoading: false, error: null });
    } catch (error) {
      set({
        availability: null,
        targets: [],
        isLoading: false,
        error: getErrorMessage(error, 'Could not load Taildrop devices'),
      });
    }
  },

  sendFiles: async (target, files) => {
    const addTransfer = useTransferStore.getState().addTransfer;
    const failures: string[] = [];
    for (const file of files) {
      if (file.isDirectory) {
        failures.push(`${file.name}: Taildrop directory sends are not supported yet`);
        get().addHistory({
          id: crypto.randomUUID(),
          kind: 'sent',
          fileName: file.name,
          targetName: target.name,
          status: 'failed',
          createdAt: new Date().toISOString(),
          error: 'Taildrop directory sends are not supported yet',
        });
        continue;
      }

      const request: TransferRequest = {
        sourcePath: file.path,
        destinationPath: target.id,
        direction: 'upload',
        connectionId: 'taildrop',
        connectionType: 'taildrop',
        targetName: target.name,
        isDirectory: false,
      };

      try {
        const result = await window.api.invoke('transfer:start', request);
        if (Array.isArray(result)) {
          for (const item of result) addTransfer(item);
        } else {
          addTransfer(itemFromTransfer(result, request, file.name, file.size ?? 0));
        }
      } catch (error) {
        const message = getErrorMessage(error, 'Taildrop send failed');
        failures.push(`${file.name}: ${message}`);
        get().addHistory({
          id: crypto.randomUUID(),
          kind: 'sent',
          fileName: file.name,
          targetName: target.name,
          status: 'failed',
          createdAt: new Date().toISOString(),
          error: message,
        });
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }
  },

  collectReceived: async (destinationPath) => {
    const result = await window.api.invoke('taildrop:receive', { destinationPath });
    const now = new Date().toISOString();
    const items = result.files.length > 0
      ? result.files.map((fileName) => ({
          id: crypto.randomUUID(),
          kind: 'received' as const,
          fileName,
          destinationPath: result.destinationPath,
          status: 'completed' as const,
          createdAt: now,
        }))
      : [{
          id: crypto.randomUUID(),
          kind: 'received' as const,
          fileName: 'No files waiting',
          destinationPath: result.destinationPath,
          status: 'completed' as const,
          createdAt: now,
        }];
    set((state) => ({ history: [...items, ...state.history].slice(0, 100) }));
    return result;
  },

  addHistory: (item) =>
    set((state) => ({ history: [item, ...state.history].slice(0, 100) })),
}));

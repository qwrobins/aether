import { create } from 'zustand';
import { useUiStore } from './uiStore';
import type { TransferItem, TransferProgress, TransferResult } from '@shared/types/transfer';

interface TransferState {
  transfers: TransferItem[];

  addTransfer: (item: TransferItem) => void;
  updateProgress: (progress: TransferProgress) => void;
  markComplete: (result: TransferResult) => void;
  markError: (transferId: string, error: string) => void;
  removeTransfer: (id: string) => void;
  clearCompleted: () => void;
  clearSuccessful: () => void;
  setTransfers: (transfers: TransferItem[]) => void;

  // Computed helpers
  activeCount: () => number;
  queuedCount: () => number;
  totalRemaining: () => number;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: [],

  addTransfer: (item) => {
    set((s) => ({ transfers: [...s.transfers, item] }));
    // Auto-expand the transfer queue so progress bars are visible
    useUiStore.setState({ transferQueueExpanded: true });
  },

  updateProgress: (progress) =>
    set((s) => ({
      transfers: s.transfers.map((t) =>
        t.id === progress.transferId
          ? {
              ...t,
              bytesTransferred: progress.bytesTransferred,
              size: progress.totalBytes,
              speed: progress.speed,
              status: 'active' as const,
            }
          : t
      ),
    })),

  markComplete: (result) =>
    set((s) => ({
      transfers: s.transfers.map((t) =>
        t.id === result.transferId
          ? {
              ...t,
              status: result.status,
              error: 'error' in result ? result.error : undefined,
              completedAt: new Date().toISOString(),
              speed: 0,
            }
          : t
      ),
    })),

  markError: (transferId, error) =>
    set((s) => ({
      transfers: s.transfers.map((t) =>
        t.id === transferId ? { ...t, status: 'failed' as const, error } : t
      ),
    })),

  removeTransfer: (id) =>
    set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) })),

  clearCompleted: () =>
    set((s) => ({
      transfers: s.transfers.filter(
        (t) => !['completed', 'failed', 'cancelled'].includes(t.status)
      ),
    })),

  clearSuccessful: () =>
    set((s) => ({
      transfers: s.transfers.filter((t) => t.status !== 'completed'),
    })),

  setTransfers: (transfers) => set({ transfers }),

  activeCount: () => get().transfers.filter((t) => t.status === 'active').length,
  queuedCount: () => get().transfers.filter((t) => t.status === 'queued').length,
  totalRemaining: () => {
    const active = get().transfers.filter((t) =>
      ['active', 'queued'].includes(t.status)
    );
    return active.reduce(
      (sum, t) => sum + Math.max(0, t.size - t.bytesTransferred),
      0
    );
  },
}));

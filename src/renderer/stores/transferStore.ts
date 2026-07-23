import { create } from 'zustand';
import { useUiStore } from './uiStore';
import type { TransferItem, TransferProgress, TransferResult } from '@shared/types/transfer';

interface BatchProgress {
  remaining: number;
  successful: number;
}

export interface TransferCompletionState {
  transfer: TransferItem;
  batchFinished: boolean;
  batchHasSuccessfulTransfer: boolean;
}

interface TransferState {
  transfers: TransferItem[];
  batchProgress: Record<string, BatchProgress>;

  addTransfer: (item: TransferItem) => void;
  addTransfers: (items: TransferItem[]) => void;
  updateProgress: (progress: TransferProgress) => void;
  markComplete: (result: TransferResult) => TransferCompletionState | null;
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

function addToBatchProgress(
  current: Record<string, BatchProgress>,
  items: TransferItem[],
): Record<string, BatchProgress> {
  const next = { ...current };
  for (const item of items) {
    if (!item.batchId) continue;
    const progress = next[item.batchId] ?? { remaining: 0, successful: 0 };
    next[item.batchId] = {
      remaining: progress.remaining + (item.completedAt ? 0 : 1),
      successful: progress.successful + (item.status === 'completed' ? 1 : 0),
    };
  }
  return next;
}

function buildBatchProgress(transfers: TransferItem[]): Record<string, BatchProgress> {
  return addToBatchProgress({}, transfers);
}

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: [],
  batchProgress: {},

  addTransfer: (item) => {
    set((s) => ({
      transfers: [...s.transfers, item],
      batchProgress: addToBatchProgress(s.batchProgress, [item]),
    }));
    // Auto-expand the transfer queue so progress bars are visible
    useUiStore.setState({ transferQueueExpanded: true });
  },

  addTransfers: (items) => {
    if (items.length === 0) return;
    set((s) => ({
      transfers: [...s.transfers, ...items],
      batchProgress: addToBatchProgress(s.batchProgress, items),
    }));
    useUiStore.setState({ transferQueueExpanded: true });
  },

  updateProgress: (progress) =>
    set((s) => ({
      transfers: s.transfers.map((t) => {
        if (t.id !== progress.transferId) return t;
        // Ignore late progress events for transfers that already reached a
        // terminal state; never resurrect them back to active.
        if (t.status !== 'queued' && t.status !== 'active') return t;
        return {
          ...t,
          bytesTransferred: progress.bytesTransferred,
          size: progress.totalBytes,
          speed: progress.speed,
          status: 'active' as const,
        };
      }),
    })),

  markComplete: (result) => {
    let completion: TransferCompletionState | null = null;
    set((s) => {
      let completedTransfer: TransferItem | undefined;
      let updatedTransfer: TransferItem | undefined;
      const transfers = s.transfers.map((transfer) => {
        if (transfer.id !== result.transferId) return transfer;
        completedTransfer = transfer;
        updatedTransfer = {
          ...transfer,
          status: result.status,
          error: 'error' in result ? result.error : undefined,
          completedAt: new Date().toISOString(),
          speed: 0,
        };
        return updatedTransfer;
      });

      if (!completedTransfer || !updatedTransfer) return { transfers };

      const batchProgress = { ...s.batchProgress };
      if (!completedTransfer.batchId) {
        completion = {
          transfer: updatedTransfer,
          batchFinished: true,
          batchHasSuccessfulTransfer: result.status === 'completed',
        };
        return { transfers };
      }

      const batchId = completedTransfer.batchId;
      const current = batchProgress[batchId] ?? { remaining: 1, successful: 0 };
      const wasAlreadyCompleted = Boolean(completedTransfer.completedAt);
      const remaining = Math.max(0, current.remaining - (wasAlreadyCompleted ? 0 : 1));
      const successful =
        current.successful +
        (result.status === 'completed' && completedTransfer.status !== 'completed' ? 1 : 0);
      const batchFinished = remaining === 0;

      completion = {
        transfer: updatedTransfer,
        batchFinished,
        batchHasSuccessfulTransfer: successful > 0,
      };
      if (batchFinished) {
        delete batchProgress[batchId];
      } else {
        batchProgress[batchId] = { remaining, successful };
      }
      return { transfers, batchProgress };
    });
    return completion;
  },

  markError: (transferId, error) =>
    set((s) => ({
      transfers: s.transfers.map((t) =>
        t.id === transferId ? { ...t, status: 'failed' as const, error } : t
      ),
    })),

  removeTransfer: (id) =>
    set((s) => {
      let removed: TransferItem | undefined;
      const transfers = s.transfers.filter((transfer) => {
        if (transfer.id !== id) return true;
        removed = transfer;
        return false;
      });
      if (!removed?.batchId || removed.completedAt) return { transfers };

      const batchProgress = { ...s.batchProgress };
      const current = batchProgress[removed.batchId];
      if (current) {
        const remaining = Math.max(0, current.remaining - 1);
        if (remaining === 0) delete batchProgress[removed.batchId];
        else batchProgress[removed.batchId] = { ...current, remaining };
      }
      return { transfers, batchProgress };
    }),

  clearCompleted: () => {
    set((s) => ({
      transfers: s.transfers.filter(
        (t) => !['completed', 'failed', 'cancelled'].includes(t.status)
      ),
    }));
    // Let the main process drop its terminal transfer records too
    void window.api.invoke('transfer:clear').catch(() => undefined);
  },

  clearSuccessful: () => {
    set((s) => ({
      transfers: s.transfers.filter((t) => t.status !== 'completed'),
    }));
    // Let the main process drop its terminal transfer records too
    void window.api.invoke('transfer:clear').catch(() => undefined);
  },

  setTransfers: (transfers) => set({ transfers, batchProgress: buildBatchProgress(transfers) }),

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

import { useEffect } from 'react';
import { useTransferStore } from '@/stores/transferStore';
import type { TransferProgress, TransferResult } from '@shared/types/transfer';

export function useTransferEvents() {
  useEffect(() => {
    if (!window.api?.on) {
      console.warn('[Aether] window.api.on not available - transfer events disabled');
      return;
    }

    const unsubProgress = window.api.on('transfer:progress', (data: unknown) => {
      useTransferStore.getState().updateProgress(data as TransferProgress);
    });
    const unsubComplete = window.api.on('transfer:complete', (data: unknown) => {
      useTransferStore.getState().markComplete(data as TransferResult);
    });
    const unsubError = window.api.on('transfer:error', (data: unknown) => {
      const { transferId, error } = data as { transferId: string; error: string };
      useTransferStore.getState().markError(transferId, error);
    });

    return () => {
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, []);
}

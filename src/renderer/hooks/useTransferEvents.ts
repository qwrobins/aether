import { useEffect } from 'react';
import { useTransferStore } from '@/stores/transferStore';

export function useTransferEvents() {
  useEffect(() => {
    const unsubProgress = window.api.on('transfer:progress', (data) => {
      useTransferStore.getState().updateProgress(data);
    });
    const unsubComplete = window.api.on('transfer:complete', (data) => {
      useTransferStore.getState().markComplete(data);
    });
    const unsubError = window.api.on('transfer:error', (data) => {
      useTransferStore.getState().markError(data.transferId, data.error);
    });
    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);
}

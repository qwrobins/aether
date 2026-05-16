import { useEffect } from 'react';
import { useTransferStore } from '@/stores/transferStore';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTaildropStore } from '@/stores/taildropStore';
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
      const result = data as TransferResult;
      // Look up the transfer BEFORE marking complete so we know its direction
      const transfer = useTransferStore
        .getState()
        .transfers.find((t) => t.id === result.transferId);
      useTransferStore.getState().markComplete(result);

      // Auto-refresh the destination pane after a successful transfer
      if (result.success && transfer) {
        if (transfer.connectionType === 'taildrop') {
          useTaildropStore.getState().addHistory({
            id: result.transferId,
            kind: 'sent',
            fileName: transfer.fileName,
            targetName: transfer.targetName ?? transfer.destinationPath,
            status: 'completed',
            createdAt: new Date().toISOString(),
          });
        } else if (transfer.direction === 'upload') {
          useRemotePanelStore.getState().refresh();
        } else {
          useLocalPanelStore.getState().refresh();
        }
      } else if (!result.success && transfer?.connectionType === 'taildrop') {
        useTaildropStore.getState().addHistory({
          id: result.transferId,
          kind: 'sent',
          fileName: transfer.fileName,
          targetName: transfer.targetName ?? transfer.destinationPath,
          status: 'failed',
          createdAt: new Date().toISOString(),
          error: 'error' in result ? result.error : 'Taildrop send did not complete',
        });
      }
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

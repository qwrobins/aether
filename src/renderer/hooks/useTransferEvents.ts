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
      const completion = useTransferStore.getState().markComplete(result);
      const transfer = completion?.transfer;
      const shouldRefreshDestination =
        Boolean(completion?.batchFinished) &&
        Boolean(completion?.batchHasSuccessfulTransfer);

      if (transfer?.connectionType === 'taildrop') {
        useTaildropStore.getState().addHistory({
          id: result.transferId,
          kind: 'sent',
          fileName: transfer.fileName,
          targetName: transfer.targetName ?? transfer.destinationPath,
          status: result.success ? 'completed' : 'failed',
          createdAt: new Date().toISOString(),
          error: !result.success && 'error' in result ? result.error : undefined,
        });
      }

      // Auto-refresh the destination pane once a successful batch has finished.
      if (shouldRefreshDestination && transfer && transfer.connectionType !== 'taildrop') {
        if (transfer.direction === 'upload') {
          useRemotePanelStore.getState().refresh();
        } else {
          useLocalPanelStore.getState().refresh();
        }
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

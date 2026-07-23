import { useEffect } from 'react';
import { toast } from 'sonner';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { usePromptStore } from '@/stores/promptStore';
import { getSftpDeleteErrorMessage } from '@/lib/remote';

function joinLocalPath(basePath: string, name: string): string {
  return `${basePath.replace(/\/+$/, '')}/${name}`;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Don't handle shortcuts when a dialog is open
      if (usePromptStore.getState().isOpen) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const localStore = useLocalPanelStore.getState();
        const remoteStore = useRemotePanelStore.getState();

        const focusedPanel = document.activeElement?.closest('[data-panel]')?.getAttribute('data-panel');
        const remoteCount = remoteStore.selectedFiles.size;
        const localCount = localStore.selectedFiles.size;

        // Use the focused panel's selection; when focus is elsewhere, use the panel with more selections
        const useRemote =
          (focusedPanel === 'remote' && remoteCount > 0) ||
          (focusedPanel !== 'local' && remoteCount > 0 && remoteCount >= localCount);

        if (useRemote && remoteCount > 0) {
          const paths = Array.from(remoteStore.selectedFiles);
          if (remoteStore.activeProfile?.type === 's3') {
            if (!remoteStore.activeConnectionId || !remoteStore.currentBucket) {
              toast.error('No active S3 connection or bucket selected');
              return;
            }

            if (confirm(`Delete ${paths.length} remote item(s)?`)) {
              const connectionId = remoteStore.activeConnectionId as string;
              const bucket = remoteStore.currentBucket as string;
              Promise.allSettled(
                paths.map((p) =>
                  window.api.invoke('s3:delete-object', connectionId, bucket, p)
                )
              )
                .then(async (results) => {
                  const failures = results.filter(
                    (r): r is PromiseRejectedResult => r.status === 'rejected'
                  );
                  await remoteStore.refresh();
                  if (failures.length > 0) {
                    const reason = failures[0].reason;
                    console.error('[Aether] S3 delete partially failed:', reason);
                    toast.error(
                      `Failed to delete ${failures.length} of ${paths.length}: ${reason instanceof Error ? reason.message : String(reason)}`
                    );
                  }
                })
                .catch((err) => {
                  console.error('[Aether] S3 delete failed:', err);
                  toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
                });
            }
          } else if (remoteStore.activeProfile?.type === 'sftp') {
            if (!remoteStore.activeConnectionId) {
              toast.error('No active SFTP connection');
              return;
            }

            if (confirm(`Delete ${paths.length} remote item(s)?`)) {
              window.api
                .invoke('sftp:delete', remoteStore.activeConnectionId, paths)
                .then((result) =>
                  remoteStore.refresh().then(() => {
                    const message = getSftpDeleteErrorMessage(result);
                    if (message) {
                      toast.error(message);
                    }
                  }),
                )
                .catch((err) => {
                  console.error('[Aether] SFTP delete failed:', err);
                  toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
                });
            }
          }
        } else if (localCount > 0) {
          const paths = Array.from(localStore.selectedFiles);
          if (confirm(`Delete ${paths.length} item(s)?`)) {
            window.api
              .invoke('fs:delete', paths)
              .then(() => localStore.refresh())
              .catch((err) => {
                console.error('[Aether] Delete failed:', err);
                toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
              });
          }
        }
      }

      if (isCtrl && e.key === 'a') {
        // Select-all applies only to the focused panel; without panel focus,
        // leave default behavior (e.g. selecting text in inputs) intact.
        const focusedPanel = document.activeElement?.closest('[data-panel]')?.getAttribute('data-panel');
        if (focusedPanel !== 'local' && focusedPanel !== 'remote') return;
        e.preventDefault();
        if (focusedPanel === 'local') {
          const localStore = useLocalPanelStore.getState();
          if (localStore.entries.length > 0) localStore.selectAll();
        } else if (focusedPanel === 'remote') {
          const remoteStore = useRemotePanelStore.getState();
          if (remoteStore.entries.length > 0) remoteStore.selectAll();
        }
      }

      if (isCtrl && e.key === 'r') {
        e.preventDefault();
        useLocalPanelStore.getState().refresh();
        const remote = useRemotePanelStore.getState();
        if (remote.activeConnectionId) remote.refresh();
      }

      if (isCtrl && e.key === 'n') {
        e.preventDefault();
        (async () => {
          const name = await usePromptStore.getState().open({
            title: 'New Folder',
            placeholder: 'Folder name',
          });
          if (name) {
            const localStore = useLocalPanelStore.getState();
            const newPath = joinLocalPath(localStore.currentPath, name);
            window.api
              .invoke('fs:mkdir', newPath)
              .then(() => localStore.refresh())
              .catch((err) => {
                console.error('[Aether] New folder failed:', err);
                toast.error(`New folder failed: ${err instanceof Error ? err.message : String(err)}`);
              });
          }
        })();
      }

      if (e.key === 'F2') {
        e.preventDefault();
        (async () => {
          const localStore = useLocalPanelStore.getState();
          if (localStore.selectedFiles.size === 1) {
            const oldPath = Array.from(localStore.selectedFiles)[0];
            const oldName = oldPath.split('/').pop() ?? '';
            const newName = await usePromptStore.getState().open({
              title: 'Rename',
              defaultValue: oldName,
              placeholder: 'New name',
            });
            if (newName && newName !== oldName) {
              const newPath = oldPath.replace(/[^/]+$/, newName);
              window.api
                .invoke('fs:rename', oldPath, newPath)
                .then(() => localStore.refresh())
                .catch((err) => {
                  console.error('[Aether] Rename failed:', err);
                  toast.error(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
                });
            }
          }
        })();
      }

      if (e.key === 'Escape') {
        useLocalPanelStore.getState().clearSelection();
        useRemotePanelStore.getState().clearSelection();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

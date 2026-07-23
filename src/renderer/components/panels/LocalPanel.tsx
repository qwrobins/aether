import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { IpcChannels } from '@shared/constants/channels';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { usePromptStore } from '@/stores/promptStore';
import { consumeInternalDrag, isInternalDrag, parseDragTransferPayload } from '@/lib/drag-guard';
import { PanelHeader } from './PanelHeader';
import { FileList } from './FileList';
import { DropZone } from './DropZone';
import type { FileEntry } from '@shared/types/filesystem';
import type { ConnectionProfile } from '@shared/types/connection';
import type { TransferRequest } from '@shared/types/transfer';

function isMountableProfile(profile: ConnectionProfile): boolean {
  return profile.type === 'smb' || profile.type === 'nfs' || profile.type === 'webdav';
}

function joinLocalPath(basePath: string, name: string): string {
  return `${basePath.replace(/\/+$/, '')}/${name}`;
}

export function LocalPanel() {
  const {
    currentPath,
    entries,
    selectedFiles,
    isLoading,
    error,
    blockedPath,
    sortField,
    sortDirection,
    viewMode,
    navigateTo,
    refresh,
    selectFile,
    setSort,
    setViewMode,
  } = useLocalPanelStore();

  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!window.api?.invoke) return;
    window.api.invoke('fs:get-home').then(navigateTo).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only accept drops from the remote panel
    if (e.dataTransfer.types.includes('application/aether-transfer') && isInternalDrag()) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only trigger if leaving the panel (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const internal = consumeInternalDrag(e.dataTransfer);

      const raw = e.dataTransfer.getData('application/aether-transfer');
      // Ignore forged payloads: content outside this window can set the same
      // MIME type to download remote files over attacker-chosen local paths.
      if (!raw || !internal) return;

      const payload = parseDragTransferPayload(raw);
      if (!payload || payload.panelType !== 'remote') return;

      try {
        const { activeConnectionId, activeProfile, currentBucket } =
          useRemotePanelStore.getState();
        if (!activeConnectionId || !activeProfile) return;

        const { addTransfer, addTransfers } = useTransferStore.getState();
        for (const entry of payload.entries) {
          const request: TransferRequest = {
            sourcePath: entry.path,
            destinationPath: joinLocalPath(currentPath, entry.name),
            direction: 'download',
            connectionId: activeConnectionId,
            connectionType: activeProfile.type,
            bucket: currentBucket || undefined,
            isDirectory: entry.isDirectory,
          };

          const result = await window.api.invoke('transfer:start', request);
          if (Array.isArray(result)) {
            addTransfers(result);
          } else {
            addTransfer({
              id: result,
              fileName: entry.name,
              sourcePath: request.sourcePath,
              destinationPath: request.destinationPath,
              direction: 'download',
              connectionId: activeConnectionId,
              connectionType: activeProfile.type,
              bucket: request.bucket,
              size: entry.size || 0,
              bytesTransferred: 0,
              status: 'queued',
              speed: 0,
              retryCount: 0,
            });
          }
        }
      } catch (err) {
        console.error('[Aether] Download drop handler error:', err);
      }
    },
    [currentPath]
  );

  const handleDelete = useCallback(
    (paths: string[]) => {
      if (confirm(`Delete ${paths.length} item(s)?`)) {
        window.api.invoke('fs:delete', paths).then(() => refresh()).catch((err) => {
          console.error('[Aether] Delete failed:', err);
          toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    },
    [refresh]
  );

  const handleRename = useCallback(
    async (oldPath: string) => {
      const oldName = oldPath.split('/').pop() ?? '';
      const newName = await usePromptStore.getState().open({
        title: 'Rename',
        defaultValue: oldName,
        placeholder: 'New name',
      });
      if (newName && newName !== oldName) {
        const newPath = oldPath.replace(/[^/]+$/, newName);
        try {
          await window.api.invoke('fs:rename', oldPath, newPath);
          // refresh handles listing errors internally via store state.
          void refresh();
        } catch (err) {
          console.error('[Aether] Rename failed:', err);
          toast.error(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    },
    [refresh]
  );

  const handleNewFolder = useCallback(async () => {
    const name = await usePromptStore.getState().open({
      title: 'New Folder',
      placeholder: 'Folder name',
    });
    if (name) {
      const newPath = joinLocalPath(currentPath, name);
      window.api
        .invoke('fs:mkdir', newPath)
        .then(() => refresh())
        .catch((err) => {
          console.error('[Aether] New folder failed:', err);
          toast.error(`New folder failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }, [currentPath, refresh]);

  // Guards against rapid double-clicks enqueueing a duplicate transfer while
  // the transfer:start invoke is still pending.
  const transferStartPending = useRef(false);

  const handleTransfer = useCallback(
    async (entry: FileEntry) => {
      if (transferStartPending.current) return;
      const { activeConnectionId, activeProfile, currentPath: remotePath, currentBucket } =
        useRemotePanelStore.getState();
      if (!activeConnectionId || !activeProfile) return;

      transferStartPending.current = true;
      try {
        const destPath =
          activeProfile.type === 'sftp' ||
          activeProfile.type === 'rsync' ||
          isMountableProfile(activeProfile)
            ? `${remotePath.replace(/\/+$/, '')}/${entry.name}`
            : `${remotePath}${entry.name}`;

        const request: TransferRequest = {
          sourcePath: entry.path,
          destinationPath: destPath,
          direction: 'upload',
          connectionId: activeConnectionId,
          connectionType: activeProfile.type,
          bucket: currentBucket || undefined,
          isDirectory: entry.isDirectory,
        };

        const result = await window.api.invoke('transfer:start', request);
        const { addTransfer, addTransfers } = useTransferStore.getState();
        if (Array.isArray(result)) {
          addTransfers(result);
        } else {
          addTransfer({
            id: result,
            fileName: entry.name,
            sourcePath: request.sourcePath,
            destinationPath: request.destinationPath,
            direction: 'upload',
            connectionId: activeConnectionId,
            connectionType: activeProfile.type,
            bucket: request.bucket,
            size: entry.size || 0,
            bytesTransferred: 0,
            status: 'queued',
            speed: 0,
            retryCount: 0,
          });
        }
      } catch (err) {
        console.error('[Aether] Transfer start failed:', err);
        toast.error(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        transferStartPending.current = false;
      }
    },
    []
  );

  return (
    <div
      data-panel="local"
      className="relative flex min-h-0 h-full flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DropZone isActive={isDragOver} direction="download" />

      <PanelHeader
        label="Local"
        path={currentPath}
        isActive={true}
        viewMode={viewMode}
        onNavigate={navigateTo}
        onRefresh={refresh}
        onNewFolder={handleNewFolder}
        onViewModeChange={setViewMode}
      />

      {error && (
        <div className="px-3 py-2 text-[12px] text-destructive bg-destructive/5 border-b border-destructive/20">
          {blockedPath ? (
            <span>
              macOS blocked access to this folder.{' '}
              <button
                type="button"
                className="underline hover:no-underline transition-all duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                onClick={() => {
                  void window.api
                    .invoke(IpcChannels.DIALOG_OPEN_DIRECTORY, blockedPath)
                    .then((selected) => {
                      if (selected) navigateTo(selected);
                    })
                    .catch((err) => {
                      toast.error(
                        `Could not open folder picker: ${err instanceof Error ? err.message : String(err)}`,
                      );
                    });
                }}
              >
                Grant Access
              </button>
            </span>
          ) : (
            error
          )}
        </div>
      )}

      <FileList
        listKey={currentPath}
        entries={entries}
        selectedFiles={selectedFiles}
        isLoading={isLoading}
        sortField={sortField}
        sortDirection={sortDirection}
        viewMode={viewMode}
        panelType="local"
        onSelect={selectFile}
        onNavigate={navigateTo}
        onSort={setSort}
        onDelete={handleDelete}
        onRename={handleRename}
        onNewFolder={handleNewFolder}
        onTransfer={handleTransfer}
      />
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { PanelHeader } from './PanelHeader';
import { FileList } from './FileList';
import { DropZone } from './DropZone';
import type { FileEntry } from '@shared/types/filesystem';
import type { TransferRequest } from '@shared/types/transfer';

export function LocalPanel() {
  const {
    currentPath,
    entries,
    selectedFiles,
    isLoading,
    error,
    sortField,
    sortDirection,
    viewMode,
    navigateTo,
    refresh,
    selectFile,
    setSort,
  } = useLocalPanelStore();

  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!window.api?.invoke) return;
    window.api.invoke('fs:get-home').then(navigateTo).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only accept drops from the remote panel
    if (e.dataTransfer.types.includes('application/aether-transfer')) {
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

      const raw = e.dataTransfer.getData('application/aether-transfer');
      if (!raw) return;

      try {
        const payload = JSON.parse(raw);
        if (payload.panelType !== 'remote') return;

        const { activeConnectionId, activeProfile, currentBucket } =
          useRemotePanelStore.getState();
        if (!activeConnectionId || !activeProfile) return;

        const addTransfer = useTransferStore.getState().addTransfer;
        for (const entry of payload.entries) {
          const request: TransferRequest = {
            sourcePath: entry.path,
            destinationPath: `${currentPath}/${entry.name}`,
            direction: 'download',
            connectionId: activeConnectionId,
            connectionType: activeProfile.type,
            bucket: currentBucket || undefined,
          };

          const result = await window.api.invoke('transfer:start', request);
          if (Array.isArray(result)) {
            for (const item of result) {
              addTransfer(item);
            }
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
    (oldPath: string, newName: string) => {
      const newPath = oldPath.replace(/[^/]+$/, newName);
      window.api.invoke('fs:rename', oldPath, newPath).then(() => refresh());
    },
    [refresh]
  );

  const handleNewFolder = useCallback(() => {
    const name = prompt('New folder name:');
    if (name) {
      const newPath = currentPath + '/' + name;
      window.api.invoke('fs:mkdir', newPath).then(() => refresh());
    }
  }, [currentPath, refresh]);

  const handleTransfer = useCallback(
    async (entry: FileEntry) => {
      const { activeConnectionId, activeProfile, currentPath: remotePath, currentBucket } =
        useRemotePanelStore.getState();
      if (!activeConnectionId || !activeProfile) return;

      const destPath =
        activeProfile.type === 'sftp'
          ? `${remotePath.replace(/\/+$/, '')}/${entry.name}`
          : `${remotePath}${entry.name}`;

      const request: TransferRequest = {
        sourcePath: entry.path,
        destinationPath: destPath,
        direction: 'upload',
        connectionId: activeConnectionId,
        connectionType: activeProfile.type,
        bucket: currentBucket || undefined,
      };

      const result = await window.api.invoke('transfer:start', request);
      const addTransfer = useTransferStore.getState().addTransfer;
      if (Array.isArray(result)) {
        for (const item of result) {
          addTransfer(item);
        }
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
        onNavigate={navigateTo}
        onRefresh={refresh}
      />

      {error && (
        <div className="px-3 py-2 text-[12px] text-destructive bg-destructive/5 border-b border-destructive/20">
          {error}
        </div>
      )}

      <FileList
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

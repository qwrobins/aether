import { useState, useCallback } from 'react';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { PanelHeader } from './PanelHeader';
import { FileList } from './FileList';
import { DropZone } from './DropZone';
import { EmptyState } from '@/components/shared/EmptyState';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CloudOff, Database, ChevronLeft } from 'lucide-react';
import type { FileEntry } from '@shared/types/filesystem';
import type { TransferRequest } from '@shared/types/transfer';

function BucketList() {
  const { buckets, isLoading, error, selectBucket } = useRemotePanelStore();

  if (isLoading) {
    return (
      <div className="p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-[12px] text-destructive">
        {error}
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon={Database} title="No buckets found" subtitle="This account has no S3 buckets" />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2">
        {buckets.map((bucket) => (
          <button
            key={bucket}
            onClick={() => selectBucket(bucket)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <Database className="h-4 w-4 text-primary/80" />
            <span>{bucket}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

export function RemotePanel() {
  const {
    activeConnectionId,
    activeProfile,
    connectionStatus,
    connectionError,
    currentBucket,
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
    loadBuckets,
    selectFile,
    setSort,
  } = useRemotePanelStore();

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Accept internal drops from local panel and OS file drops
    if (
      e.dataTransfer.types.includes('application/aether-transfer') ||
      e.dataTransfer.types.includes('Files')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (!activeConnectionId || !activeProfile) return;

      // Handle internal drag from local panel
      const raw = e.dataTransfer.getData('application/aether-transfer');
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          if (payload.panelType !== 'local') return;

          for (const entry of payload.entries) {
            const destPath = activeProfile.type === 'sftp'
              ? `${currentPath.replace(/\/+$/, '')}/${entry.name}`
              : `${currentPath}${entry.name}`;

            const request: TransferRequest = {
              sourcePath: entry.path,
              destinationPath: destPath,
              direction: 'upload',
              connectionId: activeConnectionId,
              connectionType: activeProfile.type,
              bucket: currentBucket || undefined,
            };

            const transferId = await window.api.invoke('transfer:start', request);
            useTransferStore.getState().addTransfer({
              id: transferId,
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
        } catch {
          // Invalid transfer data
        }
        return;
      }

      // Handle OS file drops (files from system file manager)
      if (e.dataTransfer.files.length > 0) {
        for (const file of Array.from(e.dataTransfer.files)) {
          const filePath = (file as File & { path?: string }).path;
          if (!filePath) continue;

          const destPath = activeProfile.type === 'sftp'
            ? `${currentPath.replace(/\/+$/, '')}/${file.name}`
            : `${currentPath}${file.name}`;

          const request: TransferRequest = {
            sourcePath: filePath,
            destinationPath: destPath,
            direction: 'upload',
            connectionId: activeConnectionId,
            connectionType: activeProfile.type,
            bucket: currentBucket || undefined,
          };

          const transferId = await window.api.invoke('transfer:start', request);
          useTransferStore.getState().addTransfer({
            id: transferId,
            fileName: file.name,
            sourcePath: filePath,
            destinationPath: destPath,
            direction: 'upload',
            connectionId: activeConnectionId,
            connectionType: activeProfile.type,
            bucket: request.bucket,
            size: file.size,
            bytesTransferred: 0,
            status: 'queued',
            speed: 0,
            retryCount: 0,
          });
        }
      }
    },
    [activeConnectionId, activeProfile, currentPath, currentBucket]
  );

  const handleDelete = useCallback(
    (paths: string[]) => {
      if (!activeConnectionId || !activeProfile) return;
      if (!confirm(`Delete ${paths.length} remote item(s)?`)) return;

      if (activeProfile.type === 's3') {
        Promise.all(
          paths.map((p) =>
            window.api.invoke('s3:delete-object', activeConnectionId, currentBucket!, p)
          )
        ).then(() => refresh());
      } else if (activeProfile.type === 'sftp') {
        window.api
          .invoke('sftp:delete', activeConnectionId, paths)
          .then(() => refresh());
      }
    },
    [activeConnectionId, activeProfile, currentBucket, refresh]
  );

  const handleRename = useCallback(
    (oldPath: string, newName: string) => {
      if (!activeConnectionId || !activeProfile) return;

      if (activeProfile.type === 'sftp') {
        const newPath = oldPath.replace(/[^/]+$/, newName);
        window.api
          .invoke('sftp:rename', activeConnectionId, oldPath, newPath)
          .then(() => refresh());
      }
      // S3 doesn't support rename natively
    },
    [activeConnectionId, activeProfile, refresh]
  );

  const handleNewFolder = useCallback(() => {
    if (!activeConnectionId || !activeProfile) return;
    const name = prompt('New folder name:');
    if (!name) return;

    if (activeProfile.type === 's3' && currentBucket) {
      const key = `${currentPath}${name}/`;
      window.api
        .invoke('s3:create-folder', activeConnectionId, currentBucket, key)
        .then(() => refresh());
    } else if (activeProfile.type === 'sftp') {
      const newPath = `${currentPath.replace(/\/+$/, '')}/${name}`;
      window.api
        .invoke('sftp:mkdir', activeConnectionId, newPath)
        .then(() => refresh());
    }
  }, [activeConnectionId, activeProfile, currentBucket, currentPath, refresh]);

  const handleTransfer = useCallback(
    async (entry: FileEntry) => {
      if (!activeConnectionId || !activeProfile) return;
      const localPath = useLocalPanelStore.getState().currentPath;

      const request: TransferRequest = {
        sourcePath: entry.path,
        destinationPath: `${localPath}/${entry.name}`,
        direction: 'download',
        connectionId: activeConnectionId,
        connectionType: activeProfile.type,
        bucket: currentBucket || undefined,
      };

      const transferId = await window.api.invoke('transfer:start', request);
      useTransferStore.getState().addTransfer({
        id: transferId,
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
    },
    [activeConnectionId, activeProfile, currentBucket]
  );

  // Noop handlers for states without file browsing
  const noopDelete = useCallback(() => {}, []);
  const noopRename = useCallback(() => {}, []);
  const noopNewFolder = useCallback(() => {}, []);
  const noopTransfer = useCallback(() => {}, []);

  // State 1: No connection
  if (!activeConnectionId) {
    return (
      <div className="flex min-h-0 h-full flex-col overflow-hidden">
        <PanelHeader label="Remote" path="" isActive={false} onNavigate={() => {}} onRefresh={() => {}} />
        {connectionStatus === 'connecting' ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-[13px] text-muted-foreground">Connecting...</p>
            </div>
          </div>
        ) : connectionStatus === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <EmptyState icon={CloudOff} title="Connection failed" subtitle={connectionError ?? undefined} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={CloudOff} title="No connection" subtitle="Connect to S3 or SFTP to browse remote files" />
          </div>
        )}
      </div>
    );
  }

  // State 2: SFTP connected — direct file browsing (no bucket selection)
  if (activeProfile?.type === 'sftp') {
    return (
      <div
        className="relative flex min-h-0 h-full flex-col overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DropZone isActive={isDragOver} direction="upload" />

        <PanelHeader
          label={`SFTP: ${activeProfile.name}`}
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
          panelType="remote"
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

  // State 3: S3 connected, selecting bucket
  if (activeProfile?.type === 's3' && !currentBucket) {
    return (
      <div className="flex min-h-0 h-full flex-col overflow-hidden">
        <PanelHeader
          label={`S3: ${activeProfile.name}`}
          path=""
          isActive={true}
          onNavigate={() => {}}
          onRefresh={loadBuckets}
        />
        <BucketList />
      </div>
    );
  }

  // State 4: S3 browsing objects in a bucket
  return (
    <div
      className="relative flex min-h-0 h-full flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DropZone isActive={isDragOver} direction="upload" />

      <PanelHeader
        label={`S3: ${currentBucket}`}
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

      <button
        onClick={() => useRemotePanelStore.setState({ currentBucket: null, entries: [], currentPath: '' })}
        className="flex items-center gap-1 border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to buckets
      </button>

      <FileList
        entries={entries}
        selectedFiles={selectedFiles}
        isLoading={isLoading}
        sortField={sortField}
        sortDirection={sortDirection}
        viewMode={viewMode}
        panelType="remote"
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

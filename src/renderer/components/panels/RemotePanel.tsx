import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { usePromptStore } from '@/stores/promptStore';
import { getSftpDeleteErrorMessage } from '@/lib/remote';
import { PanelHeader } from './PanelHeader';
import { FileList } from './FileList';
import { DropZone } from './DropZone';
import { EmptyState } from '@/components/shared/EmptyState';
import { TaildropPanel } from './TaildropPanel';
import { ProviderIcon } from '@/components/shared/ProviderIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CloudOff, Database, ChevronLeft } from 'lucide-react';
import type { FileEntry } from '@shared/types/filesystem';
import type { ConnectionProfile } from '@shared/types/connection';
import type { TransferRequest } from '@shared/types/transfer';

function isMountableProfile(profile: ConnectionProfile): boolean {
  return profile.type === 'smb' || profile.type === 'nfs' || profile.type === 'webdav';
}

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
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-2">
        {buckets.map((bucket) => (
          <button
            key={bucket}
            onClick={() => selectBucket(bucket)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <ProviderIcon type="s3-bucket" size={16} />
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
    mode,
    connectionStatus,
    connectionError,
    currentBucket,
    currentPath,
    entries,
    selectedFiles,
    isLoading,
    isLoadingMore,
    continuationToken,
    error,
    sortField,
    sortDirection,
    viewMode,
    navigateTo,
    refresh,
    loadMoreEntries,
    loadBuckets,
    selectFile,
    setSort,
    setViewMode,
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
            const destPath = activeProfile.type === 'sftp' ||
              activeProfile.type === 'rsync' ||
              isMountableProfile(activeProfile)
              ? `${currentPath.replace(/\/+$/, '')}/${entry.name}`
              : `${currentPath}${entry.name}`;

            const request: TransferRequest = {
              sourcePath: entry.path,
              destinationPath: destPath,
              direction: 'upload',
              connectionId: activeConnectionId,
              connectionType: activeProfile.type,
              bucket: currentBucket || undefined,
              isDirectory: Boolean(entry.isDirectory),
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
          }
        } catch (err) {
          console.error('[Aether] Upload drop handler error:', err);
          toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      // Handle OS file drops (files from system file manager)
      if (e.dataTransfer.files.length > 0) {
        for (const file of Array.from(e.dataTransfer.files)) {
          const filePath = (file as File & { path?: string }).path;
          if (!filePath) continue;

          const destPath = activeProfile.type === 'sftp' ||
            activeProfile.type === 'rsync' ||
            isMountableProfile(activeProfile)
            ? `${currentPath.replace(/\/+$/, '')}/${file.name}`
            : `${currentPath}${file.name}`;

          const request: TransferRequest = {
            sourcePath: filePath,
            destinationPath: destPath,
            direction: 'upload',
            connectionId: activeConnectionId,
            connectionType: activeProfile.type,
            bucket: currentBucket || undefined,
            isDirectory: false,
          };

          const result = await window.api.invoke('transfer:start', request);
          const { addTransfer, addTransfers } = useTransferStore.getState();
          if (Array.isArray(result)) {
            addTransfers(result);
          } else {
            addTransfer({
              id: result,
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
      }
    },
    [activeConnectionId, activeProfile, currentPath, currentBucket]
  );

  const handleDelete = useCallback(
    (paths: string[]) => {
      if (!activeConnectionId || !activeProfile) return;
      if (!confirm(`Delete ${paths.length} remote item(s)?`)) return;

      if (activeProfile.type === 's3') {
        if (!currentBucket) return;
        Promise.all(
          paths.map((p) =>
            window.api.invoke('s3:delete-object', activeConnectionId, currentBucket, p)
          )
        )
          .then(() => refresh())
          .catch((err) => {
            console.error('[Aether] S3 delete failed:', err);
            toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      } else if (activeProfile.type === 'sftp') {
        window.api
          .invoke('sftp:delete', activeConnectionId, paths)
          .then((result) =>
            refresh().then(() => {
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
      } else if (activeProfile.type === 'rsync') {
        window.api
          .invoke('rsync:delete', activeConnectionId, paths)
          .then((result) =>
            refresh().then(() => {
              const message = getSftpDeleteErrorMessage(result);
              if (message) {
                toast.error(message);
              }
            }),
          )
          .catch((err) => {
            console.error('[Aether] Rsync delete failed:', err);
            toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      } else if (isMountableProfile(activeProfile)) {
        window.api
          .invoke('netfs:delete', activeConnectionId, paths)
          .then(() => refresh())
          .catch((err) => {
            console.error('[Aether] Network filesystem delete failed:', err);
            toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      }
    },
    [activeConnectionId, activeProfile, currentBucket, refresh]
  );

  const handleRename = useCallback(
    async (oldPath: string) => {
      if (!activeConnectionId || !activeProfile) return;
      const oldName = oldPath.split('/').pop() ?? '';
      const newName = await usePromptStore.getState().open({
        title: 'Rename',
        defaultValue: oldName,
        placeholder: 'New name',
      });
      if (!newName || newName === oldName) return;

      if (activeProfile.type === 'sftp') {
        const newPath = oldPath.replace(/[^/]+$/, newName);
        window.api
          .invoke('sftp:rename', activeConnectionId, oldPath, newPath)
          .then(() => refresh())
          .catch((err) => {
            console.error('[Aether] SFTP rename failed:', err);
            toast.error(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      } else if (activeProfile.type === 'rsync') {
        const newPath = oldPath.replace(/[^/]+$/, newName);
        window.api
          .invoke('rsync:rename', activeConnectionId, oldPath, newPath)
          .then(() => refresh())
          .catch((err) => {
            console.error('[Aether] Rsync rename failed:', err);
            toast.error(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      } else if (isMountableProfile(activeProfile)) {
        const newPath = oldPath.replace(/[^/]+$/, newName);
        window.api
          .invoke('netfs:rename', activeConnectionId, oldPath, newPath)
          .then(() => refresh())
          .catch((err) => {
            console.error('[Aether] Network filesystem rename failed:', err);
            toast.error(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
          });
      }
      // S3 doesn't support rename natively
    },
    [activeConnectionId, activeProfile, refresh]
  );

  const handleNewFolder = useCallback(async () => {
    if (!activeConnectionId || !activeProfile) return;
    const name = await usePromptStore.getState().open({
      title: 'New Folder',
      placeholder: 'Folder name',
    });
    if (!name) return;

    if (activeProfile.type === 's3' && currentBucket) {
      const key = `${currentPath}${name}/`;
      window.api
        .invoke('s3:create-folder', activeConnectionId, currentBucket, key)
        .then(() => refresh())
        .catch((err) => {
          console.error('[Aether] S3 create folder failed:', err);
          toast.error(`New folder failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    } else if (activeProfile.type === 'sftp') {
      const newPath = `${currentPath.replace(/\/+$/, '')}/${name}`;
      window.api
        .invoke('sftp:mkdir', activeConnectionId, newPath)
        .then(() => refresh())
        .catch((err) => {
          console.error('[Aether] SFTP mkdir failed:', err);
          toast.error(`New folder failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    } else if (activeProfile.type === 'rsync') {
      const newPath = `${currentPath.replace(/\/+$/, '')}/${name}`;
      window.api
        .invoke('rsync:mkdir', activeConnectionId, newPath)
        .then(() => refresh())
        .catch((err) => {
          console.error('[Aether] Rsync mkdir failed:', err);
          toast.error(`New folder failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    } else if (isMountableProfile(activeProfile)) {
      const newPath = `${currentPath.replace(/\/+$/, '')}/${name}`;
      window.api
        .invoke('netfs:mkdir', activeConnectionId, newPath)
        .then(() => refresh())
        .catch((err) => {
          console.error('[Aether] Network filesystem mkdir failed:', err);
          toast.error(`New folder failed: ${err instanceof Error ? err.message : String(err)}`);
        });
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
    },
    [activeConnectionId, activeProfile, currentBucket]
  );

  if (mode === 'taildrop') {
    return <TaildropPanel />;
  }

  // State 1: No connection
  if (!activeConnectionId) {
    return (
      <div data-panel="remote" className="flex min-h-0 h-full flex-col overflow-hidden">
        <PanelHeader
          label="Remote"
          path=""
          isActive={false}
          viewMode={viewMode}
          onNavigate={() => void 0}
          onRefresh={() => void 0}
          onViewModeChange={setViewMode}
        />
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
            <EmptyState icon={CloudOff} title="No connection" subtitle="Connect to a remote profile to browse remote files" />
          </div>
        )}
      </div>
    );
  }

  // State 2: SFTP connected — direct file browsing (no bucket selection)
  if (
    activeProfile &&
    (activeProfile.type === 'sftp' || activeProfile.type === 'rsync' || isMountableProfile(activeProfile))
  ) {
    return (
      <div
        data-panel="remote"
        className="relative flex min-h-0 h-full flex-col overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DropZone isActive={isDragOver} direction="upload" />

        <PanelHeader
          label={`${activeProfile.type.toUpperCase()}: ${activeProfile.name}`}
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
            {error}
          </div>
        )}

        <FileList
          listKey={`${activeConnectionId}:${currentPath}`}
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
          hasMoreEntries={Boolean(continuationToken)}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMoreEntries}
        />
      </div>
    );
  }

  if (activeProfile && activeProfile.type !== 's3') {
    return (
      <div data-panel="remote" className="flex min-h-0 h-full flex-col overflow-hidden">
        <PanelHeader
          label={`${activeProfile.type.toUpperCase()}: ${activeProfile.name}`}
          path=""
          isActive={true}
          viewMode={viewMode}
          onNavigate={() => void 0}
          onRefresh={() => void 0}
          onViewModeChange={setViewMode}
        />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={CloudOff}
            title="Browsing not wired yet"
            subtitle="This connection type can be saved now; file browsing will be added in a protocol-specific pass."
          />
        </div>
      </div>
    );
  }

  // State 3: S3 connected, selecting bucket
  if (activeProfile?.type === 's3' && !currentBucket) {
    return (
      <div data-panel="remote" className="flex min-h-0 h-full flex-col overflow-hidden">
        <PanelHeader
          label={`S3: ${activeProfile.name}`}
          path=""
          isActive={true}
          viewMode={viewMode}
          onNavigate={() => void 0}
          onRefresh={loadBuckets}
          onViewModeChange={setViewMode}
        />
        <BucketList />
      </div>
    );
  }

  // State 4: S3 browsing objects in a bucket
  return (
    <div
      data-panel="remote"
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
        viewMode={viewMode}
        onNavigate={navigateTo}
        onRefresh={refresh}
        onNewFolder={handleNewFolder}
        onViewModeChange={setViewMode}
        breadcrumbMode="s3-prefix"
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
        listKey={`${activeConnectionId}:${currentBucket}:${currentPath}`}
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
        hasMoreEntries={Boolean(continuationToken)}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMoreEntries}
      />
    </div>
  );
}

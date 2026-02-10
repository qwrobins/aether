import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { PanelHeader } from './PanelHeader';
import { FileList } from './FileList';
import { EmptyState } from '@/components/shared/EmptyState';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CloudOff, Database, ChevronLeft } from 'lucide-react';

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

  // State 1: No connection
  if (!activeConnectionId) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
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

  // State 2: Connected to S3, selecting bucket
  if (activeProfile?.type === 's3' && !currentBucket) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
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

  // State 3: Browsing objects in a bucket
  return (
    <div className="flex h-full flex-col overflow-hidden">
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
        onSelect={selectFile}
        onNavigate={navigateTo}
        onSort={setSort}
      />
    </div>
  );
}

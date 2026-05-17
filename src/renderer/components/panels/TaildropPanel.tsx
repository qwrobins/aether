import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Download, Laptop, RefreshCw, Send, ShieldAlert, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ProviderIcon } from '@/components/shared/ProviderIcon';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useTaildropStore } from '@/stores/taildropStore';
import type { TaildropTarget } from '@shared/types/taildrop';

const TAILDROP_REFRESH_INTERVAL_MS = 10_000;

type LocalFilePayload = {
  panelType: 'local';
  entries: Array<{ path: string; name: string; size?: number; isDirectory?: boolean }>;
};

type TaildropLocalFile = {
  path: string;
  name: string;
  size?: number;
  isDirectory?: boolean;
};

function getDroppedFiles(e: React.DragEvent): TaildropLocalFile[] {
  const raw = e.dataTransfer.getData('application/aether-transfer');
  if (raw) {
    const payload = JSON.parse(raw) as LocalFilePayload;
    if (payload.panelType !== 'local') return [];
    return payload.entries;
  }

  const files: TaildropLocalFile[] = [];
  for (const file of Array.from(e.dataTransfer.files)) {
      const filePath = (file as File & { path?: string }).path;
      if (!filePath) continue;
      files.push({
        path: filePath,
        name: file.name,
        size: file.size,
        isDirectory: false,
      });
  }
  return files;
}

function DeviceCard({ target }: { target: TaildropTarget }) {
  const sendFiles = useTaildropStore((state) => state.sendFiles);
  const [isDragOver, setIsDragOver] = useState(false);
  const available = target.status === 'available';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!available) return;
    if (
      e.dataTransfer.types.includes('application/aether-transfer') ||
      e.dataTransfer.types.includes('Files')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, [available]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!available) return;

    try {
      const files = getDroppedFiles(e);
      if (files.length === 0) return;
      await sendFiles(target, files);
      toast.success(`Queued ${files.length} file${files.length === 1 ? '' : 's'} for ${target.name}`);
    } catch (error) {
      toast.error(`Taildrop send failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [available, sendFiles, target]);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-md border border-white/[0.06] bg-surface/45 px-3 py-3 transition-[border-color,background-color,box-shadow,opacity] duration-200',
        available
          ? 'hover:border-primary/30 hover:bg-white/[0.035] hover:shadow-[0_0_28px_oklch(0.62_0.25_280/0.08)]'
          : 'opacity-55',
        isDragOver && 'border-accent/70 bg-accent/8 shadow-[0_0_34px_oklch(0.78_0.16_75/0.16)]',
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border',
          available
            ? 'border-primary/20 bg-primary/10 text-primary'
            : 'border-muted-foreground/10 bg-muted-foreground/5 text-muted-foreground',
        )}>
          <Laptop className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{target.name}</span>
            {available ? (
              <span className="flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
                <Check className="h-3 w-3" />
                Ready
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 rounded-sm bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <WifiOff className="h-3 w-3" />
                Offline
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">
            {target.address ?? target.detail ?? 'Taildrop target'}
          </div>
          {target.detail && (
            <div className="mt-1 truncate text-[11px] text-muted-foreground/60">
              {target.detail}
            </div>
          )}
        </div>
      </div>
      {available && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <Send className="h-3 w-3 text-accent" />
          Drop local files here to send
        </div>
      )}
    </div>
  );
}

function HistoryList() {
  const history = useTaildropStore((state) => state.history);

  if (history.length === 0) {
    return (
      <div className="px-3 py-5 text-center text-[12px] text-muted-foreground/60">
        Taildrop activity from Aether will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2 pb-3">
      {history.slice(0, 8).map((item) => (
        <div key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]">
          <span className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded',
            item.status === 'completed' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
          )}>
            {item.status === 'completed' ? <Check className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-foreground/85">{item.fileName}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {item.kind === 'sent'
                ? `Sent to ${item.targetName ?? 'Taildrop'}`
                : `Collected into ${item.destinationPath ?? 'local folder'}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TaildropPanel() {
  const { availability, targets, isLoading, error, refresh, collectReceived } = useTaildropStore();
  const currentLocalPath = useLocalPanelStore((state) => state.currentPath);
  const refreshLocal = useLocalPanelStore((state) => state.refresh);
  const isLinux = availability?.platform === 'linux';

  useEffect(() => {
    refresh();

    const refreshSilently = () => {
      void refresh({ silent: true });
    };
    const intervalId = window.setInterval(refreshSilently, TAILDROP_REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshSilently();
    };

    window.addEventListener('focus', refreshSilently);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshSilently);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);

  const handleCollectReceived = useCallback(async () => {
    try {
      const result = await collectReceived(currentLocalPath);
      await refreshLocal();
      if (result.files.length === 0) {
        toast.info(result.message ?? 'No received Taildrop files were waiting');
      } else {
        toast.success(`Collected ${result.files.length} Taildrop file${result.files.length === 1 ? '' : 's'}`);
      }
    } catch (collectError) {
      toast.error(`Receive failed: ${collectError instanceof Error ? collectError.message : String(collectError)}`);
    }
  }, [collectReceived, currentLocalPath, refreshLocal]);

  const handleOpenLocalFolder = useCallback(async () => {
    try {
      await window.api.invoke('fs:open-in-explorer', currentLocalPath);
    } catch (openError) {
      toast.error(`Could not open local folder: ${openError instanceof Error ? openError.message : String(openError)}`);
    }
  }, [currentLocalPath]);

  return (
    <div data-panel="remote" className="flex min-h-0 h-full flex-col overflow-hidden">
      <div className="flex h-[44px] shrink-0 items-center gap-3 border-b-2 border-b-primary bg-surface/50 px-3 py-2">
        <ProviderIcon type="tailscale" size={14} className="text-accent/80" />
        <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
          Tailscale
        </span>
        <div className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          Taildrop devices
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isLinux ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={handleCollectReceived}
              className="text-muted-foreground hover:bg-white/6 hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Collect
            </Button>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={handleOpenLocalFolder}
              className="text-muted-foreground hover:bg-white/6 hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Local Folder
            </Button>
          )}
          <button
            onClick={refresh}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-white/6 hover:text-foreground active:bg-white/8"
            aria-label="Refresh Taildrop devices"
            title="Refresh Taildrop devices"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-md border border-white/[0.05] bg-surface/40 p-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40 rounded" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                </div>
              </div>
            ))
          ) : targets.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <EmptyState
                icon={availability?.status === 'available' ? Laptop : ShieldAlert}
                title={availability?.status === 'available' ? 'No Taildrop devices' : 'Taildrop unavailable'}
                subtitle={availability?.message ?? 'Open Tailscale and make sure Taildrop is enabled for this tailnet.'}
              />
            </div>
          ) : (
            targets.map((target) => <DeviceCard key={target.id} target={target} />)
          )}
        </div>

        <div className="border-t border-border/50 px-3 pt-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
            History
          </div>
          <HistoryList />
        </div>
      </ScrollArea>
    </div>
  );
}

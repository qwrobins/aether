import { useTransferStore } from '@/stores/transferStore';
import { useUiStore } from '@/stores/uiStore';
import { useTransferEvents } from '@/hooks/useTransferEvents';
import { TransferItem } from './TransferItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function TransferQueue() {
  useTransferEvents();

  const transfers = useTransferStore((s) => s.transfers);
  const activeCount = useTransferStore((s) => s.activeCount());
  const queuedCount = useTransferStore((s) => s.queuedCount());
  const totalRemaining = useTransferStore((s) => s.totalRemaining());
  const clearCompleted = useTransferStore((s) => s.clearCompleted);
  const finishedCount = transfers.filter((t) =>
    ['completed', 'failed', 'cancelled'].includes(t.status)
  ).length;
  const { transferQueueExpanded, toggleTransferQueue } = useUiStore();
  const hasTransfers = transfers.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-border bg-card overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 text-[12px]">
        <button
          onClick={toggleTransferQueue}
          className="flex min-w-0 flex-1 items-center justify-between"
          disabled={!hasTransfers}
        >
          <span className="font-medium text-foreground">Transfers</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {hasTransfers ? (
                <>
                  {activeCount} active &middot; {queuedCount} queued &middot;{' '}
                  {formatBytes(totalRemaining)} remaining
                </>
              ) : (
                'No active transfers'
              )}
            </span>
            {hasTransfers &&
              (transferQueueExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronUp className="h-3 w-3 shrink-0" />
              ))}
          </div>
        </button>
        {finishedCount > 0 && (
          <button
            onClick={clearCompleted}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Clear completed, failed, and cancelled transfers"
          >
            <Trash2 className="h-3 w-3" />
            Clear completed
          </button>
        )}
      </div>
      {transferQueueExpanded && hasTransfers && (
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="space-y-0.5 px-2 pb-2">
            {transfers.map((t) => (
              <TransferItem key={t.id} transfer={t} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

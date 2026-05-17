import { useTransferStore } from '@/stores/transferStore';
import { useUiStore } from '@/stores/uiStore';
import { TransferItem } from './TransferItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronUp, Trash2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function TransferQueue() {
  const transfers = useTransferStore((s) => s.transfers);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);
  const clearSuccessful = useTransferStore((s) => s.clearSuccessful);
  const { transferQueueExpanded, toggleTransferQueue } = useUiStore();
  const hasTransfers = transfers.length > 0;

  const activeCount = transfers.filter((t) => t.status === 'active').length;
  const queuedCount = transfers.filter((t) => t.status === 'queued').length;
  const totalRemaining = transfers
    .filter((t) => ['active', 'queued'].includes(t.status))
    .reduce((sum, t) => sum + Math.max(0, t.size - t.bytesTransferred), 0);

  const activeTransfers = transfers.filter((t) =>
    ['active', 'queued'].includes(t.status),
  );
  const terminalTransfers = transfers.filter((t) =>
    ['completed', 'failed', 'cancelled'].includes(t.status),
  );
  const hasTerminal = terminalTransfers.length > 0;
  const hasActive = activeTransfers.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5">
        <button
          onClick={toggleTransferQueue}
          className="flex min-w-0 flex-1 items-center gap-2"
          disabled={!hasTransfers}
        >
          <Activity
            size={13}
            className={cn(
              'shrink-0',
              hasActive ? 'text-accent' : 'text-muted-foreground',
            )}
          />
          <span className="text-[13px] font-medium text-foreground">
            Transfers
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {hasTransfers ? (
                <>
                  {activeCount > 0 && `${activeCount} active`}
                  {activeCount > 0 && queuedCount > 0 && ' \u00b7 '}
                  {queuedCount > 0 && `${queuedCount} queued`}
                  {activeCount === 0 &&
                    queuedCount === 0 &&
                    `${terminalTransfers.length} finished`}
                  {hasActive && ` \u00b7 ${formatBytes(totalRemaining)} remaining`}
                </>
              ) : (
                'No active transfers'
              )}
            </span>
            {hasTransfers &&
              (transferQueueExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
              ))}
          </div>
        </button>
        {hasTerminal && (
          <div className="flex items-center gap-1">
            <button
              onClick={clearSuccessful}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Clear successful transfers"
            >
              <Trash2 className="h-3 w-3" />
              Clear done
            </button>
            <button
              onClick={clearCompleted}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Clear all finished transfers"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {transferQueueExpanded && hasTransfers && (
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="space-y-0 px-3 pb-3">
            {hasActive && (
              <div className="space-y-0.5">
                {activeTransfers.map((t) => (
                  <TransferItem key={t.id} transfer={t} />
                ))}
              </div>
            )}
            {hasTerminal && hasActive && (
              <div className="my-1 h-px bg-border/40" />
            )}
            {hasTerminal && (
              <div className="space-y-0.5">
                {terminalTransfers.map((t) => (
                  <TransferItem key={t.id} transfer={t} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

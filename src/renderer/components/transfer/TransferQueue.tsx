import { useTransferStore } from '@/stores/transferStore';
import { useUiStore } from '@/stores/uiStore';
import { useTransferEvents } from '@/hooks/useTransferEvents';
import { TransferItem } from './TransferItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  const { transferQueueExpanded, toggleTransferQueue } = useUiStore();

  if (transfers.length === 0) return null;

  return (
    <div className="border-t border-border/50 bg-surface/50">
      <button
        onClick={toggleTransferQueue}
        className="flex w-full items-center justify-between px-4 py-2 text-[12px]"
      >
        <span className="font-medium text-foreground">Transfers</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {activeCount} active &middot; {queuedCount} queued &middot;{' '}
            {formatBytes(totalRemaining)} remaining
          </span>
          {transferQueueExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </div>
      </button>
      {transferQueueExpanded && (
        <ScrollArea className="max-h-[200px]">
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

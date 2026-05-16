import { useState } from 'react';
import type { TransferItem as TItem } from '@shared/types/transfer';
import { X, RotateCw, Check, ArrowUp, ArrowDown, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTransferStore } from '@/stores/transferStore';

interface Props {
  transfer: TItem;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '';
  const k = 1024;
  if (bytesPerSec < k) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < k * k) return `${(bytesPerSec / k).toFixed(1)} KB/s`;
  return `${(bytesPerSec / k / k).toFixed(1)} MB/s`;
}

function DirectionIcon({
  direction,
  connectionType,
}: {
  direction: TItem['direction'];
  connectionType: TItem['connectionType'];
}) {
  if (connectionType === 'taildrop')
    return <ArrowLeftRight size={12} className="text-accent" />;
  if (direction === 'upload')
    return <ArrowUp size={12} className="text-primary" />;
  return <ArrowDown size={12} className="text-accent" />;
}

export function TransferItem({ transfer: t }: Props) {
  const [isRetrying, setIsRetrying] = useState(false);
  const addTransfer = useTransferStore((s) => s.addTransfer);
  const removeTransfer = useTransferStore((s) => s.removeTransfer);

  const percentage =
    t.size > 0 ? Math.round((t.bytesTransferred / t.size) * 100) : 0;
  const isUpload = t.direction === 'upload';
  const isTaildrop = t.connectionType === 'taildrop';
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(t.status);

  const handleCancel = () => {
    window.api.invoke('transfer:cancel', t.id);
  };

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      const result = await window.api.invoke('transfer:start', {
        sourcePath: t.sourcePath,
        destinationPath: t.destinationPath,
        direction: t.direction,
        connectionId: t.connectionId,
        connectionType: t.connectionType,
        bucket: t.bucket,
        targetName: t.targetName,
      });

      removeTransfer(t.id);
      if (Array.isArray(result)) {
        for (const item of result) {
          addTransfer(item);
        }
      } else {
        addTransfer({
          ...t,
          id: result,
          bytesTransferred: 0,
          status: 'queued',
          speed: 0,
          completedAt: undefined,
          error: undefined,
        });
      }
    } catch (err) {
      console.error('[Aether] Transfer retry failed:', err);
      toast.error(
        `Retry failed for ${t.targetName ?? t.fileName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200 hover:bg-white/[0.02]',
        isTerminal && 'opacity-50',
      )}
    >
      {/* Status icon */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.03]">
        {t.status === 'completed' ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : t.status === 'cancelled' ? (
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        ) : t.status === 'failed' ? (
          <X className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <DirectionIcon
            direction={t.direction}
            connectionType={t.connectionType}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'truncate text-[12px]',
              isTerminal && 'text-muted-foreground',
            )}
          >
            {t.fileName}
          </span>
          {isTaildrop && (
            <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:block">
              &rarr; {t.targetName ?? t.destinationPath}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[280px]">
          <div
            className={cn(
              'h-[5px] overflow-hidden rounded-full',
              t.status === 'failed'
                ? 'bg-destructive/15'
                : 'bg-muted-foreground/8',
            )}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                t.status === 'failed'
                  ? 'bg-destructive'
                  : t.status === 'cancelled'
                    ? 'bg-muted-foreground/40'
                    : t.status === 'completed'
                      ? 'bg-success'
                      : isUpload
                        ? isTaildrop
                          ? 'bg-accent'
                          : 'bg-primary'
                        : 'bg-accent',
                t.status === 'queued' &&
                  'animate-[indeterminate_1.5s_ease-in-out_infinite]',
                t.status === 'active' &&
                  'animate-[shimmer_2s_linear_infinite] bg-[length:200%_100%] bg-gradient-to-r',
                t.status === 'active' &&
                  isUpload &&
                  !isTaildrop &&
                  'from-primary via-primary/50 to-primary',
                t.status === 'active' &&
                  isTaildrop &&
                  'from-accent via-accent/50 to-accent',
                t.status === 'active' &&
                  !isUpload &&
                  'from-accent via-accent/50 to-accent',
              )}
              style={{
                width:
                  t.status === 'queued'
                    ? '40%'
                    : ['completed', 'cancelled'].includes(t.status)
                      ? '100%'
                      : `${percentage}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex shrink-0 items-center gap-4">
        <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
          {t.status === 'completed'
            ? 'Done'
            : t.status === 'cancelled'
              ? '\u2014'
              : t.status === 'failed'
                ? 'Failed'
                : t.status === 'queued'
                  ? '...'
                  : `${percentage}%`}
        </span>
        <span className="w-[70px] text-right font-mono text-[11px] text-muted-foreground">
          {t.status === 'active'
            ? formatSpeed(t.speed)
            : t.status === 'queued'
              ? 'waiting'
              : t.status === 'completed'
                ? 'done'
                : t.status === 'cancelled'
                  ? 'cancelled'
                  : ''}
        </span>
      </div>

      {/* Action */}
      <div className="flex w-6 shrink-0 justify-end">
        {(t.status === 'active' || t.status === 'queued') && (
          <button
            onClick={handleCancel}
            className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground group-hover:flex"
            aria-label="Cancel transfer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {t.status === 'failed' && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex h-6 w-6 items-center justify-center rounded text-destructive transition-colors hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Retry transfer"
          >
            <RotateCw className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
          </button>
        )}
      </div>
    </div>
  );
}

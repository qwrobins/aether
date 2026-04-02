import type { TransferItem as TItem } from '@shared/types/transfer';
import { X, RotateCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function TransferItem({ transfer: t }: Props) {
  const percentage =
    t.size > 0 ? Math.round((t.bytesTransferred / t.size) * 100) : 0;
  const isUpload = t.direction === 'upload';
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(t.status);

  const handleCancel = () => {
    window.api.invoke('transfer:cancel', t.id);
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-md px-2 py-1.5 transition-opacity duration-300 hover:bg-white/[0.02]',
        isTerminal && 'opacity-60'
      )}
    >
      {/* Icon + filename */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="shrink-0">
          {t.status === 'completed' ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : t.status === 'cancelled' ? (
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {isUpload ? '\u2191' : '\u2193'}
            </span>
          )}
        </div>
        <span
          className={cn(
            'truncate text-[12px]',
            isTerminal && 'text-muted-foreground'
          )}
        >
          {t.fileName}
        </span>
      </div>

      {/* Progress bar — visible in all states */}
      <div className="w-24 shrink-0">
        <div
          className={cn(
            'h-[3px] overflow-hidden rounded-full',
            t.status === 'failed' ? 'bg-destructive/20' : 'bg-muted-foreground/10'
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              t.status === 'failed'
                ? 'bg-destructive'
                : t.status === 'cancelled'
                  ? 'bg-muted-foreground/50'
                : t.status === 'completed'
                  ? 'bg-success'
                  : isUpload
                    ? 'bg-primary'
                    : 'bg-accent',
              t.status === 'queued' &&
                'animate-[indeterminate_1.5s_ease-in-out_infinite]',
              t.status === 'active' &&
                'animate-[shimmer_2s_linear_infinite] bg-[length:200%_100%] bg-gradient-to-r',
              t.status === 'active' && isUpload &&
                'from-primary via-primary/60 to-primary',
              t.status === 'active' && !isUpload &&
                'from-accent via-accent/60 to-accent'
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

      {/* Stats */}
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {t.status === 'completed'
          ? '\u2713'
          : t.status === 'cancelled'
            ? '\u2014'
          : t.status === 'failed'
            ? '\u2717'
            : t.status === 'queued'
              ? '\u2022\u2022\u2022'
              : `${percentage}%`}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
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

      {/* Cancel/Retry button */}
      <div className="w-6 shrink-0">
        {(t.status === 'active' || t.status === 'queued') && (
          <button
            onClick={handleCancel}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {t.status === 'failed' && (
          <button className="flex h-5 w-5 items-center justify-center rounded text-destructive hover:text-destructive/80">
            <RotateCw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

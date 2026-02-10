import { cn } from '@/lib/utils';

interface Props {
  isActive: boolean;
  direction: 'upload' | 'download';
}

export function DropZone({ isActive, direction }: Props) {
  if (!isActive) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center',
        'rounded-lg border-2 bg-primary/[0.04]',
        'animate-[breathe_1.5s_ease-in-out_infinite]'
      )}
    >
      <span className="text-[13px] font-medium text-primary/70">
        Release to {direction}
      </span>
    </div>
  );
}

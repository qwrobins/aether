import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PathBreadcrumb } from './PathBreadcrumb';

interface PanelHeaderProps {
  label: string;
  path: string;
  isActive: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
}

export function PanelHeader({ label, path, isActive, onNavigate, onRefresh }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-[44px] shrink-0 items-center gap-3 border-b-2 border-border/50 bg-surface/50 px-3 py-2 transition-[border-color] duration-200',
        isActive ? 'border-b-primary' : 'border-b-transparent'
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </span>

      <div className="min-w-0 flex-1">
        <PathBreadcrumb path={path} onNavigate={onNavigate} />
      </div>

      <button
        onClick={onRefresh}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-white/[0.06] hover:text-foreground active:bg-white/[0.08]"
        aria-label="Refresh"
      >
        <RotateCw size={13} />
      </button>
    </div>
  );
}

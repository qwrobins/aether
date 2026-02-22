import { FolderPlus, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PathBreadcrumb } from './PathBreadcrumb';

interface PanelHeaderProps {
  label: string;
  path: string;
  isActive: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onNewFolder?: () => void;
  breadcrumbMode?: 'filesystem' | 's3-prefix';
}

export function PanelHeader({
  label,
  path,
  isActive,
  onNavigate,
  onRefresh,
  onNewFolder,
  breadcrumbMode,
}: PanelHeaderProps) {
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
        <PathBreadcrumb path={path} onNavigate={onNavigate} mode={breadcrumbMode} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onNewFolder && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onNewFolder}
            className="text-muted-foreground hover:bg-white/6 hover:text-foreground active:bg-white/8"
            title="New Folder (Ctrl+N)"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </Button>
        )}
        <button
          onClick={onRefresh}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-white/6 hover:text-foreground active:bg-white/8"
          aria-label="Refresh"
          title="Refresh (Ctrl+R)"
        >
          <RotateCw size={13} />
        </button>
      </div>
    </div>
  );
}

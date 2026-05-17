import { FolderPlus, RotateCw, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PathBreadcrumb } from './PathBreadcrumb';
import type { ViewMode } from '@shared/types/filesystem';

interface PanelHeaderProps {
  label: string;
  path: string;
  isActive: boolean;
  viewMode: ViewMode;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onNewFolder?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
  breadcrumbMode?: 'filesystem' | 's3-prefix';
}

export function PanelHeader({
  label,
  path,
  isActive,
  viewMode,
  onNavigate,
  onRefresh,
  onNewFolder,
  onViewModeChange,
  breadcrumbMode,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-[46px] shrink-0 items-center gap-3 border-b bg-surface/50 px-3 py-2 transition-[border-color] duration-200',
        isActive ? 'border-b-primary/60' : 'border-b-border/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-[0.06em]',
            isActive ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <PathBreadcrumb
          path={path}
          onNavigate={onNavigate}
          mode={breadcrumbMode}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onViewModeChange && (
          <div className="flex items-center rounded-md border border-border/40 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded transition-colors',
                viewMode === 'list'
                  ? 'bg-white/[0.06] text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="List view"
            >
              <List size={13} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded transition-colors',
                viewMode === 'grid'
                  ? 'bg-white/[0.06] text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="Grid view"
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        )}

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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-white/6 hover:text-foreground active:bg-white/8"
          aria-label="Refresh"
          title="Refresh (Ctrl+R)"
        >
          <RotateCw size={13} />
        </button>
      </div>
    </div>
  );
}

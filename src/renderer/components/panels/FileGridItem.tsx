import { memo } from 'react';
import { cn } from '@/lib/utils';
import { beginInternalDrag, endInternalDrag } from '@/lib/drag-guard';
import { FileIcon } from '@/components/shared/FileIcon';
import { FileSize } from '@/components/shared/FileSize';
import { FileContextMenu } from './FileContextMenu';
import type { FileEntry } from '@shared/types/filesystem';
import type { PanelType } from './FileItem';

interface FileGridItemProps {
  entry: FileEntry;
  index: number;
  isSelected: boolean;
  allEntries: FileEntry[];
  selectedFiles: Set<string>;
  panelType: PanelType;
  onSelect: (path: string, multi: boolean, shift?: boolean) => void;
  onNavigate: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onRename: (oldPath: string) => void;
  onTransfer: (entry: FileEntry) => void;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getFileNameParts(
  name: string,
  isDirectory: boolean,
): { base: string; ext: string } {
  if (isDirectory) return { base: name, ext: '' };
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, lastDot), ext: name.slice(lastDot) };
}

function areFileGridItemPropsEqual(prev: FileGridItemProps, next: FileGridItemProps): boolean {
  if (
    prev.entry !== next.entry ||
    prev.index !== next.index ||
    prev.isSelected !== next.isSelected ||
    prev.allEntries !== next.allEntries ||
    prev.panelType !== next.panelType ||
    prev.onSelect !== next.onSelect ||
    prev.onNavigate !== next.onNavigate ||
    prev.onDelete !== next.onDelete ||
    prev.onRename !== next.onRename ||
    prev.onTransfer !== next.onTransfer
  ) {
    return false;
  }
  // A new selection Set is irrelevant to rows that are unselected in both
  // renders: they never read selectedFiles. Selected rows must re-render so
  // their drag/delete handlers capture the current selection.
  if (prev.isSelected || next.isSelected) {
    return prev.selectedFiles === next.selectedFiles;
  }
  return true;
}

export const FileGridItem = memo(function FileGridItem({
  entry,
  index,
  isSelected,
  allEntries,
  selectedFiles,
  panelType,
  onSelect,
  onNavigate,
  onDelete,
  onRename,
  onTransfer,
}: FileGridItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    beginInternalDrag(e.dataTransfer);
    const draggedEntries = isSelected
      ? allEntries.filter((f) => selectedFiles.has(f.path))
      : [entry];

    const payload = {
      panelType,
      entries: draggedEntries.map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size,
        isDirectory: f.isDirectory,
      })),
    };
    e.dataTransfer.setData(
      'application/aether-transfer',
      JSON.stringify(payload),
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    endInternalDrag();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && entry.isDirectory) {
      e.preventDefault();
      onNavigate(entry.path);
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey);
    }
  };

  const { base, ext } = getFileNameParts(entry.name, entry.isDirectory);

  return (
    <FileContextMenu
      entry={entry}
      isSelected={isSelected}
      selectedFiles={selectedFiles}
      panelType={panelType}
      onNavigate={onNavigate}
      onDelete={onDelete}
      onRename={onRename}
      onTransfer={onTransfer}
    >
      <div
        role="gridcell"
        tabIndex={0}
        aria-selected={isSelected}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center rounded-lg border border-transparent p-3 transition-all duration-150',
          'hover:border-border/30 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none',
          isSelected && 'border-primary/20 bg-primary/[0.06]',
        )}
        style={{
          animation: `row-enter 0.18s ${Math.min(index * 0.025, 0.5)}s ease-out both`,
          boxShadow: isSelected ? '0 0 0 1px var(--color-primary)' : 'none',
        }}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(e) =>
          onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)
        }
        onDoubleClick={() => {
          if (entry.isDirectory) onNavigate(entry.path);
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.02]">
          <FileIcon entry={entry} size={28} />
        </div>

        <div className="w-full text-center">
          <div className="flex min-w-0 items-center justify-center">
            <span className="max-w-full truncate text-[12px]">{base}</span>
            {!entry.isDirectory && ext && (
              <span className="shrink-0 text-[12px] text-muted-foreground/50">
                {ext}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <FileSize bytes={entry.size} isDirectory={entry.isDirectory} />
            <span className="font-mono text-[10px] text-muted-foreground/50">
              {formatRelativeTime(entry.modifiedAt)}
            </span>
          </div>
        </div>
      </div>
    </FileContextMenu>
  );
}, areFileGridItemPropsEqual);

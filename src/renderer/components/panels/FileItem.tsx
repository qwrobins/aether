import { cn } from '@/lib/utils';
import { FileIcon } from '@/components/shared/FileIcon';
import { FileSize } from '@/components/shared/FileSize';
import { TableRow, TableCell } from '@/components/ui/table';
import { FileContextMenu } from './FileContextMenu';
import type { FileEntry } from '@shared/types/filesystem';

export type PanelType = 'local' | 'remote';

interface FileItemProps {
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

export function FileItem({
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
}: FileItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    // If dragging a selected item, include ALL selected items in the payload.
    // If dragging an unselected item, include only that item (standard file manager UX).
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
    e.dataTransfer.setData('application/aether-transfer', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

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
      <TableRow
        className={cn(
          'h-[34px] cursor-pointer border-0 transition-[color,background-color,box-shadow] duration-150',
          'hover:bg-white/[0.03]',
          isSelected && 'bg-primary/8 shadow-[inset_2px_0_0_0_var(--color-primary)]'
        )}
        style={{
          animation: `row-enter 0.15s ${Math.min(index * 0.03, 0.6)}s ease-out both`,
        }}
        data-state={isSelected ? 'selected' : undefined}
        draggable
        onDragStart={handleDragStart}
        onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)}
        onDoubleClick={() => {
          if (entry.isDirectory) onNavigate(entry.path);
        }}
      >
        <TableCell className="w-[20px] px-2 py-0">
          <FileIcon entry={entry} size={16} />
        </TableCell>
        <TableCell className="py-0 px-2">
          <span className="text-[13px] truncate block">{entry.name}</span>
        </TableCell>
        <TableCell className="w-[80px] py-0 px-2 text-right">
          <FileSize bytes={entry.size} isDirectory={entry.isDirectory} />
        </TableCell>
        <TableCell className="w-[120px] py-0 px-2 text-right">
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatRelativeTime(entry.modifiedAt)}
          </span>
        </TableCell>
      </TableRow>
    </FileContextMenu>
  );
}

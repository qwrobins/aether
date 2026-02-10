import { cn } from '@/lib/utils';
import { FileIcon } from '@/components/shared/FileIcon';
import { FileSize } from '@/components/shared/FileSize';
import { TableRow, TableCell } from '@/components/ui/table';
import type { FileEntry } from '@shared/types/filesystem';

export type PanelType = 'local' | 'remote';

interface FileItemProps {
  entry: FileEntry;
  isSelected: boolean;
  panelType: PanelType;
  onSelect: (path: string, multi: boolean) => void;
  onNavigate: (path: string) => void;
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

export function FileItem({ entry, isSelected, panelType, onSelect, onNavigate }: FileItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    const payload = {
      panelType,
      entries: [
        {
          name: entry.name,
          path: entry.path,
          size: entry.size,
          isDirectory: entry.isDirectory,
        },
      ],
    };
    e.dataTransfer.setData('application/aether-transfer', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <TableRow
      className={cn(
        'h-[34px] cursor-pointer border-0 transition-colors duration-150',
        'hover:bg-white/[0.03]',
        isSelected && 'bg-primary/8 shadow-[inset_2px_0_0_0_var(--color-primary)]'
      )}
      data-state={isSelected ? 'selected' : undefined}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey)}
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
  );
}

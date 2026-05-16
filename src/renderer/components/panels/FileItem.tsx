import { cn } from '@/lib/utils';
import { FileIcon } from '@/components/shared/FileIcon';
import { FileSize } from '@/components/shared/FileSize';
import { TableRow, TableCell } from '@/components/ui/table';
import { FileContextMenu } from './FileContextMenu';
import { Upload, Download, Trash2, Pencil } from 'lucide-react';
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

function getFileNameParts(
  name: string,
  isDirectory: boolean,
): { base: string; ext: string } {
  if (isDirectory) return { base: name, ext: '' };
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, lastDot), ext: name.slice(lastDot) };
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
      <TableRow
        className={cn(
          'group h-[40px] cursor-pointer border-0 transition-colors duration-150',
          'hover:bg-white/[0.035]',
          isSelected && 'hover:bg-primary/[0.10] bg-primary/[0.08]',
        )}
        style={{
          animation: `row-enter 0.18s ${Math.min(index * 0.025, 0.5)}s ease-out both`,
          boxShadow: isSelected
            ? 'inset 3px 0 0 0 var(--color-primary)'
            : 'none',
        }}
        data-state={isSelected ? 'selected' : undefined}
        draggable
        onDragStart={handleDragStart}
        onClick={(e) =>
          onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)
        }
        onDoubleClick={() => {
          if (entry.isDirectory) onNavigate(entry.path);
        }}
      >
        <TableCell className="w-[28px] px-3 py-0">
          <FileIcon entry={entry} size={18} />
        </TableCell>
        <TableCell className="px-2 py-0">
          <div className="flex min-w-0 items-center">
            <span className="truncate text-[13px]">{base}</span>
            {!entry.isDirectory && ext && (
              <span className="shrink-0 text-[13px] text-muted-foreground/50">
                {ext}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="w-[90px] px-2 py-0 text-right">
          <FileSize bytes={entry.size} isDirectory={entry.isDirectory} />
        </TableCell>
        <TableCell className="w-[120px] px-2 py-0 text-right">
          <span className="font-mono text-[11px] text-muted-foreground/70">
            {formatRelativeTime(entry.modifiedAt)}
          </span>
        </TableCell>
        <TableCell className="w-[80px] px-2 py-0 text-right">
          <div
            className={cn(
              'flex items-center justify-end gap-0.5 transition-opacity duration-150',
              isSelected
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTransfer(entry);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              title={panelType === 'local' ? 'Upload' : 'Download'}
              aria-label={panelType === 'local' ? 'Upload' : 'Download'}
            >
              {panelType === 'local' ? (
                <Upload size={13} />
              ) : (
                <Download size={13} />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename(entry.path);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              title="Rename"
              aria-label="Rename"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const pathsToDelete =
                  isSelected && selectedFiles.size > 1
                    ? Array.from(selectedFiles)
                    : [entry.path];
                onDelete(pathsToDelete);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
              title="Delete"
              aria-label={
                isSelected && selectedFiles.size > 1 ? 'Delete selected files' : 'Delete'
              }
            >
              <Trash2 size={13} />
            </button>
          </div>
        </TableCell>
      </TableRow>
    </FileContextMenu>
  );
}

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Trash2, Pencil, Copy, Download, Upload, ExternalLink } from 'lucide-react';
import type { FileEntry } from '@shared/types/filesystem';

interface FileContextMenuProps {
  children: React.ReactNode;
  entry: FileEntry;
  isSelected: boolean;
  selectedFiles: Set<string>;
  panelType: 'local' | 'remote';
  onNavigate: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onRename: (oldPath: string) => void;
  onTransfer: (entry: FileEntry) => void;
}

export function FileContextMenu({
  children,
  entry,
  isSelected,
  selectedFiles,
  panelType,
  onNavigate,
  onDelete,
  onRename,
  onTransfer,
}: FileContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {entry.isDirectory && (
          <ContextMenuItem onClick={() => onNavigate(entry.path)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onTransfer(entry)}>
          {panelType === 'local' ? (
            <Upload className="mr-2 h-4 w-4" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {panelType === 'local' ? 'Upload' : 'Download'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onRename(entry.path)}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(entry.path)}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            const pathsToDelete =
              isSelected && selectedFiles.size > 1
                ? Array.from(selectedFiles)
                : [entry.path];
            onDelete(pathsToDelete);
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

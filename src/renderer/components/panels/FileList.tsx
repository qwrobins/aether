import { ChevronUp, ChevronDown, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { FileItem } from './FileItem';
import type { FileEntry, SortField, SortDirection, ViewMode } from '@shared/types/filesystem';

interface FileListProps {
  entries: FileEntry[];
  selectedFiles: Set<string>;
  isLoading: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  onSelect: (path: string, multi: boolean) => void;
  onNavigate: (path: string) => void;
  onSort: (field: SortField) => void;
}

function SortIndicator({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (field !== sortField) return null;
  return sortDirection === 'asc' ? (
    <ChevronUp size={12} className="text-primary" />
  ) : (
    <ChevronDown size={12} className="text-primary" />
  );
}

export function FileList({
  entries,
  selectedFiles,
  isLoading,
  sortField,
  sortDirection,
  onSelect,
  onNavigate,
  onSort,
}: FileListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/50 hover:bg-transparent">
              <TableHead className="w-[20px] px-2" />
              <TableHead className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</TableHead>
              <TableHead className="w-[80px] px-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Size</TableHead>
              <TableHead className="w-[120px] px-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Modified</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
        <div className="flex-1 px-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-[34px] items-center gap-3 px-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 flex-1 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon={FolderOpen} title="This folder is empty" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="grid" aria-label="File list">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/50 hover:bg-transparent">
            <TableHead className="w-[20px] px-2" />
            <TableHead
              className="cursor-pointer select-none px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => onSort('name')}
            >
              <span className="flex items-center gap-1">
                Name
                <SortIndicator field="name" sortField={sortField} sortDirection={sortDirection} />
              </span>
            </TableHead>
            <TableHead
              className="w-[80px] cursor-pointer select-none px-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => onSort('size')}
            >
              <span className="flex items-center justify-end gap-1">
                Size
                <SortIndicator field="size" sortField={sortField} sortDirection={sortDirection} />
              </span>
            </TableHead>
            <TableHead
              className="w-[120px] cursor-pointer select-none px-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => onSort('modifiedAt')}
            >
              <span className="flex items-center justify-end gap-1">
                Modified
                <SortIndicator field="modifiedAt" sortField={sortField} sortDirection={sortDirection} />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>
      <ScrollArea className="flex-1">
        <Table>
          <TableBody>
            {entries.map((entry) => (
              <FileItem
                key={entry.path}
                entry={entry}
                isSelected={selectedFiles.has(entry.path)}
                onSelect={onSelect}
                onNavigate={onNavigate}
              />
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

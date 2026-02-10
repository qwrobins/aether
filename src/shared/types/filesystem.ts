export interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string; // ISO 8601
  permissions?: string;
  owner?: string;
}

export interface DirectoryListing {
  path: string;
  entries: FileEntry[];
  parentPath: string | null;
}

export type SortField = 'name' | 'size' | 'modifiedAt';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';

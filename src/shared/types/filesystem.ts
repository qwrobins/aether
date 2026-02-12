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

export interface DriveInfo {
  name: string;
  path: string;
  devicePath?: string;
  isRemovable: boolean;
  isMounted: boolean;
  size?: string;
  fsType?: string;
}

export type SortField = 'name' | 'size' | 'modifiedAt';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';

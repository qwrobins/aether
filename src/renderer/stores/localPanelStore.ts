import { create } from 'zustand';
import type { FileEntry, SortField, SortDirection, ViewMode } from '@shared/types/filesystem';

interface LocalPanelState {
  currentPath: string;
  entries: FileEntry[];
  selectedFiles: Set<string>;
  viewMode: ViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  error: string | null;

  navigateTo: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;
  selectFile: (path: string, multi?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  setSort: (field: SortField) => void;
}

function sortEntries(entries: FileEntry[], field: SortField, direction: SortDirection): FileEntry[] {
  const dirs = entries.filter((e) => e.isDirectory);
  const files = entries.filter((e) => !e.isDirectory);
  const multiplier = direction === 'asc' ? 1 : -1;

  const sorter = (a: FileEntry, b: FileEntry) => {
    switch (field) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      case 'size':
        return multiplier * (a.size - b.size);
      case 'modifiedAt':
        return multiplier * (new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime());
      default:
        return 0;
    }
  };

  dirs.sort(sorter);
  files.sort(sorter);

  // Directories always come first
  return [...dirs, ...files];
}

function getParentPath(path: string): string {
  // Handle both Unix and Windows paths
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return normalized.substring(0, lastSlash) || '/';
}

export const useLocalPanelStore = create<LocalPanelState>((set, get) => ({
  currentPath: '',
  entries: [],
  selectedFiles: new Set(),
  viewMode: 'list',
  sortField: 'name',
  sortDirection: 'asc',
  isLoading: false,
  error: null,

  navigateTo: async (path: string) => {
    set({ isLoading: true, error: null, selectedFiles: new Set() });
    try {
      const listing = await window.api.invoke('fs:read-dir', path);
      const { sortField, sortDirection } = get();
      set({
        currentPath: listing.path,
        entries: sortEntries(listing.entries, sortField, sortDirection),
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to read directory',
        isLoading: false,
      });
    }
  },

  navigateUp: async () => {
    const { currentPath, navigateTo } = get();
    const parent = getParentPath(currentPath);
    if (parent !== currentPath) {
      await navigateTo(parent);
    }
  },

  refresh: async () => {
    const { currentPath, navigateTo } = get();
    if (currentPath) {
      await navigateTo(currentPath);
    }
  },

  selectFile: (path: string, multi = false) => {
    set((state) => {
      const next = new Set(multi ? state.selectedFiles : []);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { selectedFiles: next };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedFiles: new Set(state.entries.map((e) => e.path)),
    }));
  },

  clearSelection: () => {
    set({ selectedFiles: new Set() });
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },

  setSort: (field: SortField) => {
    set((state) => {
      const direction: SortDirection =
        state.sortField === field && state.sortDirection === 'asc' ? 'desc' : 'asc';
      return {
        sortField: field,
        sortDirection: direction,
        entries: sortEntries(state.entries, field, direction),
      };
    });
  },
}));

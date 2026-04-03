import { create } from 'zustand';
import type { FileEntry, SortField, SortDirection, ViewMode } from '@shared/types/filesystem';

interface LocalPanelState {
  currentPath: string;
  entries: FileEntry[];
  selectedFiles: Set<string>;
  selectionAnchor: string | null;
  viewMode: ViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  error: string | null;
  blockedPath: string | null;

  navigateTo: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;
  selectFile: (path: string, multi?: boolean, shift?: boolean) => void;
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
  selectionAnchor: null as string | null,
  viewMode: 'list',
  sortField: 'name',
  sortDirection: 'asc',
  isLoading: false,
  error: null,
  blockedPath: null,

  navigateTo: async (path: string) => {
    set({ isLoading: true, error: null, blockedPath: null, selectedFiles: new Set(), selectionAnchor: null });
    try {
      const listing = await window.api.invoke('fs:read-dir', path);
      const { sortField, sortDirection } = get();
      set({
        currentPath: listing.path,
        entries: sortEntries(listing.entries, sortField, sortDirection),
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read directory';
      const isEperm = message.startsWith('MACOS_EPERM:');
      set({
        error: message,
        blockedPath: isEperm ? message.slice('MACOS_EPERM:'.length) : null,
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

  selectFile: (path: string, multi = false, shift = false) => {
    set((state) => {
      const { entries } = state;
      const pathIndex = entries.findIndex((e) => e.path === path);
      if (pathIndex < 0) return state;

      let next: Set<string>;
      if (shift) {
        const anchor = state.selectionAnchor ?? Array.from(state.selectedFiles)[0];
        const anchorIndex = anchor !== undefined ? entries.findIndex((e) => e.path === anchor) : -1;
        const from = anchorIndex >= 0 ? Math.min(anchorIndex, pathIndex) : pathIndex;
        const to = anchorIndex >= 0 ? Math.max(anchorIndex, pathIndex) : pathIndex;
        next = new Set(entries.slice(from, to + 1).map((e) => e.path));
      } else if (multi) {
        next = new Set(state.selectedFiles);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return { selectedFiles: next, selectionAnchor: path };
      } else {
        next = new Set([path]);
        return { selectedFiles: next, selectionAnchor: path };
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
    set({ selectedFiles: new Set(), selectionAnchor: null });
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

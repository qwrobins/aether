import { create } from 'zustand';
import type { FileEntry, SortField, SortDirection, ViewMode } from '@shared/types/filesystem';
import type { ConnectionProfile, ConnectionStatus, S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';

interface RemotePanelState {
  // Connection state
  activeConnectionId: string | null;
  activeProfile: ConnectionProfile | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // S3 specific
  buckets: string[];
  currentBucket: string | null;

  // File browser state
  currentPath: string;
  entries: FileEntry[];
  selectedFiles: Set<string>;
  selectionAnchor: string | null;
  viewMode: ViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  error: string | null;

  // Connection actions
  connect: (profile: ConnectionProfile) => Promise<void>;
  disconnect: () => Promise<void>;

  // S3 actions
  loadBuckets: () => Promise<void>;
  selectBucket: (bucket: string) => Promise<void>;

  // File browser actions
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
  return [...dirs, ...files];
}

function getParentPrefix(prefix: string): string {
  // S3 prefixes use '/' as delimiter
  const trimmed = prefix.replace(/\/+$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash < 0) return '';
  return trimmed.substring(0, lastSlash + 1);
}

function getParentPath(path: string): string {
  // SFTP uses absolute paths with '/' delimiter
  const trimmed = path.replace(/\/+$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return trimmed.substring(0, lastSlash);
}

const initialState = {
  activeConnectionId: null as string | null,
  activeProfile: null as ConnectionProfile | null,
  connectionStatus: 'disconnected' as ConnectionStatus,
  connectionError: null as string | null,
  buckets: [] as string[],
  currentBucket: null as string | null,
  currentPath: '',
  entries: [] as FileEntry[],
  selectedFiles: new Set<string>(),
  selectionAnchor: null as string | null,
  viewMode: 'list' as ViewMode,
  sortField: 'name' as SortField,
  sortDirection: 'asc' as SortDirection,
  isLoading: false,
  error: null as string | null,
};

export const useRemotePanelStore = create<RemotePanelState>((set, get) => ({
  ...initialState,

  connect: async (profile: ConnectionProfile) => {
    set({
      connectionStatus: 'connecting',
      connectionError: null,
      activeProfile: profile,
    });
    try {
      await window.api.invoke('conn:connect', profile.id);
      set({
        connectionStatus: 'connected',
        activeConnectionId: profile.id,
      });
      if (profile.type === 's3') {
        await get().loadBuckets();
        const s3Profile = profile as S3ConnectionProfile;
        if (s3Profile.defaultBucket) {
          const { buckets } = get();
          if (buckets.includes(s3Profile.defaultBucket)) {
            await get().selectBucket(s3Profile.defaultBucket);
          }
        }
      } else if (profile.type === 'sftp') {
        const defaultPath = (profile as SftpConnectionProfile).defaultPath || '/';
        await get().navigateTo(defaultPath);
      }
    } catch (err) {
      set({
        connectionStatus: 'error',
        connectionError: err instanceof Error ? err.message : 'Connection failed',
        activeConnectionId: null,
      });
    }
  },

  disconnect: async () => {
    const { activeConnectionId } = get();
    if (activeConnectionId) {
      try {
        await window.api.invoke('conn:disconnect', activeConnectionId);
      } catch {
        // Ignore disconnect errors
      }
    }
    set({ ...initialState });
  },

  loadBuckets: async () => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) return;
    set({ isLoading: true, error: null });
    try {
      const buckets = await window.api.invoke('s3:list-buckets', activeConnectionId);
      set({ buckets, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to list buckets',
        isLoading: false,
      });
    }
  },

  selectBucket: async (bucket: string) => {
    set({ currentBucket: bucket, currentPath: '', entries: [], selectedFiles: new Set(), selectionAnchor: null });
    await get().navigateTo('');
  },

  navigateTo: async (path: string) => {
    const { activeConnectionId, activeProfile, currentBucket, sortField, sortDirection } = get();
    if (!activeConnectionId || !activeProfile) return;

    // S3 requires a bucket to be selected before navigating
    if (activeProfile.type === 's3' && !currentBucket) return;

    set({ isLoading: true, error: null, selectedFiles: new Set(), selectionAnchor: null });
    try {
      const listing = activeProfile.type === 'sftp'
        ? await window.api.invoke('sftp:list', activeConnectionId, path)
        : await window.api.invoke('s3:list-objects', activeConnectionId, currentBucket!, path);
      set({
        currentPath: path,
        entries: sortEntries(listing.entries, sortField, sortDirection),
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to list directory',
        isLoading: false,
      });
    }
  },

  navigateUp: async () => {
    const { currentPath, activeProfile, navigateTo } = get();
    if (!activeProfile) return;

    if (activeProfile.type === 'sftp') {
      if (currentPath === '/') return;
      const parent = getParentPath(currentPath);
      await navigateTo(parent);
    } else {
      if (!currentPath) return;
      const parent = getParentPrefix(currentPath);
      await navigateTo(parent);
    }
  },

  refresh: async () => {
    const { currentPath, currentBucket, activeProfile, navigateTo, loadBuckets } = get();
    if (activeProfile?.type === 'sftp') {
      await navigateTo(currentPath);
    } else if (currentBucket) {
      await navigateTo(currentPath);
    } else {
      await loadBuckets();
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

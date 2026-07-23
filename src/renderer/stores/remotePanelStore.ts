import { create } from 'zustand';
import type { FileEntry, SortField, SortDirection, ViewMode } from '@shared/types/filesystem';
import type {
  ConnectionProfile,
  ConnectionStatus,
  MountableConnectionProfile,
  S3ConnectionProfile,
  SftpConnectionProfile,
} from '@shared/types/connection';

interface RemotePanelState {
  mode: 'connection' | 'taildrop';

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
  isLoadingMore: boolean;
  continuationToken: string | null;
  navigationGeneration: number;
  error: string | null;

  // Connection actions
  connect: (profile: ConnectionProfile) => Promise<void>;
  disconnect: () => Promise<void>;
  activateTaildrop: () => void;

  // S3 actions
  loadBuckets: () => Promise<void>;
  selectBucket: (bucket: string) => Promise<void>;

  // File browser actions
  navigateTo: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;
  loadMoreEntries: () => Promise<void>;
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

  // Precompute timestamps once so the comparator does not re-parse dates.
  const modifiedTimes = new Map<FileEntry, number>();
  if (field === 'modifiedAt') {
    for (const entry of entries) {
      modifiedTimes.set(entry, new Date(entry.modifiedAt).getTime());
    }
  }

  const sorter = (a: FileEntry, b: FileEntry) => {
    switch (field) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      case 'size':
        return multiplier * (a.size - b.size);
      case 'modifiedAt':
        return multiplier * ((modifiedTimes.get(a) ?? 0) - (modifiedTimes.get(b) ?? 0));
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
  const trimmed = path.replace(/\/+$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return trimmed.substring(0, lastSlash);
}

function isMountableProfile(profile: ConnectionProfile): profile is MountableConnectionProfile {
  return profile.type === 'smb' || profile.type === 'nfs' || profile.type === 'webdav';
}

async function listRemoteEntries(
  activeConnectionId: string,
  activeProfile: ConnectionProfile,
  currentBucket: string | null,
  path: string,
  continuationToken?: string,
) {
  if (activeProfile.type === 'sftp') {
    return window.api.invoke('sftp:list', activeConnectionId, path);
  }
  if (activeProfile.type === 'rsync') {
    return window.api.invoke('rsync:list', activeConnectionId, path);
  }
  if (isMountableProfile(activeProfile)) {
    return window.api.invoke('netfs:list', activeConnectionId, path);
  }
  if (activeProfile.type === 's3') {
    if (!currentBucket) {
      throw new Error('Select an S3 bucket before listing objects');
    }
    return window.api.invoke(
      's3:list-objects',
      activeConnectionId,
      currentBucket,
      path,
      continuationToken,
    );
  }
  throw new Error(`${activeProfile.type} browsing is not implemented yet`);
}

const initialState = {
  mode: 'connection' as const,
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
  isLoadingMore: false,
  continuationToken: null as string | null,
  navigationGeneration: 0,
  error: null as string | null,
};

export const useRemotePanelStore = create<RemotePanelState>((set, get) => ({
  ...initialState,

  connect: async (profile: ConnectionProfile) => {
    set((state) => ({
      mode: 'connection',
      connectionStatus: 'connecting',
      connectionError: null,
      activeProfile: profile,
      navigationGeneration: state.navigationGeneration + 1,
    }));
    try {
      let connectResult = await window.api.invoke('conn:connect', profile.id);
      let connectedProfile = profile;
      if (connectResult.status === 'host-key-untrusted') {
        if (profile.type !== 'sftp' && profile.type !== 'rsync') {
          throw new Error('SSH host key verification is not supported for this connection type');
        }
        // The trust dialog lives in the main process and persists the
        // fingerprint by profile id, so it only works for saved profiles.
        if (!profile.id) {
          throw new Error('Save this connection profile before trusting its SSH host key');
        }
        const trusted = await window.api.invoke(
          'conn:trust-host-key',
          profile.id,
          connectResult.fingerprint,
        );
        if (!trusted) {
          throw new Error('SSH host key was not trusted');
        }

        connectedProfile = {
          ...profile,
          hostKeyFingerprint: connectResult.fingerprint,
        };
        connectResult = await window.api.invoke('conn:connect', profile.id);
        if (connectResult.status !== 'connected') {
          throw new Error('SSH host key trust could not be established');
        }
      }
      const current = get();
      if (current.mode !== 'connection' || current.activeProfile?.id !== profile.id) {
        try {
          await window.api.invoke('conn:disconnect', profile.id);
        } catch {
          // The active view has already changed, so cleanup failures are non-fatal.
        }
        return;
      }
      set({
        connectionStatus: 'connected',
        activeConnectionId: profile.id,
        activeProfile: connectedProfile,
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
      } else if (isMountableProfile(profile)) {
        await get().navigateTo(profile.defaultPath || profile.mountPath || '/');
      } else if (profile.type === 'rsync') {
        await get().navigateTo(profile.defaultPath || profile.module || '/');
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
    set((state) => ({
      ...initialState,
      navigationGeneration: state.navigationGeneration + 1,
    }));
  },

  activateTaildrop: () => {
    set((state) => ({
      ...initialState,
      mode: 'taildrop',
      connectionStatus: 'connected',
      navigationGeneration: state.navigationGeneration + 1,
    }));
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
    set((state) => ({
      currentBucket: bucket,
      currentPath: '',
      entries: [],
      continuationToken: null,
      selectedFiles: new Set(),
      selectionAnchor: null,
      navigationGeneration: state.navigationGeneration + 1,
    }));
    await get().navigateTo('');
  },

  navigateTo: async (path: string) => {
    const { activeConnectionId, activeProfile, currentBucket, sortField, sortDirection } = get();
    if (!activeConnectionId || !activeProfile) return;

    if (activeProfile.type === 's3' && !currentBucket) return;

    const navigationGeneration = get().navigationGeneration + 1;
    set({
      isLoading: true,
      isLoadingMore: false,
      continuationToken: null,
      navigationGeneration,
      error: null,
      selectedFiles: new Set(),
      selectionAnchor: null,
    });
    try {
      const listing = await listRemoteEntries(activeConnectionId, activeProfile, currentBucket, path);
      set((state) =>
        state.navigationGeneration === navigationGeneration
          ? {
              currentPath: path,
              entries: sortEntries(listing.entries, sortField, sortDirection),
              continuationToken: listing.continuationToken ?? null,
              isLoading: false,
            }
          : {},
      );
    } catch (err) {
      set((state) =>
        state.navigationGeneration === navigationGeneration
          ? {
              error: err instanceof Error ? err.message : 'Failed to list directory',
              isLoading: false,
            }
          : {},
      );
    }
  },

  navigateUp: async () => {
    const { currentPath, activeProfile, navigateTo } = get();
    if (!activeProfile) return;

    if (activeProfile.type === 'sftp' || activeProfile.type === 'rsync' || isMountableProfile(activeProfile)) {
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
    const { mode, currentPath, currentBucket, activeProfile, navigateTo, loadBuckets } = get();
    if (mode === 'taildrop') return;
    if (
      activeProfile?.type === 'sftp' ||
      activeProfile?.type === 'rsync' ||
      (activeProfile && isMountableProfile(activeProfile))
    ) {
      await navigateTo(currentPath);
    } else if (currentBucket) {
      await navigateTo(currentPath);
    } else {
      await loadBuckets();
    }
  },

  loadMoreEntries: async () => {
    const {
      activeConnectionId,
      activeProfile,
      currentBucket,
      currentPath,
      continuationToken,
      isLoadingMore,
      navigationGeneration,
    } = get();
    if (
      isLoadingMore ||
      !continuationToken ||
      !activeConnectionId ||
      activeProfile?.type !== 's3' ||
      !currentBucket
    ) {
      return;
    }

    set({ isLoadingMore: true, error: null });
    try {
      const listing = await listRemoteEntries(
        activeConnectionId,
        activeProfile,
        currentBucket,
        currentPath,
        continuationToken,
      );
      set((state) => {
        if (
          state.activeConnectionId !== activeConnectionId ||
          state.currentBucket !== currentBucket ||
          state.currentPath !== currentPath ||
          state.navigationGeneration !== navigationGeneration
        ) {
          return {};
        }
        const entriesByPath = new Map(
          [...state.entries, ...listing.entries].map((entry) => [entry.path, entry]),
        );
        return {
          entries: sortEntries(
            [...entriesByPath.values()],
            state.sortField,
            state.sortDirection,
          ),
          continuationToken: listing.continuationToken ?? null,
          isLoadingMore: false,
        };
      });
    } catch (err) {
      set((state) => {
        if (
          state.activeConnectionId !== activeConnectionId ||
          state.currentBucket !== currentBucket ||
          state.currentPath !== currentPath ||
          state.navigationGeneration !== navigationGeneration
        ) {
          return {};
        }
        return {
          error: err instanceof Error ? err.message : 'Failed to load more objects',
          isLoadingMore: false,
        };
      });
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

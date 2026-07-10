// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemotePanelStore } from '../remotePanelStore';
import type { ConnectionProfile, S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';
import type { IpcInvokeMap } from '@shared/types/ipc';

function fileEntry(overrides: Partial<FileEntry>): FileEntry {
  return {
    name: 'file.txt',
    path: 'file.txt',
    size: 10,
    isDirectory: false,
    modifiedAt: '2026-03-07T10:00:00.000Z',
    ...overrides,
  };
}

function s3Profile(overrides: Partial<S3ConnectionProfile> = {}): S3ConnectionProfile {
  return {
    id: 's3-1',
    name: 'S3',
    type: 's3',
    region: 'us-east-1',
    authMethod: 'credentials',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    createdAt: '2026-03-07T10:00:00.000Z',
    updatedAt: '2026-03-07T10:00:00.000Z',
    ...overrides,
  };
}

function sftpProfile(overrides: Partial<SftpConnectionProfile> = {}): SftpConnectionProfile {
  return {
    id: 'sftp-1',
    name: 'SFTP',
    type: 'sftp',
    host: 'example.com',
    port: 22,
    username: 'deploy',
    authMethod: 'password',
    password: 'secret',
    createdAt: '2026-03-07T10:00:00.000Z',
    updatedAt: '2026-03-07T10:00:00.000Z',
    ...overrides,
  };
}

function resetStore(): void {
  useRemotePanelStore.setState({
    mode: 'connection',
    activeConnectionId: null,
    activeProfile: null,
    connectionStatus: 'disconnected',
    connectionError: null,
    buckets: [],
    currentBucket: null,
    currentPath: '',
    entries: [],
    selectedFiles: new Set<string>(),
    selectionAnchor: null,
    viewMode: 'list',
    sortField: 'name',
    sortDirection: 'asc',
    isLoading: false,
    error: null,
  });
}

function mockInvoke(
  implementation: (channel: keyof IpcInvokeMap, ...args: unknown[]) => Promise<unknown>,
): void {
  window.api.invoke = vi.fn(implementation) as typeof window.api.invoke;
}

describe('useRemotePanelStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
    window.api.invoke = vi.fn();
  });

  it('connects an S3 profile, loads buckets, and auto-selects the default bucket', async () => {
    const listing: DirectoryListing = {
      path: '',
      parentPath: null,
      entries: [
        fileEntry({ name: 'b.txt', path: 'b.txt' }),
        fileEntry({ name: 'docs', path: 'docs/', isDirectory: true, size: 0 }),
      ],
    };
    mockInvoke(async (channel) => {
      if (channel === 'conn:connect') return Promise.resolve({ status: 'connected' });
      if (channel === 's3:list-buckets') return Promise.resolve(['archive', 'photos']);
      if (channel === 's3:list-objects') return Promise.resolve(listing);
      return Promise.reject(new Error(`Unhandled channel ${channel}`));
    });

    await useRemotePanelStore.getState().connect(s3Profile({ defaultBucket: 'photos' }));

    expect(useRemotePanelStore.getState()).toMatchObject({
      connectionStatus: 'connected',
      activeConnectionId: 's3-1',
      currentBucket: 'photos',
      currentPath: '',
    });
    expect(useRemotePanelStore.getState().entries.map((item: FileEntry) => item.name)).toEqual(['docs', 'b.txt']);
  });

  it('connects an SFTP profile and navigates to its default path', async () => {
    const listing: DirectoryListing = {
      path: '/var/www',
      parentPath: '/var',
      entries: [fileEntry({ name: 'index.html', path: '/var/www/index.html' })],
    };
    mockInvoke(async (channel) => {
      if (channel === 'conn:connect') return Promise.resolve({ status: 'connected' });
      if (channel === 'sftp:list') return Promise.resolve(listing);
      return Promise.reject(new Error(`Unhandled channel ${channel}`));
    });

    await useRemotePanelStore.getState().connect(sftpProfile({ defaultPath: '/var/www' }));

    expect(window.api.invoke).toHaveBeenCalledWith('sftp:list', 'sftp-1', '/var/www');
    expect(useRemotePanelStore.getState()).toMatchObject({
      connectionStatus: 'connected',
      activeConnectionId: 'sftp-1',
      currentPath: '/var/www',
    });
  });

  it('confirms and persists a first-use SSH host key before reconnecting', async () => {
    const listing: DirectoryListing = {
      path: '/',
      parentPath: null,
      entries: [],
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let connectAttempts = 0;
    mockInvoke(async (channel) => {
      if (channel === 'conn:connect') {
        connectAttempts++;
        return connectAttempts === 1
          ? { status: 'host-key-untrusted', fingerprint: 'SHA256:trusted' }
          : { status: 'connected' };
      }
      if (channel === 'conn:save') return 'sftp-1';
      if (channel === 'sftp:list') return listing;
      return Promise.reject(new Error(`Unhandled channel ${channel}`));
    });

    await useRemotePanelStore.getState().connect(sftpProfile());

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('SHA256:trusted'));
    expect(window.api.invoke).toHaveBeenCalledWith(
      'conn:save',
      expect.objectContaining({ id: 'sftp-1', hostKeyFingerprint: 'SHA256:trusted' }),
    );
    expect(connectAttempts).toBe(2);
    expect(useRemotePanelStore.getState().activeProfile).toEqual(
      expect.objectContaining({ hostKeyFingerprint: 'SHA256:trusted' }),
    );
  });

  it('rejects a first-use SSH host key without persisting it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockInvoke(async (channel) => {
      if (channel === 'conn:connect') {
        return { status: 'host-key-untrusted', fingerprint: 'SHA256:untrusted' };
      }
      return Promise.reject(new Error(`Unhandled channel ${channel}`));
    });

    await useRemotePanelStore.getState().connect(sftpProfile());

    expect(window.api.invoke).not.toHaveBeenCalledWith('conn:save', expect.anything());
    expect(useRemotePanelStore.getState()).toMatchObject({
      connectionStatus: 'error',
      connectionError: 'SSH host key was not trusted',
      activeConnectionId: null,
    });
  });

  it('disconnects a completed connection after the active view changes', async () => {
    let resolveConnect: ((result: { status: 'connected' }) => void) | undefined;
    const events: string[] = [];
    mockInvoke(async (channel) => {
      if (channel === 'conn:connect') {
        events.push('connect-started');
        return new Promise<{ status: 'connected' }>((resolve) => {
          resolveConnect = resolve;
        }).then((result) => {
          events.push('connect-completed');
          return result;
        });
      }
      if (channel === 'conn:disconnect') {
        events.push('disconnect');
        return undefined;
      }
      return Promise.reject(new Error(`Unhandled channel ${channel}`));
    });

    const connect = useRemotePanelStore.getState().connect(sftpProfile());
    useRemotePanelStore.getState().activateTaildrop();
    resolveConnect?.({ status: 'connected' });
    await connect;

    expect(window.api.invoke).toHaveBeenCalledWith('conn:disconnect', 'sftp-1');
    expect(events).toEqual(['connect-started', 'connect-completed', 'disconnect']);
    expect(useRemotePanelStore.getState()).toMatchObject({
      mode: 'taildrop',
      connectionStatus: 'connected',
      activeConnectionId: null,
    });
  });

  it('refreshes bucket list when connected to S3 without a selected bucket', async () => {
    const profile: ConnectionProfile = s3Profile();
    useRemotePanelStore.setState({
      activeConnectionId: 's3-1',
      activeProfile: profile,
      connectionStatus: 'connected',
      currentBucket: null,
    });
    mockInvoke(async (channel) => {
      if (channel === 's3:list-buckets') return Promise.resolve(['photos']);
      return Promise.reject(new Error(`Unhandled channel ${channel}`));
    });

    await useRemotePanelStore.getState().refresh();

    expect(window.api.invoke).toHaveBeenCalledWith('s3:list-buckets', 's3-1');
    expect(useRemotePanelStore.getState().buckets).toEqual(['photos']);
  });

  it('navigates up through S3 prefixes', async () => {
    useRemotePanelStore.setState({
      activeConnectionId: 's3-1',
      activeProfile: s3Profile(),
      currentBucket: 'photos',
      currentPath: 'foo/bar/',
    });
    const navigateTo = vi.spyOn(useRemotePanelStore.getState(), 'navigateTo').mockResolvedValue();

    await useRemotePanelStore.getState().navigateUp();

    expect(navigateTo).toHaveBeenCalledWith('foo/');
  });

  it('handles connection and bucket-list failures cleanly', async () => {
    window.api.invoke = vi.fn().mockRejectedValue(new Error('offline'));

    await useRemotePanelStore.getState().connect(s3Profile());
    expect(useRemotePanelStore.getState()).toMatchObject({
      connectionStatus: 'error',
      connectionError: 'offline',
      activeConnectionId: null,
    });

    useRemotePanelStore.setState({
      activeConnectionId: 's3-1',
      activeProfile: s3Profile(),
      connectionStatus: 'connected',
    });

    await useRemotePanelStore.getState().loadBuckets();
    expect(useRemotePanelStore.getState()).toMatchObject({
      error: 'offline',
      isLoading: false,
    });
  });

  it('supports selection helpers, sort toggling, and disconnect reset', async () => {
    useRemotePanelStore.setState({
      activeConnectionId: 'sftp-1',
      activeProfile: sftpProfile(),
      connectionStatus: 'connected',
      currentPath: '/remote',
      entries: [
        fileEntry({ name: 'b-folder', path: '/remote/b-folder', isDirectory: true, size: 0 }),
        fileEntry({ name: 'a-folder', path: '/remote/a-folder', isDirectory: true, size: 0 }),
        fileEntry({ name: 'z.txt', path: '/remote/z.txt', size: 50 }),
        fileEntry({ name: 'a.txt', path: '/remote/a.txt', size: 10 }),
      ],
    });
    window.api.invoke = vi.fn().mockResolvedValue(undefined);

    useRemotePanelStore.getState().selectFile('/remote/a-folder');
    useRemotePanelStore.getState().selectFile('/remote/z.txt', true);
    expect(Array.from(useRemotePanelStore.getState().selectedFiles)).toEqual(['/remote/a-folder', '/remote/z.txt']);

    useRemotePanelStore.getState().selectAll();
    expect(useRemotePanelStore.getState().selectedFiles.size).toBe(4);

    useRemotePanelStore.getState().clearSelection();
    expect(useRemotePanelStore.getState().selectedFiles.size).toBe(0);

    useRemotePanelStore.getState().setSort('size');
    expect(useRemotePanelStore.getState().entries.map((item: FileEntry) => item.name)).toEqual([
      'b-folder',
      'a-folder',
      'a.txt',
      'z.txt',
    ]);

    useRemotePanelStore.getState().setViewMode('grid');
    expect(useRemotePanelStore.getState().viewMode).toBe('grid');

    await useRemotePanelStore.getState().disconnect();
    expect(window.api.invoke).toHaveBeenCalledWith('conn:disconnect', 'sftp-1');
    expect(useRemotePanelStore.getState()).toMatchObject({
      activeConnectionId: null,
      connectionStatus: 'disconnected',
      currentPath: '',
      currentBucket: null,
    });
  });
});

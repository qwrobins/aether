// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalPanelStore } from '../localPanelStore';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';

function entry(overrides: Partial<FileEntry>): FileEntry {
  return {
    name: 'file',
    path: '/tmp/file',
    size: 0,
    isDirectory: false,
    modifiedAt: '2026-03-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('useLocalPanelStore', () => {
  beforeEach(() => {
    useLocalPanelStore.setState({
      currentPath: '',
      entries: [],
      selectedFiles: new Set(),
      selectionAnchor: null,
      viewMode: 'list',
      sortField: 'name',
      sortDirection: 'asc',
      isLoading: false,
      error: null,
    });
    window.api.invoke = vi.fn();
  });

  it('loads entries and keeps directories before files', async () => {
    const listing: DirectoryListing = {
      path: '/workspace',
      parentPath: '/',
      entries: [
        entry({ name: 'zeta.txt', path: '/workspace/zeta.txt' }),
        entry({ name: 'alpha', path: '/workspace/alpha', isDirectory: true }),
        entry({ name: 'beta.txt', path: '/workspace/beta.txt' }),
        entry({ name: 'docs', path: '/workspace/docs', isDirectory: true }),
      ],
    };
    window.api.invoke = vi.fn().mockResolvedValue(listing);

    await useLocalPanelStore.getState().navigateTo('/workspace');

    expect(useLocalPanelStore.getState().entries.map((item: FileEntry) => item.name)).toEqual([
      'alpha',
      'docs',
      'beta.txt',
      'zeta.txt',
    ]);
    expect(useLocalPanelStore.getState().currentPath).toBe('/workspace');
    expect(useLocalPanelStore.getState().isLoading).toBe(false);
  });

  it('toggles sorting and keeps directories grouped first', () => {
    useLocalPanelStore.setState({
      entries: [
        entry({ name: 'b-dir', path: '/b-dir', isDirectory: true, modifiedAt: '2026-03-07T12:00:00.000Z' }),
        entry({ name: 'a-dir', path: '/a-dir', isDirectory: true, modifiedAt: '2026-03-07T11:00:00.000Z' }),
        entry({ name: 'large.txt', path: '/large.txt', size: 50 }),
        entry({ name: 'small.txt', path: '/small.txt', size: 10 }),
      ],
    });

    useLocalPanelStore.getState().setSort('size');
    expect(useLocalPanelStore.getState().entries.map((item: FileEntry) => item.name)).toEqual([
      'b-dir',
      'a-dir',
      'small.txt',
      'large.txt',
    ]);

    useLocalPanelStore.getState().setSort('size');
    expect(useLocalPanelStore.getState().entries.map((item: FileEntry) => item.name)).toEqual([
      'b-dir',
      'a-dir',
      'large.txt',
      'small.txt',
    ]);
  });

  it('supports single, multi, and range selection', () => {
    useLocalPanelStore.setState({
      entries: [
        entry({ name: 'a', path: '/a' }),
        entry({ name: 'b', path: '/b' }),
        entry({ name: 'c', path: '/c' }),
        entry({ name: 'd', path: '/d' }),
      ],
    });

    useLocalPanelStore.getState().selectFile('/b');
    expect(Array.from(useLocalPanelStore.getState().selectedFiles)).toEqual(['/b']);

    useLocalPanelStore.getState().selectFile('/d', true);
    expect(Array.from(useLocalPanelStore.getState().selectedFiles)).toEqual(['/b', '/d']);

    useLocalPanelStore.getState().selectFile('/c', false, true);
    expect(Array.from(useLocalPanelStore.getState().selectedFiles)).toEqual(['/c', '/d']);
  });

  it('navigates up for unix and windows-style paths', async () => {
    const navigateTo = vi.spyOn(useLocalPanelStore.getState(), 'navigateTo').mockResolvedValue();

    useLocalPanelStore.setState({ currentPath: '/home/q/aether' });
    await useLocalPanelStore.getState().navigateUp();
    expect(navigateTo).toHaveBeenCalledWith('/home/q');

    navigateTo.mockClear();
    useLocalPanelStore.setState({ currentPath: 'C:\\Users\\q\\aether' });
    await useLocalPanelStore.getState().navigateUp();
    expect(navigateTo).toHaveBeenCalledWith('C:/Users/q');
  });
});

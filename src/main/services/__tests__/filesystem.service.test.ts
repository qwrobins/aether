import { beforeEach, describe, expect, it, vi } from 'vitest';

const readdirMock = vi.fn();
const fsStatMock = vi.fn();
const accessMock = vi.fn();
const mkdirMock = vi.fn();
const rmMock = vi.fn();
const renameMock = vi.fn();
const execFileMock = vi.fn();
const openPathMock = vi.fn();
const homedirMock = vi.fn(() => '/home/tester');
const platformMock = vi.fn(() => 'linux');

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock,
  stat: fsStatMock,
  access: accessMock,
  mkdir: mkdirMock,
  rm: rmMock,
  rename: renameMock,
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => execFileMock),
}));

vi.mock('electron', () => ({
  shell: { openPath: openPathMock },
}));

vi.mock('node:os', () => ({
  homedir: homedirMock,
  platform: platformMock,
}));

describe('FilesystemService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMock.mockReturnValue('linux');
  });

  it('reads directories, sorts directories first, and falls back on stat errors', async () => {
    readdirMock.mockResolvedValue([
      { name: 'b.txt', isDirectory: () => false },
      { name: 'alpha', isDirectory: () => true },
      { name: 'broken', isDirectory: () => false },
    ]);
    fsStatMock
      .mockResolvedValueOnce({ size: 10, mtime: new Date('2026-03-07T10:00:00.000Z') })
      .mockResolvedValueOnce({ size: 0, mtime: new Date('2026-03-07T09:00:00.000Z') })
      .mockRejectedValueOnce(new Error('boom'));

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();
    const listing = await service.readDirectory('/workspace');

    expect(listing.parentPath).toBe('/');
    expect(listing.entries.map((entry) => entry.name)).toEqual(['alpha', 'b.txt', 'broken']);
    expect(listing.entries[2]).toEqual(expect.objectContaining({ name: 'broken', size: 0, isDirectory: false }));
  });

  it('lists files recursively with nested relative paths', async () => {
    readdirMock
      .mockResolvedValueOnce([
        { name: 'folder', isDirectory: () => true },
        { name: 'top.txt', isDirectory: () => false },
      ])
      .mockResolvedValueOnce([
        { name: 'nested.txt', isDirectory: () => false },
      ]);

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();
    const files = await service.listFilesRecursive('/workspace');

    expect(files).toEqual([
      { path: '/workspace/folder/nested.txt', relativePath: 'folder/nested.txt' },
      { path: '/workspace/top.txt', relativePath: 'top.txt' },
    ]);
  });

  it('lists linux drives while skipping inaccessible system partitions', async () => {
    execFileMock.mockResolvedValue({
      stdout: JSON.stringify({
        blockdevices: [
          {
            name: '/dev/sda',
            rm: false,
            hotplug: false,
            type: 'disk',
            children: [
              { name: '/dev/sda1', mountpoint: '/', fstype: 'ext4', size: '100G', rm: false, hotplug: false, type: 'part', label: 'root' },
              { name: '/dev/sda2', mountpoint: '/mnt/data', fstype: 'ext4', size: '200G', rm: false, hotplug: false, type: 'part', label: 'Data' },
            ],
          },
          {
            name: '/dev/sdb',
            rm: true,
            hotplug: true,
            type: 'disk',
            children: [
              { name: '/dev/sdb1', mountpoint: null, fstype: 'exfat', size: '32G', rm: true, hotplug: true, type: 'part', label: 'USB' },
            ],
          },
        ],
      }),
    });
    accessMock.mockResolvedValue(undefined);

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();
    const drives = await service.listDrives();

    expect(drives).toEqual([
      { name: 'Root', path: '/', isRemovable: false, isMounted: true },
      expect.objectContaining({ name: 'Data', path: '/mnt/data', isMounted: true, isRemovable: false }),
      expect.objectContaining({ name: 'USB', path: '', devicePath: '/dev/sdb1', isMounted: false, isRemovable: true }),
    ]);
  });

  it('parses mount output and opens paths in the explorer', async () => {
    execFileMock.mockResolvedValue({ stdout: 'Mounted /dev/sdc1 at /run/media/tester/Backup.\n' });

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();

    await expect(service.mountDrive('/dev/sdc1')).resolves.toBe('/run/media/tester/Backup');

    service.openInExplorer('/tmp/file.txt');
    expect(openPathMock).toHaveBeenCalledWith('/tmp/file.txt');
  });
});

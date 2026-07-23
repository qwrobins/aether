import { beforeEach, describe, expect, it, vi } from 'vitest';

const readdirMock = vi.fn();
const fsStatMock = vi.fn();
const accessMock = vi.fn();
const mkdirMock = vi.fn();
const renameMock = vi.fn();
const execFileMock = vi.fn();
const trashItemMock = vi.fn();
const showItemInFolderMock = vi.fn();
const homedirMock = vi.fn(() => '/home/tester');
const platformMock = vi.fn(() => 'linux');

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock,
  stat: fsStatMock,
  access: accessMock,
  mkdir: mkdirMock,
  rename: renameMock,
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => execFileMock),
}));

vi.mock('electron', () => ({
  shell: { trashItem: trashItemMock, showItemInFolder: showItemInFolderMock },
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

  it('bounds concurrent stat calls for large directories', async () => {
    readdirMock.mockResolvedValue(
      Array.from({ length: 70 }, (_, index) => ({
        name: `file-${index}.txt`,
        isDirectory: () => false,
      })),
    );
    let activeCalls = 0;
    let maxActiveCalls = 0;
    fsStatMock.mockImplementation(async () => {
      activeCalls++;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeCalls--;
      return { size: 1, mtime: new Date('2026-03-07T10:00:00.000Z') };
    });

    const { FilesystemService } = await import('../filesystem.service');
    const listing = await new FilesystemService().readDirectory('/workspace');

    expect(listing.entries).toHaveLength(70);
    expect(maxActiveCalls).toBeLessThanOrEqual(32);
  });

  it('starts new stat calls as soon as a concurrency slot becomes available', async () => {
    readdirMock.mockResolvedValue(
      Array.from({ length: 33 }, (_, index) => ({
        name: `file-${index}.txt`,
        isDirectory: () => false,
      })),
    );
    let resolveSlowStat: ((value: { size: number; mtime: Date }) => void) | undefined;
    fsStatMock.mockImplementation((filePath: string) => {
      if (filePath.endsWith('/file-0.txt')) {
        return new Promise((resolve) => {
          resolveSlowStat = resolve;
        });
      }
      return Promise.resolve({ size: 1, mtime: new Date('2026-03-07T10:00:00.000Z') });
    });

    const { FilesystemService } = await import('../filesystem.service');
    const listingPromise = new FilesystemService().readDirectory('/workspace');

    await vi.waitFor(() => expect(fsStatMock).toHaveBeenCalledTimes(33));
    resolveSlowStat?.({ size: 1, mtime: new Date('2026-03-07T10:00:00.000Z') });

    await expect(listingPromise).resolves.toMatchObject({ path: '/workspace' });
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

  it('stops recursive walking when the safe file limit is exceeded', async () => {
    readdirMock.mockResolvedValue([
      { name: 'one.txt', isDirectory: () => false },
      { name: 'two.txt', isDirectory: () => false },
    ]);

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();
    const files: Array<{ path: string; relativePath: string }> = [];

    await expect(async () => {
      for await (const file of service.walkFilesRecursive('/workspace', { maxFiles: 1 })) {
        files.push(file);
      }
    }).rejects.toThrow('Directory expansion exceeded the safe limit of 1 files');

    expect(files).toEqual([{ path: '/workspace/one.txt', relativePath: 'one.txt' }]);
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

  it('mounts a known unmounted drive and reveals paths in the file manager', async () => {
    execFileMock.mockImplementation((command: string) => {
      if (command === 'lsblk') {
        return Promise.resolve({
          stdout: JSON.stringify({
            blockdevices: [
              {
                name: '/dev/sdc',
                rm: true,
                hotplug: true,
                type: 'disk',
                children: [
                  { name: '/dev/sdc1', mountpoint: null, fstype: 'ext4', size: '64G', rm: true, hotplug: true, type: 'part', label: 'Backup' },
                ],
              },
            ],
          }),
        });
      }
      return Promise.resolve({ stdout: 'Mounted /dev/sdc1 at /run/media/tester/Backup.\n' });
    });

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();

    await expect(service.mountDrive('/dev/sdc1')).resolves.toBe('/run/media/tester/Backup');
    expect(execFileMock).toHaveBeenCalledWith('udisksctl', ['mount', '-b', '/dev/sdc1']);

    service.openInExplorer('/tmp/file.txt');
    expect(showItemInFolderMock).toHaveBeenCalledWith('/tmp/file.txt');
  });

  it('rejects mounting devices that are malformed or not enumerated', async () => {
    execFileMock.mockResolvedValue({ stdout: JSON.stringify({ blockdevices: [] }) });

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();

    await expect(service.mountDrive('/tmp/not-a-device')).rejects.toThrow('Invalid device path');
    await expect(service.mountDrive('/dev/sdz9')).rejects.toThrow(
      'Refusing to mount /dev/sdz9: not a known mountable device',
    );
    expect(execFileMock).not.toHaveBeenCalledWith(
      'udisksctl',
      expect.anything(),
    );
  });

  it('moves paths to the trash instead of permanently deleting them', async () => {
    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();

    await service.remove(['/tmp/a.txt', '/tmp/dir/b.txt']);

    expect(trashItemMock).toHaveBeenCalledWith('/tmp/a.txt');
    expect(trashItemMock).toHaveBeenCalledWith('/tmp/dir/b.txt');
  });

  it('refuses to trash the filesystem root, the home directory, or shallow paths', async () => {
    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();

    await expect(service.remove(['/'])).rejects.toThrow(
      'Refusing to delete "/": path is too close to the filesystem root',
    );
    await expect(service.remove(['/etc'])).rejects.toThrow(
      'Refusing to delete "/etc": path is too close to the filesystem root',
    );
    await expect(service.remove(['/home/tester'])).rejects.toThrow(
      'Refusing to delete "/home/tester": cannot delete the home directory',
    );
    expect(trashItemMock).not.toHaveBeenCalled();
  });

  it('surfaces a descriptive error when trashing fails', async () => {
    trashItemMock.mockRejectedValueOnce(new Error('boom'));

    const { FilesystemService } = await import('../filesystem.service');
    const service = new FilesystemService();

    await expect(service.remove(['/tmp/a.txt'])).rejects.toThrow(
      'Failed to move "/tmp/a.txt" to the trash: boom',
    );
  });
});

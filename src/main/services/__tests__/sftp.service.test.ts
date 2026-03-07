import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SftpConnectionProfile } from '@shared/types/connection';

const readFile = vi.fn();
const mockClient = {
  connect: vi.fn(),
  end: vi.fn(),
  list: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  rmdir: vi.fn(),
  delete: vi.fn(),
  rename: vi.fn(),
};

const SftpClient = vi.fn(function SftpClientMock() {
  return mockClient;
});

vi.mock('ssh2-sftp-client', () => ({
  default: SftpClient,
}));

vi.mock('node:fs/promises', () => ({
  readFile,
}));

function profile(overrides: Partial<SftpConnectionProfile> = {}): SftpConnectionProfile {
  return {
    id: 'sftp-1',
    name: 'Server',
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

describe('SftpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects with password auth', async () => {
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();

    await service.connect('conn-1', profile());

    expect(mockClient.connect).toHaveBeenCalledWith({
      host: 'example.com',
      port: 22,
      username: 'deploy',
      password: 'secret',
    });
    expect(service.getClient('conn-1')).toBe(mockClient);
  });

  it('expands tilde key paths and passphrase for key auth', async () => {
    readFile.mockResolvedValue('PRIVATE KEY');

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();

    await service.connect('conn-1', profile({ authMethod: 'key', privateKeyPath: '~/.ssh/id_ed25519', passphrase: 'phrase' }));

    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('/.ssh/id_ed25519'), 'utf-8');
    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({ privateKey: 'PRIVATE KEY', passphrase: 'phrase' }),
    );
  });

  it('lists remote directories and filters dot entries', async () => {
    mockClient.list.mockResolvedValue([
      { name: '.', type: 'd' },
      { name: '..', type: 'd' },
      { name: 'docs', type: 'd', size: 0, modifyTime: 1, rights: { user: 'rwx', group: 'r-x', other: 'r-x' }, owner: 1000 },
      { name: 'a.txt', type: '-', size: 12, modifyTime: 2 },
    ]);

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());

    const listing = await service.list('conn-1', '/remote');

    expect(listing.parentPath).toBe('/');
    expect(listing.entries).toEqual([
      expect.objectContaining({ name: 'docs', path: '/remote/docs', isDirectory: true, permissions: 'rwxr-xr-x', owner: '1000' }),
      expect.objectContaining({ name: 'a.txt', path: '/remote/a.txt', isDirectory: false, size: 12 }),
    ]);
  });

  it('recursively lists only files with nested relative paths', async () => {
    mockClient.list
      .mockResolvedValueOnce([
        { name: '.', type: 'd' },
        { name: 'folder', type: 'd' },
        { name: 'top.txt', type: '-', size: 5 },
      ])
      .mockResolvedValueOnce([
        { name: 'nested.txt', type: '-', size: 9 },
      ]);

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());

    const files = await service.listFilesRecursive('conn-1', '/remote');

    expect(files).toEqual([
      { path: '/remote/folder/nested.txt', relativePath: 'folder/nested.txt', size: 9 },
      { path: '/remote/top.txt', relativePath: 'top.txt', size: 5 },
    ]);
  });

  it('deletes files and directories while swallowing individual errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockClient.stat
      .mockResolvedValueOnce({ isDirectory: true })
      .mockResolvedValueOnce({ isDirectory: false })
      .mockRejectedValueOnce(new Error('missing'));

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());

    await service.remove('conn-1', ['/remote/folder', '/remote/file.txt', '/remote/missing']);

    expect(mockClient.rmdir).toHaveBeenCalledWith('/remote/folder', true);
    expect(mockClient.delete).toHaveBeenCalledWith('/remote/file.txt');
    expect(consoleError).toHaveBeenCalledWith('Failed to delete /remote/missing:', expect.any(Error));
  });
});

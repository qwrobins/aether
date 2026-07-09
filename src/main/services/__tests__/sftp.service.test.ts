import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SftpConnectionProfile } from '@shared/types/connection';

const readFile = vi.fn();
let connectImplementation:
  | ((config: Record<string, unknown>) => Promise<void>)
  | undefined;

function createMockClient() {
  return {
    connect: vi.fn((config: Record<string, unknown>) => connectImplementation?.(config)),
    end: vi.fn(),
    list: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
    fastPut: vi.fn(),
    fastGet: vi.fn(),
    rmdir: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
  };
}

const mockClients: Array<ReturnType<typeof createMockClient>> = [];

const SftpClient = vi.fn(function SftpClientMock() {
  const client = createMockClient();
  mockClients.push(client);
  return client;
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
    vi.restoreAllMocks();
    mockClients.length = 0;
    connectImplementation = undefined;
  });

  it('connects with password auth', async () => {
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();

    await service.connect('conn-1', profile());

    expect(mockClients[0]?.connect).toHaveBeenCalledWith(expect.objectContaining({
      host: 'example.com',
      port: 22,
      username: 'deploy',
      password: 'secret',
      hostHash: 'sha256',
      hostVerifier: expect.any(Function),
    }));
    expect(service.getClient('conn-1')).toBe(mockClients[0]);
  });

  it('expands tilde key paths and passphrase for key auth', async () => {
    readFile.mockResolvedValue('PRIVATE KEY');

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();

    await service.connect('conn-1', profile({ authMethod: 'key', privateKeyPath: '~/.ssh/id_ed25519', passphrase: 'phrase' }));

    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('/.ssh/id_ed25519'), 'utf-8');
    expect(mockClients[0]?.connect).toHaveBeenCalledWith(
      expect.objectContaining({ privateKey: 'PRIVATE KEY', passphrase: 'phrase' }),
    );
  });

  it('lists remote directories and filters dot entries', async () => {
    const list = vi.fn().mockResolvedValue([
      { name: '.', type: 'd' },
      { name: '..', type: 'd' },
      { name: 'docs', type: 'd', size: 0, modifyTime: 1, rights: { user: 'rwx', group: 'r-x', other: 'r-x' }, owner: 1000 },
      { name: 'a.txt', type: '-', size: 12, modifyTime: 2 },
    ]);

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());
    mockClients[0].list = list;

    const listing = await service.list('conn-1', '/remote');

    expect(listing.parentPath).toBe('/');
    expect(listing.entries).toEqual([
      expect.objectContaining({ name: 'docs', path: '/remote/docs', isDirectory: true, permissions: 'rwxr-xr-x', owner: '1000' }),
      expect.objectContaining({ name: 'a.txt', path: '/remote/a.txt', isDirectory: false, size: 12 }),
    ]);
  });

  it('recursively lists only files with nested relative paths', async () => {
    const list = vi.fn()
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
    mockClients[0].list = list;

    const files = await service.listFilesRecursive('conn-1', '/remote');

    expect(files).toEqual([
      { path: '/remote/folder/nested.txt', relativePath: 'folder/nested.txt', size: 9 },
      { path: '/remote/top.txt', relativePath: 'top.txt', size: 5 },
    ]);
  });

  it('stops recursive walking when the safe file limit is exceeded', async () => {
    const list = vi.fn().mockResolvedValue([
      { name: 'one.txt', type: '-', size: 1 },
      { name: 'two.txt', type: '-', size: 2 },
    ]);

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());
    mockClients[0].list = list;
    const files: Array<{ path: string; relativePath: string; size: number }> = [];

    await expect(async () => {
      for await (const file of service.walkFilesRecursive('conn-1', '/remote', { maxFiles: 1 })) {
        files.push(file);
      }
    }).rejects.toThrow('Directory expansion exceeded the safe limit of 1 files');

    expect(files).toEqual([{ path: '/remote/one.txt', relativePath: 'one.txt', size: 1 }]);
  });

  it('reports all-success delete results for files and directories', async () => {
    const stat = vi.fn()
      .mockResolvedValueOnce({ isDirectory: true })
      .mockResolvedValueOnce({ isDirectory: false });

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());
    mockClients[0].stat = stat;

    const result = await service.remove('conn-1', ['/remote/folder', '/remote/file.txt']);

    expect(mockClients[0]?.rmdir).toHaveBeenCalledWith('/remote/folder', true);
    expect(mockClients[0]?.delete).toHaveBeenCalledWith('/remote/file.txt');
    expect(result).toEqual({
      deletedCount: 2,
      failedCount: 0,
      results: [
        { path: '/remote/folder', success: true },
        { path: '/remote/file.txt', success: true },
      ],
    });
  });

  it('reports partial delete failures without hiding successful deletes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stat = vi.fn()
      .mockResolvedValueOnce({ isDirectory: true })
      .mockResolvedValueOnce({ isDirectory: false })
      .mockRejectedValueOnce(new Error('missing'));

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());
    mockClients[0].stat = stat;

    const result = await service.remove('conn-1', ['/remote/folder', '/remote/file.txt', '/remote/missing']);

    expect(mockClients[0]?.rmdir).toHaveBeenCalledWith('/remote/folder', true);
    expect(mockClients[0]?.delete).toHaveBeenCalledWith('/remote/file.txt');
    expect(result).toEqual({
      deletedCount: 2,
      failedCount: 1,
      results: [
        { path: '/remote/folder', success: true },
        { path: '/remote/file.txt', success: true },
        { path: '/remote/missing', success: false, error: 'missing' },
      ],
    });
    expect(consoleError).toHaveBeenCalledWith('[Aether] Failed to delete /remote/missing:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('reports all-failure delete results', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());
    mockClients[0].stat = vi.fn()
      .mockRejectedValueOnce(new Error('missing one'))
      .mockRejectedValueOnce(new Error('missing two'));

    const result = await service.remove('conn-1', ['/remote/one', '/remote/two']);

    expect(result).toEqual({
      deletedCount: 0,
      failedCount: 2,
      results: [
        { path: '/remote/one', success: false, error: 'missing one' },
        { path: '/remote/two', success: false, error: 'missing two' },
      ],
    });
    expect(mockClients[0]?.rmdir).not.toHaveBeenCalled();
    expect(mockClients[0]?.delete).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('disconnects and removes the stored client', async () => {
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());

    await service.disconnect('conn-1');

    expect(mockClients[0]?.end).toHaveBeenCalled();
    expect(() => service.getClient('conn-1')).toThrow('Not connected');
  });

  it('rejects an untrusted host key before authentication', async () => {
    const keyHash = 'ab'.repeat(32);
    connectImplementation = async (config) => {
      const hostVerifier = config.hostVerifier as (hash: string) => boolean;
      expect(hostVerifier(keyHash)).toBe(false);
      throw new Error('Host denied');
    };
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();

    await expect(service.connect('conn-1', profile())).rejects.toEqual(
      expect.objectContaining({
        name: 'UntrustedSshHostKeyError',
        fingerprint: `SHA256:${Buffer.from(keyHash, 'hex').toString('base64').replace(/=+$/, '')}`,
      }),
    );
  });

  it('accepts only the configured host key fingerprint', async () => {
    const keyHash = 'cd'.repeat(32);
    const fingerprint = `SHA256:${Buffer.from(keyHash, 'hex').toString('base64').replace(/=+$/, '')}`;
    connectImplementation = async (config) => {
      const hostVerifier = config.hostVerifier as (hash: string) => boolean;
      expect(hostVerifier(keyHash)).toBe(true);
    };
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();

    await service.connect('conn-1', profile({ hostKeyFingerprint: fingerprint }));

    expect(service.getClient('conn-1')).toBe(mockClients[0]);
  });

  it('closes an existing client before reconnecting the same profile', async () => {
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());

    await service.connect('conn-1', profile());

    expect(mockClients[0]?.end).toHaveBeenCalledTimes(1);
    expect(service.getClient('conn-1')).toBe(mockClients[1]);
  });

  it('continues reconnecting when the old client fails to close', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());
    mockClients[0].end.mockRejectedValueOnce(new Error('close failed'));

    await service.connect('conn-1', profile());

    expect(service.getClient('conn-1')).toBe(mockClients[1]);
    expect(consoleWarn).toHaveBeenCalledWith(
      '[Aether] Failed to close SFTP connection conn-1:',
      expect.any(Error),
    );
  });

  it('creates dedicated transfer clients that can be aborted independently', async () => {
    const { SftpService } = await import('../sftp.service');
    const service = new SftpService();
    await service.connect('conn-1', profile());

    const transferClient = await service.createTransferClient('conn-1');
    await transferClient.abort?.();

    expect(SftpClient).toHaveBeenCalledTimes(2);
    expect(mockClients[1]?.end).toHaveBeenCalledTimes(1);
    expect(mockClients[0]?.end).not.toHaveBeenCalled();
    expect(service.getClient('conn-1')).toBe(mockClients[0]);
  });
});

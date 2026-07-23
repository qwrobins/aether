import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@shared/constants/channels';
import type { TransferItem, TransferRequest } from '@shared/types/transfer';

const transferItems = new Map<string, TransferItem>();
const enqueue = vi.fn(async (
  request: TransferRequest,
  _s3Client?: unknown,
  size?: number,
  batchId?: string,
) => {
  const id = `transfer-${enqueue.mock.calls.length}`;
  transferItems.set(id, {
    id,
    batchId,
    fileName: request.sourcePath.split('/').pop() ?? request.sourcePath,
    ...request,
    size: size ?? 0,
    bytesTransferred: 0,
    status: 'queued',
    speed: 0,
    retryCount: 0,
  });
  return id;
});

const getTransfer = vi.fn((id: string) => transferItems.get(id));
const setWindow = vi.fn();
const setSftpClientFactory = vi.fn();
const setRsyncClientFactory = vi.fn();
const cancel = vi.fn();
const clear = vi.fn();
const getTransfers = vi.fn(() => Array.from(transferItems.values()));

const stat = vi.fn();
const listFilesRecursive = vi.fn();
const listObjectKeysRecursive = vi.fn();
const getS3Client = vi.fn(() => ({ kind: 's3-client' }));
const getSftpClient = vi.fn(() => ({ kind: 'sftp-client', stat: vi.fn() }));
const listSftpFilesRecursive = vi.fn();
const getRsyncClient = vi.fn(() => ({ kind: 'rsync-client', stat: vi.fn() }));
const listRsyncFilesRecursive = vi.fn();
const listNetworkFilesystem = vi.fn();
const assertNetworkTransferPath = vi.fn();

async function* fromMockedList<T>(
  mock: (...args: unknown[]) => Promise<T[]>,
  ...args: unknown[]
): AsyncGenerator<T> {
  const items = await mock(...args);
  for (const item of items) {
    yield item;
  }
}

vi.mock('../../services/transfer.service', () => ({
  TransferService: class TransferService {
    setWindow = setWindow;
    setSftpClientFactory = setSftpClientFactory;
    setRsyncClientFactory = setRsyncClientFactory;
    enqueue = enqueue;
    getTransfer = getTransfer;
    cancel = cancel;
    clear = clear;
    getTransfers = getTransfers;
  },
}));

vi.mock('../../services/filesystem.service', () => ({
  FilesystemService: class FilesystemService {
    stat = stat;
    listFilesRecursive = listFilesRecursive;
    walkFilesRecursive = (dirPath: string) => fromMockedList(listFilesRecursive, dirPath);
  },
}));

vi.mock('../s3.handlers', () => ({
  s3Service: {
    getClient: getS3Client,
    listObjectKeysRecursive,
    walkObjectKeysRecursive: (connectionId: string, bucket: string, prefix: string) =>
      fromMockedList(listObjectKeysRecursive, connectionId, bucket, prefix),
  },
}));

vi.mock('../sftp.handlers', () => ({
  sftpService: {
    getClient: getSftpClient,
    createTransferClient: vi.fn(async () => ({ kind: 'transfer-sftp-client' })),
    listFilesRecursive: listSftpFilesRecursive,
    walkFilesRecursive: (connectionId: string, path: string) =>
      fromMockedList(listSftpFilesRecursive, connectionId, path),
  },
}));

vi.mock('../rsync.handlers', () => ({
  rsyncService: {
    getClient: getRsyncClient,
    createTransferClient: vi.fn(async () => ({ kind: 'transfer-rsync-client' })),
    listFilesRecursive: listRsyncFilesRecursive,
    walkFilesRecursive: (connectionId: string, path: string) =>
      fromMockedList(listRsyncFilesRecursive, connectionId, path),
  },
}));

vi.mock('../network-filesystem.handlers', () => ({
  networkFilesystemService: {
    list: listNetworkFilesystem,
    assertTransferPath: assertNetworkTransferPath,
  },
}));

function createRequest(overrides: Partial<TransferRequest> = {}): TransferRequest {
  return {
    sourcePath: '/tmp/source',
    destinationPath: '/target',
    direction: 'upload',
    connectionId: 'conn-1',
    connectionType: 's3',
    bucket: 'aether',
    ...overrides,
  };
}

function expectSharedBatch(result: unknown, expectedCount: number): void {
  expect(Array.isArray(result)).toBe(true);
  const items = result as TransferItem[];
  expect(items).toHaveLength(expectedCount);
  expect(items[0].batchId).toBeTypeOf('string');
  expect(items.every((item) => item.batchId === items[0].batchId)).toBe(true);
}

async function createIpcHandlerSetup() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipcMain = {
    handle: vi.fn((
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => handlers.set(channel, handler)),
  };
  const { registerTransferHandlers } = await import('../transfer.handlers');
  registerTransferHandlers(ipcMain as never, {} as never);
  return { handlers, ipcMain };
}

describe('registerTransferHandlers', () => {
  beforeEach(() => {
    transferItems.clear();
    enqueue.mockClear();
    getTransfer.mockClear();
    setWindow.mockClear();
    setSftpClientFactory.mockClear();
    setRsyncClientFactory.mockClear();
    cancel.mockClear();
    clear.mockClear();
    getTransfers.mockClear();
    stat.mockReset();
    listFilesRecursive.mockReset();
    listObjectKeysRecursive.mockReset();
    getS3Client.mockClear();
    getSftpClient.mockReset();
    getSftpClient.mockImplementation(() => ({ kind: 'sftp-client', stat: vi.fn() }));
    listSftpFilesRecursive.mockReset();
    getRsyncClient.mockReset();
    getRsyncClient.mockImplementation(() => ({ kind: 'rsync-client', stat: vi.fn() }));
    listRsyncFilesRecursive.mockReset();
    listNetworkFilesystem.mockReset();
    listNetworkFilesystem.mockResolvedValue({ entries: [] });
    assertNetworkTransferPath.mockReset();
    assertNetworkTransferPath.mockResolvedValue(undefined);
  });

  it('expands local directory uploads into per-file transfers', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    listFilesRecursive.mockResolvedValue([
      { path: '/tmp/source/a.txt', relativePath: 'a.txt' },
      { path: '/tmp/source/nested/b.txt', relativePath: 'nested/b.txt' },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ sourcePath: '/tmp/source', destinationPath: '/remote/base/' }));

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: '/tmp/source/a.txt',
      destinationPath: '/remote/base/a.txt',
    });
    expect(enqueue.mock.calls[1][0]).toMatchObject({
      sourcePath: '/tmp/source/nested/b.txt',
      destinationPath: '/remote/base/nested/b.txt',
    });
    expectSharedBatch(result, 2);
    expect((result as TransferItem[]).map((item) => item.id)).toEqual(['transfer-1', 'transfer-2']);
  });

  it('expands explicit S3 directory downloads into file transfers with preserved sizes', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/a.jpg', size: 12 },
      { key: 'photos/2026/nested/b.jpg', size: 30 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/2026',
      destinationPath: '/downloads/photos/',
      bucket: 'images',
      isDirectory: true,
    }));

    expect(listObjectKeysRecursive).toHaveBeenCalledWith('conn-1', 'images', 'photos/2026/');
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: 'photos/2026/a.jpg',
      destinationPath: '/downloads/photos/a.jpg',
    });
    expect(enqueue.mock.calls[0][2]).toBe(12);
    expect(enqueue.mock.calls[1][2]).toBe(30);
    expectSharedBatch(result, 2);
  });

  it('skips S3 directory marker entries during prefix downloads', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/', size: 0 },
      { key: 'photos/2026/a.jpg', size: 12 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/2026',
      destinationPath: '/downloads/photos/',
      bucket: 'images',
      isDirectory: true,
    }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: 'photos/2026/a.jpg',
      destinationPath: '/downloads/photos/a.jpg',
    });
  });

  it('queues a single S3 object download when explicitly marked as a file', async () => {
    listObjectKeysRecursive.mockResolvedValue([]);

    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/empty/',
      destinationPath: '/downloads/photos/empty',
      bucket: 'images',
      isDirectory: false,
    }));

    expect(result).toBe('transfer-1');
    expect(listObjectKeysRecursive).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: 'photos/empty/',
      destinationPath: '/downloads/photos/empty',
    });
  });

  it('falls back to folder-style S3 prefixes for legacy callers without isDirectory', async () => {
    listObjectKeysRecursive.mockResolvedValue([]);

    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/empty/',
      destinationPath: '/downloads/photos/',
      bucket: 'images',
    }));

    expect(result).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('allows safe remote names that start with two dots', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/..env/file.txt', size: 12 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/2026',
      destinationPath: '/downloads/photos/',
      bucket: 'images',
      isDirectory: true,
    }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: 'photos/2026/..env/file.txt',
      destinationPath: '/downloads/photos/..env/file.txt',
    });
  });

  it('preserves POSIX root destinations during S3 directory downloads', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/a.jpg', size: 12 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/2026',
      destinationPath: '/',
      bucket: 'images',
      isDirectory: true,
    }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      destinationPath: '/a.jpg',
    });
  });

  it('preserves Windows root destinations during S3 directory downloads', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/a.jpg', size: 12 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/2026',
      destinationPath: 'C:/',
      bucket: 'images',
      isDirectory: true,
    }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      destinationPath: 'C:\\a.jpg',
    });
  });

  it('rejects S3 directory downloads that escape the local destination', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/../secrets.txt', size: 12 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        direction: 'download',
        connectionType: 's3',
        sourcePath: 'photos/2026',
        destinationPath: '/downloads/photos/',
        bucket: 'images',
        isDirectory: true,
      })),
    ).rejects.toThrow('Directory download queueing failed: Remote path escapes the destination directory');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects absolute remote paths during S3 directory downloads', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026//tmp/secrets.txt', size: 12 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        direction: 'download',
        connectionType: 's3',
        sourcePath: 'photos/2026',
        destinationPath: '/downloads/photos/',
        bucket: 'images',
        isDirectory: true,
      })),
    ).rejects.toThrow('Directory download queueing failed: Remote path is absolute');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('expands SFTP directory downloads into nested destinations', async () => {
    const client = { kind: 'sftp-client', stat: vi.fn().mockResolvedValue({ isDirectory: true }) };
    getSftpClient.mockReturnValue(client);
    listSftpFilesRecursive.mockResolvedValue([
      { path: '/remote/root/file.txt', relativePath: 'file.txt', size: 4 },
      { path: '/remote/root/deep/asset.bin', relativePath: 'deep/asset.bin', size: 8 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 'sftp',
      sourcePath: '/remote/root',
      destinationPath: '/local/root/',
    }));

    expect(client.stat).toHaveBeenCalledWith('/remote/root');
    expect(listSftpFilesRecursive).toHaveBeenCalledWith('conn-1', '/remote/root');
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: '/remote/root/file.txt',
      destinationPath: '/local/root/file.txt',
    });
    expect(enqueue.mock.calls[1][0]).toMatchObject({
      sourcePath: '/remote/root/deep/asset.bin',
      destinationPath: '/local/root/deep/asset.bin',
    });
    expectSharedBatch(result, 2);
  });

  it('assigns one batch id to expanded rsync directory downloads', async () => {
    const client = { kind: 'rsync-client', stat: vi.fn().mockResolvedValue({ isDirectory: true }) };
    getRsyncClient.mockReturnValue(client);
    listRsyncFilesRecursive.mockResolvedValue([
      { path: '/remote/root/file.txt', relativePath: 'file.txt', size: 4 },
      { path: '/remote/root/deep/asset.bin', relativePath: 'deep/asset.bin', size: 8 },
    ]);
    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 'rsync',
      sourcePath: '/remote/root',
      destinationPath: '/local/root/',
      bucket: undefined,
    }));

    expectSharedBatch(result, 2);
  });

  it('assigns one batch id to expanded mounted filesystem downloads', async () => {
    stat
      .mockResolvedValueOnce({ isDirectory: true })
      .mockResolvedValueOnce({ isDirectory: false, size: 4 })
      .mockResolvedValueOnce({ isDirectory: false, size: 8 });
    listFilesRecursive.mockResolvedValue([
      { path: '/mnt/share/file.txt', relativePath: 'file.txt' },
      { path: '/mnt/share/deep/asset.bin', relativePath: 'deep/asset.bin' },
    ]);
    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 'smb',
      sourcePath: '/mnt/share',
      destinationPath: '/local/share/',
      bucket: undefined,
    }));

    expectSharedBatch(result, 2);
  });

  it('skips SFTP directory marker entries during directory downloads', async () => {
    const client = { kind: 'sftp-client', stat: vi.fn().mockResolvedValue({ isDirectory: true }) };
    getSftpClient.mockReturnValue(client);
    listSftpFilesRecursive.mockResolvedValue([
      { path: '/remote/root', relativePath: '   ', size: 0 },
      { path: '/remote/root/file.txt', relativePath: 'file.txt', size: 4 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 'sftp',
      sourcePath: '/remote/root',
      destinationPath: '/local/root/',
    }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: '/remote/root/file.txt',
      destinationPath: '/local/root/file.txt',
    });
  });

  it('rejects SFTP directory downloads with separator traversal', async () => {
    const client = { kind: 'sftp-client', stat: vi.fn().mockResolvedValue({ isDirectory: true }) };
    getSftpClient.mockReturnValue(client);
    listSftpFilesRecursive.mockResolvedValue([
      { path: '/remote/root/escape.txt', relativePath: 'deep\\..\\escape.txt', size: 4 },
    ]);

    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        direction: 'download',
        connectionType: 'sftp',
        sourcePath: '/remote/root',
        destinationPath: '/local/root/',
      })),
    ).rejects.toThrow('Directory download queueing failed: Remote path escapes the destination directory');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects single-file SFTP downloads with traversal in the remote name', async () => {
    const client = { kind: 'sftp-client', stat: vi.fn().mockResolvedValue({ isDirectory: false }) };
    getSftpClient.mockReturnValue(client);

    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        direction: 'download',
        connectionType: 'sftp',
        sourcePath: '/remote/../../.ssh/authorized_keys',
        destinationPath: '/home/user/Downloads/../../.ssh/authorized_keys',
        bucket: undefined,
        isDirectory: false,
      })),
    ).rejects.toThrow('Download destination escapes the local directory');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects single-file S3 downloads with traversal in the key name', async () => {
    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        direction: 'download',
        connectionType: 's3',
        sourcePath: 'photos/../../.ssh/authorized_keys',
        destinationPath: '/downloads/../../.ssh/authorized_keys',
        bucket: 'images',
        isDirectory: false,
      })),
    ).rejects.toThrow('Download destination escapes the local directory');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects single-file downloads whose destination name differs from the remote name', async () => {
    const client = { kind: 'sftp-client', stat: vi.fn().mockResolvedValue({ isDirectory: false }) };
    getSftpClient.mockReturnValue(client);

    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        direction: 'download',
        connectionType: 'sftp',
        sourcePath: '/remote/report.pdf',
        destinationPath: '/local/downloads/renamed.pdf',
        bucket: undefined,
        isDirectory: false,
      })),
    ).rejects.toThrow('Download destination file name does not match the remote file name');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues single-file SFTP downloads with a matching safe destination', async () => {
    const client = { kind: 'sftp-client', stat: vi.fn().mockResolvedValue({ isDirectory: false }) };
    getSftpClient.mockReturnValue(client);

    const { handlers } = await createIpcHandlerSetup();

    const result = await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 'sftp',
      sourcePath: '/remote/report.pdf',
      destinationPath: '/local/downloads/report.pdf',
      bucket: undefined,
      isDirectory: false,
    }));

    expect(result).toBe('transfer-1');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: '/remote/report.pdf',
      destinationPath: '/local/downloads/report.pdf',
    });
  });

  it('throws a clear IPC error and rolls back queued children when directory expansion enqueue fails', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    listFilesRecursive.mockResolvedValue([
      { path: '/tmp/source/a.txt', relativePath: 'a.txt' },
      { path: '/tmp/source/b.txt', relativePath: 'b.txt' },
    ]);
    enqueue
      .mockImplementationOnce(async (request: TransferRequest) => {
        const id = 'transfer-1';
        transferItems.set(id, {
          id,
          fileName: request.sourcePath.split('/').pop() ?? request.sourcePath,
          ...request,
          size: 0,
          bytesTransferred: 0,
          status: 'queued',
          speed: 0,
          retryCount: 0,
        });
        return id;
      })
      .mockRejectedValueOnce(new Error('SFTP client is not connected'));

    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ sourcePath: '/tmp/source', destinationPath: '/remote/base/' })),
    ).rejects.toThrow('Directory upload queueing failed: SFTP client is not connected');

    expect(cancel).toHaveBeenCalledWith('transfer-1');
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('validates transfer requests before queueing work', async () => {
    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ connectionId: '' as never })),
    ).rejects.toThrow('Connection ID is required');
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ sourcePath: '' as never })),
    ).rejects.toThrow('Source path is required');
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ destinationPath: '   ' })),
    ).rejects.toThrow('Destination path is required');
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ direction: 'sync' as never })),
    ).rejects.toThrow('Transfer direction must be upload or download');
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ connectionType: 'ftp' as never })),
    ).rejects.toThrow('Connection type must be s3, sftp, or taildrop');
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ isDirectory: 'yes' as never })),
    ).rejects.toThrow('isDirectory must be a boolean when provided');
    expect(enqueue).not.toHaveBeenCalled();

    getS3Client.mockImplementationOnce(() => {
      throw new Error('Not connected');
    });
    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ connectionType: 's3' })),
    ).rejects.toThrow('Connection not found');
    expect(enqueue).not.toHaveBeenCalled();

    getSftpClient.mockImplementationOnce(() => {
      throw new Error('Not connected');
    });
    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ connectionType: 'sftp' })),
    ).rejects.toThrow('Connection not found');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues Taildrop uploads and rejects unsupported Taildrop requests', async () => {
    stat.mockResolvedValue({ isDirectory: false });
    const { handlers } = await createIpcHandlerSetup();

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        connectionId: 'taildrop',
        connectionType: 'taildrop',
        direction: 'upload',
        destinationPath: 'ec2-dev',
        bucket: undefined,
        isDirectory: false,
      })),
    ).resolves.toBe('transfer-1');
    expect(enqueue).toHaveBeenCalledTimes(1);

    enqueue.mockClear();
    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        connectionId: 'taildrop',
        connectionType: 'taildrop',
        direction: 'download',
        destinationPath: 'ec2-dev',
        bucket: undefined,
      })),
    ).rejects.toThrow('Taildrop only supports sending local files');
    expect(enqueue).not.toHaveBeenCalled();

    stat.mockResolvedValueOnce({ isDirectory: true });
    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
        connectionId: 'taildrop',
        connectionType: 'taildrop',
        direction: 'upload',
        sourcePath: '/tmp/my-directory',
        destinationPath: 'ec2-dev',
        bucket: undefined,
        isDirectory: false,
      })),
    ).rejects.toThrow('Taildrop directory sends are not supported yet');
    expect(enqueue).not.toHaveBeenCalled();
    expect(stat).toHaveBeenCalledWith('/tmp/my-directory');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@shared/constants/channels';
import type { TransferItem, TransferRequest } from '@shared/types/transfer';

const transferItems = new Map<string, TransferItem>();
const enqueue = vi.fn(async (request: TransferRequest, _s3Client?: unknown, _sftpClient?: unknown, size?: number) => {
  const id = `transfer-${enqueue.mock.calls.length}`;
  transferItems.set(id, {
    id,
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
const cancel = vi.fn();
const clear = vi.fn();
const getTransfers = vi.fn(() => Array.from(transferItems.values()));

const stat = vi.fn();
const listFilesRecursive = vi.fn();
const listObjectKeysRecursive = vi.fn();
const getS3Client = vi.fn(() => ({ kind: 's3-client' }));
const getSftpClient = vi.fn(() => ({ kind: 'sftp-client', stat: vi.fn() }));
const listSftpFilesRecursive = vi.fn();

vi.mock('../../services/transfer.service', () => ({
  TransferService: class TransferService {
    setWindow = setWindow;
    setSftpClientFactory = setSftpClientFactory;
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
  },
}));

vi.mock('../s3.handlers', () => ({
  s3Service: {
    getClient: getS3Client,
    listObjectKeysRecursive,
  },
}));

vi.mock('../sftp.handlers', () => ({
  sftpService: {
    getClient: getSftpClient,
    createTransferClient: vi.fn(async () => ({ kind: 'transfer-sftp-client' })),
    listFilesRecursive: listSftpFilesRecursive,
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

describe('registerTransferHandlers', () => {
  beforeEach(() => {
    transferItems.clear();
    enqueue.mockClear();
    getTransfer.mockClear();
    setWindow.mockClear();
    setSftpClientFactory.mockClear();
    cancel.mockClear();
    clear.mockClear();
    getTransfers.mockClear();
    stat.mockReset();
    listFilesRecursive.mockReset();
    listObjectKeysRecursive.mockReset();
    getS3Client.mockClear();
    getSftpClient.mockClear();
    listSftpFilesRecursive.mockReset();
  });

  it('expands local directory uploads into per-file transfers', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    listFilesRecursive.mockResolvedValue([
      { path: '/tmp/source/a.txt', relativePath: 'a.txt' },
      { path: '/tmp/source/nested/b.txt', relativePath: 'nested/b.txt' },
    ]);

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler)) };
    const { registerTransferHandlers } = await import('../transfer.handlers');
    registerTransferHandlers(ipcMain as never, {} as never);

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
    expect(Array.isArray(result)).toBe(true);
    expect((result as TransferItem[]).map((item) => item.id)).toEqual(['transfer-1', 'transfer-2']);
  });

  it('expands S3 prefix downloads into file transfers with preserved sizes', async () => {
    listObjectKeysRecursive.mockResolvedValue([
      { key: 'photos/2026/a.jpg', size: 12 },
      { key: 'photos/2026/nested/b.jpg', size: 30 },
    ]);

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler)) };
    const { registerTransferHandlers } = await import('../transfer.handlers');
    registerTransferHandlers(ipcMain as never, {} as never);

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
      direction: 'download',
      connectionType: 's3',
      sourcePath: 'photos/2026',
      destinationPath: '/downloads/photos/',
      bucket: 'images',
    }));

    expect(listObjectKeysRecursive).toHaveBeenCalledWith('conn-1', 'images', 'photos/2026/');
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      sourcePath: 'photos/2026/a.jpg',
      destinationPath: '/downloads/photos/a.jpg',
    });
    expect(enqueue.mock.calls[0][2]).toBe(12);
    expect(enqueue.mock.calls[1][2]).toBe(30);
  });

  it('expands SFTP directory downloads into nested destinations', async () => {
    const client = { stat: vi.fn().mockResolvedValue({ isDirectory: true }) };
    getSftpClient.mockReturnValue(client);
    listSftpFilesRecursive.mockResolvedValue([
      { path: '/remote/root/file.txt', relativePath: 'file.txt', size: 4 },
      { path: '/remote/root/deep/asset.bin', relativePath: 'deep/asset.bin', size: 8 },
    ]);

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler)) };
    const { registerTransferHandlers } = await import('../transfer.handlers');
    registerTransferHandlers(ipcMain as never, {} as never);

    await handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({
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

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler)) };
    const { registerTransferHandlers } = await import('../transfer.handlers');
    registerTransferHandlers(ipcMain as never, {} as never);

    await expect(
      handlers.get(IpcChannels.TRANSFER_START)?.({}, createRequest({ sourcePath: '/tmp/source', destinationPath: '/remote/base/' })),
    ).rejects.toThrow('Directory upload queueing failed: SFTP client is not connected');

    expect(cancel).toHaveBeenCalledWith('transfer-1');
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});

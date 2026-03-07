import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransferItem, TransferRequest } from '@shared/types/transfer';

const statMock = vi.fn();
const mkdirMock = vi.fn();
const createReadStreamMock = vi.fn();
const createWriteStreamMock = vi.fn();
const uploadDoneMock = vi.fn();
const uploadOnMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  stat: statMock,
  mkdir: mkdirMock,
}));

vi.mock('node:fs', () => ({
  createReadStream: createReadStreamMock,
  createWriteStream: createWriteStreamMock,
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(() => ({
    on: uploadOnMock,
    done: uploadDoneMock,
  })),
}));

type TransferServiceInternals = {
  emitProgress: (id: string, bytes: number, total: number, speed: number) => void;
  transfers: Map<string, TransferItem>;
  abortControllers: Map<string, AbortController>;
  executeS3Transfer: (
    item: TransferItem,
    client: { send: ReturnType<typeof vi.fn> },
    signal?: AbortSignal,
    startTime?: number,
  ) => Promise<void>;
  executeSftpTransfer: (
    item: TransferItem,
    client: {
      mkdir: ReturnType<typeof vi.fn>;
      fastPut: ReturnType<typeof vi.fn>;
      stat: ReturnType<typeof vi.fn>;
      fastGet: ReturnType<typeof vi.fn>;
    },
    signal?: AbortSignal,
    startTime?: number,
  ) => Promise<void>;
};

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
}));

function createRequest(overrides: Partial<TransferRequest> = {}): TransferRequest {
  return {
    sourcePath: '/tmp/demo.txt',
    destinationPath: 'uploads/demo.txt',
    direction: 'upload',
    connectionId: 'conn-1',
    connectionType: 's3',
    bucket: 'aether',
    ...overrides,
  };
}

async function flushQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('TransferService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    statMock.mockReset();
    mkdirMock.mockReset();
    createReadStreamMock.mockReset();
    createWriteStreamMock.mockReset();
    uploadDoneMock.mockReset();
    uploadOnMock.mockReset();
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: vi.fn(() => 'transfer-1') },
      configurable: true,
    });
  });

  it('enqueues a transfer and emits progress and completion events', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const internals = service as unknown as TransferServiceInternals;
    const send = vi.fn();
    service.setWindow({ webContents: { send } } as never);

    vi.spyOn(service as never, 'executeS3Transfer').mockImplementation(async (item: TransferItem) => {
      item.size = 10;
      item.bytesTransferred = 10;
      item.speed = 5;
      internals.emitProgress(item.id, 10, 10, 5);
    });

    const id = await service.enqueue(createRequest(), {} as never);
    await flushQueue();

    expect(id).toBe('transfer-1');
    expect(service.getTransfer(id)).toMatchObject({
      status: 'completed',
      bytesTransferred: 10,
      size: 10,
    });
    expect(send).toHaveBeenCalledWith('transfer:progress', expect.objectContaining({ transferId: id }));
    expect(send).toHaveBeenCalledWith(
      'transfer:complete',
      expect.objectContaining({ transferId: id, success: true }),
    );
  });

  it('retries failed transfers and eventually completes', async () => {
    vi.useFakeTimers();

    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const send = vi.fn();
    service.setWindow({ webContents: { send } } as never);

    vi.spyOn(service as never, 'executeS3Transfer')
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(async (item: TransferItem) => {
        item.size = 25;
        item.bytesTransferred = 25;
      });

    const id = await service.enqueue(createRequest(), {} as never);
    await flushQueue();

    const queued = service.getTransfer(id);
    expect(queued).toMatchObject({ status: 'queued', retryCount: 1, bytesTransferred: 0, error: 'boom' });
    expect(send).toHaveBeenCalledWith(
      'transfer:error',
      expect.objectContaining({ transferId: id, error: 'boom' }),
    );

    await vi.advanceTimersByTimeAsync(2000);
    await flushQueue();

    expect(service.getTransfer(id)).toMatchObject({ status: 'completed', retryCount: 1, size: 25 });
  });

  it('does not retry deterministic setup failures', async () => {
    vi.useFakeTimers();

    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const send = vi.fn();
    service.setWindow({ webContents: { send } } as never);

    const id = await service.enqueue(createRequest({ bucket: undefined }), undefined);
    await flushQueue();
    await vi.runOnlyPendingTimersAsync();

    expect(service.getTransfer(id)).toMatchObject({
      status: 'failed',
      retryCount: 0,
      error: 'S3 client is not connected',
    });
    expect(send).toHaveBeenCalledWith(
      'transfer:error',
      expect.objectContaining({ transferId: id, error: 'S3 client is not connected' }),
    );
  });

  it('does not retry missing S3 buckets', async () => {
    vi.useFakeTimers();

    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const send = vi.fn();
    service.setWindow({ webContents: { send } } as never);
    statMock.mockResolvedValue({ size: 10 });
    createReadStreamMock.mockReturnValue({});

    const id = await service.enqueue(createRequest({ bucket: undefined }), {} as never);
    await flushQueue();
    await vi.runOnlyPendingTimersAsync();

    expect(service.getTransfer(id)).toMatchObject({
      status: 'failed',
      retryCount: 0,
      error: 'Bucket is required for S3 transfers',
    });
    expect(send).toHaveBeenCalledWith(
      'transfer:error',
      expect.objectContaining({ transferId: id, error: 'Bucket is required for S3 transfers' }),
    );
  });

  it('cancels active transfers and emits a cancelled completion result', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const send = vi.fn();
    service.setWindow({ webContents: { send } } as never);

    vi.spyOn(service as never, 'executeS3Transfer').mockImplementation(
      async (_item: TransferItem, _client: unknown, signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        }),
    );

    const id = await service.enqueue(createRequest(), {} as never);
    await flushQueue();

    service.cancel(id);
    await flushQueue();

    expect(service.getTransfer(id)?.status).toBe('cancelled');
    expect(send).toHaveBeenCalledWith(
      'transfer:complete',
      expect.objectContaining({ transferId: id, success: false, error: 'Cancelled' }),
    );
  });

  it('clears only terminal transfers', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const internals = service as unknown as TransferServiceInternals;

    internals.transfers = new Map<string, TransferItem>([
      ['queued', { ...createRequest(), id: 'queued', fileName: 'queued', size: 1, bytesTransferred: 0, status: 'queued', speed: 0, retryCount: 0 }],
      ['done', { ...createRequest(), id: 'done', fileName: 'done', size: 1, bytesTransferred: 1, status: 'completed', speed: 0, retryCount: 0 }],
      ['failed', { ...createRequest(), id: 'failed', fileName: 'failed', size: 1, bytesTransferred: 0, status: 'failed', speed: 0, retryCount: 0 }],
    ]);
    internals.abortControllers = new Map([
      ['queued', new AbortController()],
      ['done', new AbortController()],
      ['failed', new AbortController()],
    ]);

    service.clear();

    expect(service.getTransfers().map((item) => item.id)).toEqual(['queued']);
  });

  it('downloads from S3 and creates the destination directory', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const internals = service as unknown as TransferServiceInternals;
    const send = vi.fn();
    const write = vi.fn();
    const end = vi.fn();
    const on = vi.fn((event: string, callback: () => void) => {
      if (event === 'finish') callback();
    });
    createWriteStreamMock.mockReturnValue({ write, end, on });

    service.setWindow({ webContents: { send } } as never);

    const body = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('abc');
        yield Buffer.from('de');
      },
    };

    const item: TransferItem = {
      id: 'download-1',
      fileName: 'file.txt',
      sourcePath: 'folder/file.txt',
      destinationPath: '/tmp/nested/file.txt',
      direction: 'download',
      connectionId: 'conn-1',
      connectionType: 's3',
      bucket: 'bucket',
      size: 0,
      bytesTransferred: 0,
      status: 'active',
      speed: 0,
      retryCount: 0,
    };

    await internals.executeS3Transfer(item, { send: vi.fn().mockResolvedValue({ ContentLength: 5, Body: body }) });

    expect(mkdirMock).toHaveBeenCalledWith('/tmp/nested', { recursive: true });
    expect(write).toHaveBeenCalledTimes(2);
    expect(item.bytesTransferred).toBe(5);
    expect(send).toHaveBeenCalledWith('transfer:progress', expect.objectContaining({ transferId: 'download-1', totalBytes: 5 }));
  });

  it('throws a clear error when an S3 download has no body stream', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const internals = service as unknown as TransferServiceInternals;

    const item: TransferItem = {
      id: 'download-empty',
      fileName: 'empty.txt',
      sourcePath: 'folder/empty.txt',
      destinationPath: '/tmp/empty.txt',
      direction: 'download',
      connectionId: 'conn-1',
      connectionType: 's3',
      bucket: 'bucket',
      size: 0,
      bytesTransferred: 0,
      status: 'active',
      speed: 0,
      retryCount: 0,
    };

    await expect(
      internals.executeS3Transfer(item, { send: vi.fn().mockResolvedValue({ ContentLength: 0, Body: undefined }) }),
    ).rejects.toThrow('S3 response body is empty');
  });

  it('uploads via SFTP and ignores mkdir failures for existing directories', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const internals = service as unknown as TransferServiceInternals;
    const send = vi.fn();
    service.setWindow({ webContents: { send } } as never);
    statMock.mockResolvedValue({ size: 20 });

    const client = {
      mkdir: vi.fn().mockRejectedValue(new Error('exists')),
      fastPut: vi.fn(async (_source: string, _dest: string, options: { step: (a: number, b: number, c: number) => void }) => {
        options.step(20, 20, 20);
      }),
      stat: vi.fn(),
      fastGet: vi.fn(),
    };

    const item: TransferItem = {
      id: 'sftp-upload',
      fileName: 'upload.bin',
      sourcePath: '/tmp/upload.bin',
      destinationPath: '/remote/deep/upload.bin',
      direction: 'upload',
      connectionId: 'conn-1',
      connectionType: 'sftp',
      size: 0,
      bytesTransferred: 0,
      status: 'active',
      speed: 0,
      retryCount: 0,
    };

    await internals.executeSftpTransfer(item, client);

    expect(client.mkdir).toHaveBeenCalledWith('/remote/deep', true);
    expect(client.fastPut).toHaveBeenCalledWith('/tmp/upload.bin', '/remote/deep/upload.bin', expect.any(Object));
    expect(item.bytesTransferred).toBe(20);
    expect(send).toHaveBeenCalledWith('transfer:progress', expect.objectContaining({ transferId: 'sftp-upload', totalBytes: 20 }));
  });

  it('downloads via SFTP and creates local directories first', async () => {
    const { TransferService } = await import('../transfer.service');
    const service = new TransferService(1);
    const internals = service as unknown as TransferServiceInternals;

    const client = {
      mkdir: vi.fn(),
      fastPut: vi.fn(),
      stat: vi.fn().mockResolvedValue({ size: 42 }),
      fastGet: vi.fn(async (_source: string, _dest: string, options: { step: (a: number, b: number, c: number) => void }) => {
        options.step(42, 42, 42);
      }),
    };

    const item: TransferItem = {
      id: 'sftp-download',
      fileName: 'archive.tgz',
      sourcePath: '/remote/archive.tgz',
      destinationPath: '/tmp/downloads/archive.tgz',
      direction: 'download',
      connectionId: 'conn-1',
      connectionType: 'sftp',
      size: 0,
      bytesTransferred: 0,
      status: 'active',
      speed: 0,
      retryCount: 0,
    };

    await internals.executeSftpTransfer(item, client);

    expect(mkdirMock).toHaveBeenCalledWith('/tmp/downloads', { recursive: true });
    expect(client.stat).toHaveBeenCalledWith('/remote/archive.tgz');
    expect(client.fastGet).toHaveBeenCalledWith('/remote/archive.tgz', '/tmp/downloads/archive.tgz', expect.any(Object));
    expect(item.size).toBe(42);
    expect(item.bytesTransferred).toBe(42);
  });
});

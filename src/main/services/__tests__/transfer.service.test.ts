import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransferItem, TransferRequest } from '@shared/types/transfer';

type TransferServiceInternals = {
  emitProgress: (id: string, bytes: number, total: number, speed: number) => void;
  transfers: Map<string, TransferItem>;
  abortControllers: Map<string, AbortController>;
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
});

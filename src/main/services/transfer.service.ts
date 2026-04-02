import PQueue from 'p-queue';
import { BrowserWindow } from 'electron';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, mkdir, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Progress } from '@aws-sdk/lib-storage';
import type {
  TransferItem,
  TransferRequest,
  TransferProgress,
  TransferResult,
} from '@shared/types/transfer';
import { IpcChannels } from '@shared/constants/channels';

type SftpTransferClient = {
  mkdir: (path: string, recursive: boolean) => Promise<void>;
  fastPut: (
    sourcePath: string,
    destinationPath: string,
    options: { step: (totalTransferred: number, chunk: number, total: number) => void },
  ) => Promise<void>;
  stat: (path: string) => Promise<{ size: number }>;
  fastGet: (
    sourcePath: string,
    destinationPath: string,
    options: { step: (totalTransferred: number, chunk: number, total: number) => void },
  ) => Promise<void>;
  abort?: () => Promise<void>;
  disconnect?: () => Promise<void>;
};

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Transfer failed';
}

function getRequiredBucket(item: TransferItem): string {
  if (!item.bucket) {
    throw new NonRetryableError('Bucket is required for S3 transfers');
  }
  return item.bucket;
}

export class TransferService {
  private queue: PQueue;
  private transfers: Map<string, TransferItem> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private sftpClients: Map<string, SftpTransferClient> = new Map();
  private terminalTransfers: Set<string> = new Set();
  private window: BrowserWindow | null = null;

  constructor(concurrency = 3) {
    this.queue = new PQueue({ concurrency });
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  getTransfers(): TransferItem[] {
    return Array.from(this.transfers.values());
  }

  getTransfer(id: string): TransferItem | undefined {
    return this.transfers.get(id);
  }

  async enqueue(
    request: TransferRequest,
    s3Client?: S3Client,
    sftpClient?: SftpTransferClient,
    size?: number,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const item: TransferItem = {
      id,
      fileName: path.basename(request.sourcePath),
      ...request,
      tempPath:
        request.direction === 'download' ? `${request.destinationPath}.part` : undefined,
      size: size ?? 0,
      bytesTransferred: 0,
      status: 'queued',
      speed: 0,
      retryCount: 0,
    };
    this.transfers.set(id, item);

    const controller = new AbortController();
    this.abortControllers.set(id, controller);
    if (request.connectionType === 'sftp' && sftpClient) {
      this.sftpClients.set(id, sftpClient);
    }

    this.emitProgress(id, 0, 0, 0);

    this.queue
      .add(async () => {
        if (controller.signal.aborted) {
          await this.cancelTransfer(item);
          return;
        }
        await this.executeTransfer(item, s3Client, sftpClient, controller.signal);
      })
      .catch(() => {
        // Queue errors handled in executeTransfer
      });

    return id;
  }

  private async executeTransfer(
    item: TransferItem,
    s3Client?: S3Client,
    sftpClient?: SftpTransferClient,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      await this.cancelTransfer(item);
      return;
    }

    item.status = 'active';
    item.startedAt = new Date().toISOString();
    this.emitProgress(item.id, 0, item.size, 0);

    const startTime = Date.now();

    try {
      if (item.connectionType === 's3') {
        if (!s3Client) throw new NonRetryableError('S3 client is not connected');
        await this.executeS3Transfer(item, s3Client, signal, startTime);
      } else if (item.connectionType === 'sftp') {
        if (!sftpClient) throw new NonRetryableError('SFTP client is not connected');
        await this.executeSftpTransfer(item, sftpClient, signal, startTime);
      }

      if (signal?.aborted) {
        await this.cancelTransfer(item);
        return;
      }

      await this.completeTransfer(item);
    } catch (error: unknown) {
      if (signal?.aborted) {
        await this.cancelTransfer(item);
      } else {
        item.status = 'failed';
        item.error = getErrorMessage(error);
        this.emitError(item.id, item.error);

        if (!(error instanceof NonRetryableError) && item.retryCount < 3) {
          item.retryCount++;
          item.status = 'queued';
          item.bytesTransferred = 0;
          const delay = Math.pow(2, item.retryCount) * 1000;
          const retryTimer = setTimeout(() => {
            this.retryTimers.delete(item.id);
            if (signal?.aborted) {
              void this.cancelTransfer(item);
              return;
            }

            this.queue
              .add(async () => {
                await this.executeTransfer(item, s3Client, sftpClient, signal);
              })
              .catch(() => undefined);
          }, delay);
          this.retryTimers.set(item.id, retryTimer);
        } else {
          await this.failTransfer(item, item.error);
        }
      }
    }
  }

  private async executeS3Transfer(
    item: TransferItem,
    client: S3Client,
    signal?: AbortSignal,
    startTime?: number,
  ): Promise<void> {
    if (item.direction === 'upload') {
      const fileStat = await stat(item.sourcePath);
      item.size = fileStat.size;

      const fileStream = createReadStream(item.sourcePath);
      const uploadController = new AbortController();
      const upload = new Upload({
        client,
        params: {
          Bucket: getRequiredBucket(item),
          Key: item.destinationPath,
          Body: fileStream,
        },
        abortController: uploadController,
      });

      upload.on('httpUploadProgress', (progress: Progress) => {
        if (progress.loaded) {
          item.bytesTransferred = progress.loaded;
          const elapsed = (Date.now() - (startTime || Date.now())) / 1000;
          item.speed = elapsed > 0 ? item.bytesTransferred / elapsed : 0;
          this.emitProgress(item.id, item.bytesTransferred, item.size, item.speed);
        }
      });

      if (signal) {
        signal.addEventListener('abort', () => uploadController.abort(), { once: true });
      }

      await upload.done();
      if (signal?.aborted) throw new Error('Aborted');
    } else {
      const destDir = path.dirname(item.destinationPath);
      if (destDir && destDir !== '.' && destDir !== '/') {
        await mkdir(destDir, { recursive: true });
      }

      const response = await client.send(
        new GetObjectCommand({
          Bucket: getRequiredBucket(item),
          Key: item.sourcePath,
        }),
        { abortSignal: signal },
      );

      item.size = response.ContentLength || 0;
      const body = response.Body;
      if (!body) {
        throw new NonRetryableError('S3 response body is empty');
      }
      const writeStream = createWriteStream(this.getDownloadPath(item));
      const handleAbort = () => {
        writeStream.destroy(new Error('Aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true });
      }

      let downloaded = 0;
      try {
        for await (const chunk of body as AsyncIterable<Buffer>) {
          if (signal?.aborted) throw new Error('Aborted');
          writeStream.write(chunk);
          downloaded += chunk.length;
          item.bytesTransferred = downloaded;
          const elapsed = (Date.now() - (startTime || Date.now())) / 1000;
          item.speed = elapsed > 0 ? downloaded / elapsed : 0;
          this.emitProgress(item.id, downloaded, item.size, item.speed);
        }

        await new Promise<void>((resolve, reject) => {
          writeStream.end();
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
      } finally {
        signal?.removeEventListener('abort', handleAbort);
      }

      await this.finalizeDownload(item);
    }
  }

  private async executeSftpTransfer(
    item: TransferItem,
    client: SftpTransferClient,
    signal?: AbortSignal,
    startTime?: number,
  ): Promise<void> {
    if (item.direction === 'upload') {
      const fileStat = await stat(item.sourcePath);
      item.size = fileStat.size;

      // Ensure parent directory exists for nested paths
      const destDir = path.dirname(item.destinationPath);
      if (destDir && destDir !== '.' && destDir !== '/') {
        try {
          await client.mkdir(destDir, true);
        } catch {
          // Ignore - dir may already exist
        }
      }

      await client.fastPut(item.sourcePath, item.destinationPath, {
        step: (totalTransferred: number, _chunk: number, total: number) => {
          if (signal?.aborted) return;
          item.bytesTransferred = totalTransferred;
          item.size = total;
          const elapsed = (Date.now() - (startTime || Date.now())) / 1000;
          item.speed = elapsed > 0 ? totalTransferred / elapsed : 0;
          this.emitProgress(item.id, totalTransferred, total, item.speed);
        },
      });
      if (signal?.aborted) throw new Error('Aborted');
    } else {
      const destDir = path.dirname(item.destinationPath);
      if (destDir && destDir !== '.' && destDir !== '/') {
        await mkdir(destDir, { recursive: true });
      }

      const remoteStat = await client.stat(item.sourcePath);
      item.size = remoteStat.size;

      await client.fastGet(item.sourcePath, this.getDownloadPath(item), {
        step: (totalTransferred: number, _chunk: number, total: number) => {
          if (signal?.aborted) return;
          item.bytesTransferred = totalTransferred;
          item.size = total;
          const elapsed = (Date.now() - (startTime || Date.now())) / 1000;
          item.speed = elapsed > 0 ? totalTransferred / elapsed : 0;
          this.emitProgress(item.id, totalTransferred, total, item.speed);
        },
      });
      if (signal?.aborted) throw new Error('Aborted');
      await this.finalizeDownload(item);
    }
  }

  cancel(id: string): void {
    const retryTimer = this.retryTimers.get(id);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(id);
    }

    const controller = this.abortControllers.get(id);
    const item = this.transfers.get(id);
    if (!item || this.terminalTransfers.has(id)) {
      return;
    }

    controller?.abort();
    this.cancelTransfer(item).catch((error) => {
      console.error(`[Aether] Failed to cancel transfer ${id}:`, error);
    });
  }

  clear(): void {
    for (const [id, item] of this.transfers) {
      if (['completed', 'failed', 'cancelled'].includes(item.status)) {
        this.transfers.delete(id);
        void this.cleanupTransferResources(id);
        this.terminalTransfers.delete(id);
      }
    }
  }

  private async completeTransfer(item: TransferItem): Promise<void> {
    if (this.terminalTransfers.has(item.id)) {
      return;
    }

    item.status = 'completed';
    item.error = undefined;
    item.completedAt = new Date().toISOString();
    item.bytesTransferred = item.size;
    item.speed = 0;
    this.terminalTransfers.add(item.id);
    await this.cleanupTransferResources(item.id);
    this.emitComplete({
      transferId: item.id,
      status: 'completed',
      success: true,
    });
  }

  private async failTransfer(item: TransferItem, error: string): Promise<void> {
    if (this.terminalTransfers.has(item.id)) {
      return;
    }

    item.status = 'failed';
    item.error = error;
    item.completedAt = new Date().toISOString();
    item.speed = 0;
    this.terminalTransfers.add(item.id);
    await this.cleanupTransferResources(item.id);
    this.emitComplete({
      transferId: item.id,
      status: 'failed',
      success: false,
      error,
    });
  }

  private async cancelTransfer(item: TransferItem): Promise<void> {
    if (this.terminalTransfers.has(item.id)) {
      return;
    }

    item.status = 'cancelled';
    item.error = undefined;
    item.completedAt = new Date().toISOString();
    item.speed = 0;
    await this.closeSftpTransferClient(item.id, 'abort');
    await this.cleanupCancelledDownload(item);
    this.terminalTransfers.add(item.id);
    await this.cleanupTransferResources(item.id);
    this.emitComplete({
      transferId: item.id,
      status: 'cancelled',
      success: false,
    });
  }

  private async cleanupTransferResources(id: string): Promise<void> {
    const retryTimer = this.retryTimers.get(id);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(id);
    }

    this.abortControllers.delete(id);
    await this.closeSftpTransferClient(id, 'disconnect');
  }

  private async cleanupCancelledDownload(item: TransferItem): Promise<void> {
    if (item.direction !== 'download' || !item.tempPath) {
      return;
    }

    try {
      await unlink(item.tempPath);
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code !== 'ENOENT') {
        console.warn(`[Aether] Failed to remove partial download for ${item.id}:`, error);
      }
    } finally {
      item.tempPath = undefined;
    }
  }

  private getDownloadPath(item: TransferItem): string {
    return item.tempPath ?? item.destinationPath;
  }

  private async finalizeDownload(item: TransferItem): Promise<void> {
    if (item.direction !== 'download' || !item.tempPath) {
      return;
    }

    await rename(item.tempPath, item.destinationPath);
    item.tempPath = undefined;
  }

  private async closeSftpTransferClient(
    id: string,
    mode: 'abort' | 'disconnect',
  ): Promise<void> {
    const client = this.sftpClients.get(id);
    if (!client) {
      return;
    }

    this.sftpClients.delete(id);

    const close =
      mode === 'abort'
        ? client.abort ?? client.disconnect
        : client.disconnect ?? client.abort;

    if (!close) {
      return;
    }

    try {
      await close.call(client);
    } catch (error) {
      console.warn(`[Aether] Failed to ${mode} SFTP transfer ${id}:`, error);
    }
  }

  private emitProgress(
    id: string,
    bytes: number,
    total: number,
    speed: number,
  ): void {
    this.window?.webContents.send(IpcChannels.TRANSFER_PROGRESS, {
      transferId: id,
      bytesTransferred: bytes,
      totalBytes: total,
      speed,
    } as TransferProgress);
  }

  private emitComplete(result: TransferResult): void {
    this.window?.webContents.send(IpcChannels.TRANSFER_COMPLETE, result);
  }

  private emitError(id: string, error: string): void {
    this.window?.webContents.send(IpcChannels.TRANSFER_ERROR, {
      transferId: id,
      error,
    });
  }
}

import PQueue from 'p-queue';
import { BrowserWindow } from 'electron';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type {
  TransferItem,
  TransferRequest,
  TransferProgress,
  TransferResult,
} from '@shared/types/transfer';
import { IpcChannels } from '@shared/constants/channels';

export class TransferService {
  private queue: PQueue;
  private transfers: Map<string, TransferItem> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
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

  async enqueue(
    request: TransferRequest,
    s3Client?: S3Client,
    sftpClient?: any,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const item: TransferItem = {
      id,
      fileName: path.basename(request.sourcePath),
      ...request,
      size: 0,
      bytesTransferred: 0,
      status: 'queued',
      speed: 0,
      retryCount: 0,
    };
    this.transfers.set(id, item);

    const controller = new AbortController();
    this.abortControllers.set(id, controller);

    this.emitProgress(id, 0, 0, 0);

    this.queue
      .add(async () => {
        if (controller.signal.aborted) return;
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
    sftpClient?: any,
    signal?: AbortSignal,
  ): Promise<void> {
    item.status = 'active';
    item.startedAt = new Date().toISOString();
    this.emitProgress(item.id, 0, item.size, 0);

    const startTime = Date.now();

    try {
      if (item.connectionType === 's3') {
        await this.executeS3Transfer(item, s3Client!, signal, startTime);
      } else if (item.connectionType === 'sftp') {
        await this.executeSftpTransfer(item, sftpClient, signal, startTime);
      }

      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      item.bytesTransferred = item.size;
      this.emitComplete(item.id, true);
    } catch (error: any) {
      if (signal?.aborted) {
        item.status = 'cancelled';
        this.emitComplete(item.id, false, 'Cancelled');
      } else {
        item.status = 'failed';
        item.error = error.message || 'Transfer failed';
        this.emitError(item.id, item.error);

        if (item.retryCount < 3) {
          item.retryCount++;
          item.status = 'queued';
          item.bytesTransferred = 0;
          const delay = Math.pow(2, item.retryCount) * 1000;
          setTimeout(() => {
            this.queue
              .add(async () => {
                await this.executeTransfer(item, s3Client, sftpClient, signal);
              })
              .catch(() => {});
          }, delay);
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
          Bucket: item.bucket!,
          Key: item.destinationPath,
          Body: fileStream,
        },
        abortController: uploadController,
      });

      upload.on('httpUploadProgress', (progress) => {
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
    } else {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: item.bucket!,
          Key: item.sourcePath,
        }),
        { abortSignal: signal },
      );

      item.size = response.ContentLength || 0;
      const body = response.Body as NodeJS.ReadableStream;
      const writeStream = createWriteStream(item.destinationPath);

      let downloaded = 0;
      for await (const chunk of body as any) {
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
    }
  }

  private async executeSftpTransfer(
    item: TransferItem,
    client: any,
    signal?: AbortSignal,
    startTime?: number,
  ): Promise<void> {
    if (item.direction === 'upload') {
      const fileStat = await stat(item.sourcePath);
      item.size = fileStat.size;

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
    } else {
      const remoteStat = await client.stat(item.sourcePath);
      item.size = remoteStat.size;

      await client.fastGet(item.sourcePath, item.destinationPath, {
        step: (totalTransferred: number, _chunk: number, total: number) => {
          if (signal?.aborted) return;
          item.bytesTransferred = totalTransferred;
          item.size = total;
          const elapsed = (Date.now() - (startTime || Date.now())) / 1000;
          item.speed = elapsed > 0 ? totalTransferred / elapsed : 0;
          this.emitProgress(item.id, totalTransferred, total, item.speed);
        },
      });
    }
  }

  cancel(id: string): void {
    const controller = this.abortControllers.get(id);
    if (controller) controller.abort();
    const item = this.transfers.get(id);
    if (item && item.status !== 'completed') {
      item.status = 'cancelled';
    }
  }

  clear(): void {
    for (const [id, item] of this.transfers) {
      if (['completed', 'failed', 'cancelled'].includes(item.status)) {
        this.transfers.delete(id);
        this.abortControllers.delete(id);
      }
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

  private emitComplete(id: string, success: boolean, error?: string): void {
    this.window?.webContents.send(IpcChannels.TRANSFER_COMPLETE, {
      transferId: id,
      success,
      error,
    } as TransferResult);
  }

  private emitError(id: string, error: string): void {
    this.window?.webContents.send(IpcChannels.TRANSFER_ERROR, {
      transferId: id,
      error,
    });
  }
}

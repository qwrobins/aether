import { IpcMain, BrowserWindow } from 'electron';
import { TransferService } from '../services/transfer.service';
import { FilesystemService } from '../services/filesystem.service';
import { s3Service } from './s3.handlers';
import { sftpService } from './sftp.handlers';
import { IpcChannels } from '@shared/constants/channels';
import type { TransferRequest, TransferItem } from '@shared/types/transfer';

const transferService = new TransferService();
const fs = new FilesystemService();

export function getTransferService(): TransferService {
  return transferService;
}

export function registerTransferHandlers(
  ipcMain: IpcMain,
  mainWindow: BrowserWindow,
): void {
  transferService.setWindow(mainWindow);

  ipcMain.handle(
    IpcChannels.TRANSFER_START,
    async (_event, request: TransferRequest): Promise<string | TransferItem[]> => {
      let s3Client, sftpClient;

      if (request.connectionType === 's3') {
        s3Client = s3Service.getClient(request.connectionId);
      } else if (request.connectionType === 'sftp') {
        sftpClient = sftpService.getClient(request.connectionId);
      }

      // Directory expansion: recursively list files and queue each
      if (request.direction === 'upload') {
        try {
          const stat = await fs.stat(request.sourcePath);
          if (stat.isDirectory) {
            const files = await fs.listFilesRecursive(request.sourcePath);
            if (files.length === 0) return [];
            const items: TransferItem[] = [];
            const destBase = request.destinationPath.replace(/\/$/, '');
            for (const { path: filePath, relativePath } of files) {
              const subDest = `${destBase}/${relativePath}`;
              const subRequest: TransferRequest = { ...request, sourcePath: filePath, destinationPath: subDest };
              const id = await transferService.enqueue(subRequest, s3Client, sftpClient);
              const transfer = transferService.getTransfer(id);
              if (!transfer) {
                console.warn(`[Aether] Transfer ${id} not found after enqueue, skipping`);
                continue;
              }
              items.push(transfer);
            }
            console.log(`[Aether] Directory upload expanded to ${items.length} file(s)`);
            return items;
          }
        } catch (err) {
          console.error('[Aether] Directory expansion failed:', err);
        }
      } else if (request.direction === 'download') {
        try {
          if (request.connectionType === 's3' && request.bucket) {
            const prefix = request.sourcePath.endsWith('/') ? request.sourcePath : request.sourcePath + '/';
            const files = await s3Service.listObjectKeysRecursive(request.connectionId, request.bucket, prefix);
            if (files.length > 0) {
              const items: TransferItem[] = [];
              const destBase = request.destinationPath.replace(/\/$/, '');
              for (const { key, size } of files) {
                const relativePath = key.slice(prefix.length);
                const subDest = `${destBase}/${relativePath}`;
                const subRequest: TransferRequest = { ...request, sourcePath: key, destinationPath: subDest };
                const id = await transferService.enqueue(subRequest, s3Client, sftpClient, size);
                const transfer = transferService.getTransfer(id);
                if (!transfer) {
                  console.warn(`[Aether] Transfer ${id} not found after enqueue, skipping`);
                  continue;
                }
                items.push(transfer);
              }
              console.log(`[Aether] S3 directory download expanded to ${items.length} file(s)`);
              return items;
            }
          } else if (request.connectionType === 'sftp') {
            const client = sftpService.getClient(request.connectionId);
            const stat = await client.stat(request.sourcePath);
            if (stat.isDirectory) {
              const files = await sftpService.listFilesRecursive(request.connectionId, request.sourcePath);
              if (files.length === 0) return [];
              const items: TransferItem[] = [];
              const destBase = request.destinationPath.replace(/\/$/, '');
              for (const { path: remotePath, relativePath, size } of files) {
                const subDest = `${destBase}/${relativePath}`;
                const subRequest: TransferRequest = { ...request, sourcePath: remotePath, destinationPath: subDest };
                const id = await transferService.enqueue(subRequest, s3Client, sftpClient, size);
                const transfer = transferService.getTransfer(id);
                if (!transfer) {
                  console.warn(`[Aether] Transfer ${id} not found after enqueue, skipping`);
                  continue;
                }
                items.push(transfer);
              }
              console.log(`[Aether] SFTP directory download expanded to ${items.length} file(s)`);
              return items;
            }
          }
        } catch (err) {
          console.error('[Aether] Remote directory expansion failed:', err);
        }
      }

      // Single file
      const id = await transferService.enqueue(request, s3Client, sftpClient);
      console.log(`[Aether] Transfer queued: ${id}`);
      return id;
    },
  );

  ipcMain.handle(
    IpcChannels.TRANSFER_CANCEL,
    async (_event, transferId: string) => {
      transferService.cancel(transferId);
    },
  );

  ipcMain.handle(IpcChannels.TRANSFER_CLEAR, async () => {
    transferService.clear();
  });

  ipcMain.handle(IpcChannels.TRANSFER_LIST, async () => {
    return transferService.getTransfers();
  });
}

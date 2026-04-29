import { IpcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import { TransferService } from '../services/transfer.service';
import { FilesystemService } from '../services/filesystem.service';
import { s3Service } from './s3.handlers';
import { sftpService } from './sftp.handlers';
import { IpcChannels } from '@shared/constants/channels';
import type { TransferRequest, TransferItem } from '@shared/types/transfer';

const transferService = new TransferService();
const fs = new FilesystemService();
const WINDOWS_ROOT_PATTERN = /^[A-Za-z]:[\\/]?$/;

function isWindowsRootPath(filePath: string): boolean {
  return WINDOWS_ROOT_PATTERN.test(filePath);
}

function getDownloadDestinationBase(destinationPath: string): string {
  const trimmedPath = destinationPath.trim();
  if (trimmedPath === '/' || isWindowsRootPath(trimmedPath)) {
    return trimmedPath;
  }
  return trimmedPath.replace(/[\\/]+$/, '');
}

function assertSafeRemoteRelativePath(relativePath: string): void {
  if (relativePath.length === 0) {
    throw new Error('Remote path expansion produced an empty destination path');
  }

  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error(`Remote path is absolute and cannot be downloaded safely: ${relativePath}`);
  }

  const segments = relativePath.split(/[\\/]+/);
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`Remote path escapes the destination directory: ${relativePath}`);
  }
}

function safeJoinDownloadDestination(basePath: string, relativePath: string): string {
  assertSafeRemoteRelativePath(relativePath);

  const pathApi = isWindowsRootPath(basePath) ? path.win32 : path;
  const resolvedBase = pathApi.resolve(basePath);
  const resolvedDestination = pathApi.resolve(resolvedBase, ...relativePath.split(/[\\/]+/));
  const relativeToBase = pathApi.relative(resolvedBase, resolvedDestination);
  const normalizedRelativeSegments = pathApi.normalize(relativeToBase).split(pathApi.sep);

  if (
    relativeToBase === '' ||
    relativeToBase === '..' ||
    normalizedRelativeSegments[0] === '..' ||
    pathApi.isAbsolute(relativeToBase)
  ) {
    throw new Error(`Remote path escapes the destination directory: ${relativePath}`);
  }

  return resolvedDestination;
}

function validateTransferRequest(request: TransferRequest) {
  if (!request.connectionId || typeof request.connectionId !== 'string') {
    throw new Error('Connection ID is required');
  }

  if (typeof request.sourcePath !== 'string' || request.sourcePath.trim().length === 0) {
    throw new Error('Source path is required');
  }

  if (
    typeof request.destinationPath !== 'string' ||
    request.destinationPath.trim().length === 0
  ) {
    throw new Error('Destination path is required');
  }

  if (request.direction !== 'upload' && request.direction !== 'download') {
    throw new Error('Transfer direction must be upload or download');
  }

  if (request.connectionType !== 's3' && request.connectionType !== 'sftp') {
    throw new Error('Connection type must be s3 or sftp');
  }

  try {
    if (request.connectionType === 's3') {
      return { s3Client: s3Service.getClient(request.connectionId) };
    }

    sftpService.getClient(request.connectionId);
    return { s3Client: undefined };
  } catch {
    throw new Error('Connection not found');
  }
}

export function getTransferService(): TransferService {
  return transferService;
}

export function registerTransferHandlers(
  ipcMain: IpcMain,
  mainWindow: BrowserWindow,
): void {
  transferService.setWindow(mainWindow);
  transferService.setSftpClientFactory((connectionId: string) =>
    sftpService.createTransferClient(connectionId),
  );

  ipcMain.handle(
    IpcChannels.TRANSFER_START,
    async (_event, request: TransferRequest): Promise<string | TransferItem[]> => {
      const { s3Client } = validateTransferRequest(request);

      const enqueueTransfer = async (
        transferRequest: TransferRequest,
        size?: number,
      ): Promise<string> => transferService.enqueue(transferRequest, s3Client, size);

      const rollbackQueuedTransfers = (transferIds: string[]) => {
        for (const transferId of transferIds) {
          transferService.cancel(transferId);
        }
      };

      const formatQueueError = (scope: string, error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Error(`${scope} failed: ${message}`);
      };

      const enqueueTransferItem = async (
        transferRequest: TransferRequest,
        transferIds: string[],
        size?: number,
      ): Promise<TransferItem> => {
        const id = await enqueueTransfer(transferRequest, size);
        transferIds.push(id);
        const transfer = transferService.getTransfer(id);
        if (!transfer) {
          throw new Error(`Queued transfer ${id} was not registered`);
        }
        return transfer;
      };

      // Directory expansion: recursively list files and queue each
      if (request.direction === 'upload') {
        try {
          const stat = await fs.stat(request.sourcePath);
          if (stat.isDirectory) {
            const files = await fs.listFilesRecursive(request.sourcePath);
            if (files.length === 0) return [];
            const items: TransferItem[] = [];
            const transferIds: string[] = [];
            const destBase = request.destinationPath.replace(/\/$/, '');
            try {
              for (const { path: filePath, relativePath } of files) {
                const subDest = `${destBase}/${relativePath}`;
                const subRequest: TransferRequest = { ...request, sourcePath: filePath, destinationPath: subDest };
                const transfer = await enqueueTransferItem(subRequest, transferIds);
                items.push(transfer);
              }
            } catch (error) {
              rollbackQueuedTransfers(transferIds);
              throw error;
            }
            console.log(`[Aether] Directory upload expanded to ${items.length} file(s)`);
            return items;
          }
        } catch (err) {
          console.error('[Aether] Directory expansion failed:', err);
          throw formatQueueError('Directory upload queueing', err);
        }
      } else if (request.direction === 'download') {
        try {
          if (request.connectionType === 's3' && request.bucket) {
            const prefix = request.sourcePath.endsWith('/') ? request.sourcePath : request.sourcePath + '/';
            const files = await s3Service.listObjectKeysRecursive(request.connectionId, request.bucket, prefix);
            if (files.length > 0) {
              const items: TransferItem[] = [];
              const transferIds: string[] = [];
              const destBase = getDownloadDestinationBase(request.destinationPath);
              try {
                for (const { key, size } of files) {
                  const relativePath = key.slice(prefix.length);
                  if (relativePath.trim() === '') continue;
                  const subDest = safeJoinDownloadDestination(destBase, relativePath);
                  const subRequest: TransferRequest = { ...request, sourcePath: key, destinationPath: subDest };
                  const transfer = await enqueueTransferItem(subRequest, transferIds, size);
                  items.push(transfer);
                }
              } catch (error) {
                rollbackQueuedTransfers(transferIds);
                throw error;
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
              const transferIds: string[] = [];
              const destBase = getDownloadDestinationBase(request.destinationPath);
              try {
                for (const { path: remotePath, relativePath, size } of files) {
                  if (relativePath == null || relativePath.trim() === '') continue;
                  const subDest = safeJoinDownloadDestination(destBase, relativePath);
                  const subRequest: TransferRequest = { ...request, sourcePath: remotePath, destinationPath: subDest };
                  const transfer = await enqueueTransferItem(subRequest, transferIds, size);
                  items.push(transfer);
                }
              } catch (error) {
                rollbackQueuedTransfers(transferIds);
                throw error;
              }
              console.log(`[Aether] SFTP directory download expanded to ${items.length} file(s)`);
              return items;
            }
          }
        } catch (err) {
          console.error('[Aether] Remote directory expansion failed:', err);
          throw formatQueueError('Directory download queueing', err);
        }
      }

      // Single file
      const id = await enqueueTransfer(request);
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

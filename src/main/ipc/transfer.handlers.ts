import { IpcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import { TransferService } from '../services/transfer.service';
import { FilesystemService } from '../services/filesystem.service';
import { s3Service } from './s3.handlers';
import { sftpService } from './sftp.handlers';
import { rsyncService } from './rsync.handlers';
import { networkFilesystemService } from './network-filesystem.handlers';
import { IpcChannels } from '@shared/constants/channels';
import type { TransferRequest, TransferItem } from '@shared/types/transfer';

const transferService = new TransferService();
const fs = new FilesystemService();
const WINDOWS_ROOT_PATTERN = /^[A-Za-z]:[\\/]?$/;
const MAX_RECURSIVE_TRANSFER_FILES = 10000;
const MOUNTED_NETWORK_TYPES = new Set(['smb', 'nfs', 'webdav']);

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

function isDirectoryRequest(request: TransferRequest): boolean {
  return request.isDirectory ?? request.sourcePath.endsWith('/');
}

function normalizeS3Prefix(sourcePath: string): string {
  return sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`;
}

async function validateTransferRequest(request: TransferRequest) {
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

  if (
    request.connectionType !== 's3' &&
    request.connectionType !== 'sftp' &&
    request.connectionType !== 'rsync' &&
    request.connectionType !== 'taildrop' &&
    !MOUNTED_NETWORK_TYPES.has(request.connectionType)
  ) {
    throw new Error(
      'Connection type must be s3, sftp, or taildrop; rsync and mounted smb, nfs, and webdav shares are also supported',
    );
  }

  if (request.isDirectory !== undefined && typeof request.isDirectory !== 'boolean') {
    throw new Error('isDirectory must be a boolean when provided');
  }

  if (request.connectionType === 'taildrop') {
    if (request.direction !== 'upload') {
      throw new Error('Taildrop only supports sending local files');
    }
    const sourceStat = await fs.stat(request.sourcePath);
    if (sourceStat.isDirectory) {
      throw new Error('Taildrop directory sends are not supported yet');
    }
    return { s3Client: undefined };
  }

  try {
    if (request.connectionType === 's3') {
      return { s3Client: s3Service.getClient(request.connectionId) };
    }

    if (request.connectionType === 'sftp') {
      sftpService.getClient(request.connectionId);
    } else if (request.connectionType === 'rsync') {
      rsyncService.getClient(request.connectionId);
    } else if (MOUNTED_NETWORK_TYPES.has(request.connectionType)) {
      await networkFilesystemService.list(request.connectionId);
      const mountedPath = request.direction === 'upload'
        ? request.destinationPath
        : request.sourcePath;
      await networkFilesystemService.assertTransferPath(request.connectionId, mountedPath, {
        writable: request.direction === 'upload',
      });
    }
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
  transferService.setRsyncClientFactory((connectionId: string) =>
    rsyncService.createTransferClient(connectionId),
  );

  ipcMain.handle(
    IpcChannels.TRANSFER_START,
    async (_event, request: TransferRequest): Promise<string | TransferItem[]> => {
      const { s3Client } = await validateTransferRequest(request);

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
        if (request.connectionType === 'taildrop') {
          const sourceStat = await fs.stat(request.sourcePath);
          if (sourceStat.isDirectory) {
            throw new Error('Taildrop directory sends are not supported yet');
          }
          const id = await enqueueTransfer(request);
          console.log(`[Aether] Transfer queued: ${id}`);
          return id;
        }

        try {
          const stat = await fs.stat(request.sourcePath);
          if (stat.isDirectory) {
            const items: TransferItem[] = [];
            const transferIds: string[] = [];
            const destBase = request.destinationPath.replace(/\/$/, '');
            try {
              for await (const { path: filePath, relativePath } of fs.walkFilesRecursive(
                request.sourcePath,
                { maxFiles: MAX_RECURSIVE_TRANSFER_FILES },
              )) {
                const subDest = `${destBase}/${relativePath}`;
                const subRequest: TransferRequest = {
                  ...request,
                  sourcePath: filePath,
                  destinationPath: subDest,
                  isDirectory: false,
                };
                const transfer = await enqueueTransferItem(subRequest, transferIds);
                items.push(transfer);
              }
            } catch (error) {
              rollbackQueuedTransfers(transferIds);
              throw error;
            }
            if (items.length === 0) return [];
            console.log(`[Aether] Directory upload expanded to ${items.length} file(s)`);
            return items;
          }
        } catch (err) {
          console.error('[Aether] Directory expansion failed:', err);
          throw formatQueueError('Directory upload queueing', err);
        }
      } else if (request.direction === 'download') {
        try {
          if (request.connectionType === 's3' && request.bucket && isDirectoryRequest(request)) {
            const prefix = normalizeS3Prefix(request.sourcePath);
            const items: TransferItem[] = [];
            const transferIds: string[] = [];
            const destBase = getDownloadDestinationBase(request.destinationPath);
            try {
              for await (const { key, size } of s3Service.walkObjectKeysRecursive(
                request.connectionId,
                request.bucket,
                prefix,
                { maxFiles: MAX_RECURSIVE_TRANSFER_FILES },
              )) {
                const relativePath = key.slice(prefix.length);
                if (relativePath.trim() === '') continue;
                const subDest = safeJoinDownloadDestination(destBase, relativePath);
                const subRequest: TransferRequest = {
                  ...request,
                  sourcePath: key,
                  destinationPath: subDest,
                  isDirectory: false,
                };
                const transfer = await enqueueTransferItem(subRequest, transferIds, size);
                items.push(transfer);
              }
            } catch (error) {
              rollbackQueuedTransfers(transferIds);
              throw error;
            }
            if (items.length > 0) {
              console.log(`[Aether] S3 directory download expanded to ${items.length} file(s)`);
              return items;
            }
            return [];
          } else if (request.connectionType === 'sftp' || request.connectionType === 'rsync') {
            const service = request.connectionType === 'rsync' ? rsyncService : sftpService;
            const client = service.getClient(request.connectionId);
            const stat = await client.stat(request.sourcePath);
            if (stat.isDirectory) {
              const items: TransferItem[] = [];
              const transferIds: string[] = [];
              const destBase = getDownloadDestinationBase(request.destinationPath);
              try {
                for await (const { path: remotePath, relativePath, size } of service.walkFilesRecursive(
                  request.connectionId,
                  request.sourcePath,
                  { maxFiles: MAX_RECURSIVE_TRANSFER_FILES },
                )) {
                  if (relativePath == null || relativePath.trim() === '') continue;
                  const subDest = safeJoinDownloadDestination(destBase, relativePath);
                  const subRequest: TransferRequest = {
                    ...request,
                    sourcePath: remotePath,
                    destinationPath: subDest,
                    isDirectory: false,
                  };
                  const transfer = await enqueueTransferItem(subRequest, transferIds, size);
                  items.push(transfer);
                }
              } catch (error) {
                rollbackQueuedTransfers(transferIds);
                throw error;
              }
              if (items.length === 0) return [];
              console.log(`[Aether] ${request.connectionType.toUpperCase()} directory download expanded to ${items.length} file(s)`);
              return items;
            }
          } else if (MOUNTED_NETWORK_TYPES.has(request.connectionType)) {
            const sourceStat = await fs.stat(request.sourcePath);
            if (sourceStat.isDirectory) {
              const items: TransferItem[] = [];
              const transferIds: string[] = [];
              const destBase = getDownloadDestinationBase(request.destinationPath);
              try {
                for await (const { path: sourcePath, relativePath } of fs.walkFilesRecursive(
                  request.sourcePath,
                  { maxFiles: MAX_RECURSIVE_TRANSFER_FILES },
                )) {
                  if (relativePath.trim() === '') continue;
                  const subDest = safeJoinDownloadDestination(destBase, relativePath);
                  const subRequest: TransferRequest = {
                    ...request,
                    sourcePath,
                    destinationPath: subDest,
                    isDirectory: false,
                  };
                  const sourceFileStat = await fs.stat(sourcePath);
                  const transfer = await enqueueTransferItem(subRequest, transferIds, sourceFileStat.size);
                  items.push(transfer);
                }
              } catch (error) {
                rollbackQueuedTransfers(transferIds);
                throw error;
              }
              if (items.length === 0) return [];
              console.log(`[Aether] Network filesystem directory download expanded to ${items.length} file(s)`);
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

import { ipcMain } from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';
import { registerConnectionHandlers } from './connection.handlers';
import { registerS3Handlers } from './s3.handlers';
import { registerSftpHandlers } from './sftp.handlers';

export function registerAllIpcHandlers(): void {
  registerFilesystemHandlers(ipcMain);
  registerConnectionHandlers(ipcMain);
  registerSftpHandlers(ipcMain);
  registerS3Handlers(ipcMain);
}

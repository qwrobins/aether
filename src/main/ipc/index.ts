import { ipcMain, BrowserWindow } from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';
import { registerConnectionHandlers } from './connection.handlers';
import { registerS3Handlers } from './s3.handlers';
import { registerSftpHandlers } from './sftp.handlers';
import { registerTransferHandlers } from './transfer.handlers';

export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
  registerFilesystemHandlers(ipcMain);
  registerConnectionHandlers(ipcMain);
  registerSftpHandlers(ipcMain);
  registerS3Handlers(ipcMain);
  registerTransferHandlers(ipcMain, mainWindow);
}

import { ipcMain } from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';
import { registerConnectionHandlers } from './connection.handlers';
import { registerS3Handlers } from './s3.handlers';

export function registerAllIpcHandlers(): void {
  registerFilesystemHandlers(ipcMain);
  registerConnectionHandlers(ipcMain);
  registerS3Handlers(ipcMain);
}

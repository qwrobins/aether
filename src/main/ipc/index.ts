import { ipcMain } from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';
import { registerConnectionHandlers } from './connection.handlers';

export function registerAllIpcHandlers(): void {
  registerFilesystemHandlers(ipcMain);
  registerConnectionHandlers(ipcMain);
}

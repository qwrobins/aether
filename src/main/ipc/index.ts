import { ipcMain } from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';

export function registerAllIpcHandlers(): void {
  registerFilesystemHandlers(ipcMain);
}

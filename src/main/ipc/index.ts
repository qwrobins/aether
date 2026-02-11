import { ipcMain, BrowserWindow } from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';
import { registerConnectionHandlers } from './connection.handlers';
import { registerS3Handlers } from './s3.handlers';
import { registerSftpHandlers } from './sftp.handlers';
import { registerTransferHandlers } from './transfer.handlers';
import { IpcChannels } from '@shared/constants/channels';

export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
  registerFilesystemHandlers(ipcMain);
  registerConnectionHandlers(ipcMain);
  registerSftpHandlers(ipcMain);
  registerS3Handlers(ipcMain);
  registerTransferHandlers(ipcMain, mainWindow);

  ipcMain.handle(IpcChannels.WINDOW_CLOSE, () => mainWindow?.close());
  ipcMain.handle(IpcChannels.WINDOW_MINIMIZE, () => mainWindow?.minimize());
  ipcMain.handle(IpcChannels.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
}

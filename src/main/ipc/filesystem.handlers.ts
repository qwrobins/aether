import { type IpcMain, dialog, BrowserWindow } from 'electron';
import { FilesystemService } from '../services/filesystem.service';
import { IpcChannels } from '@shared/constants/channels';

export function registerFilesystemHandlers(ipcMain: IpcMain): void {
  const fs = new FilesystemService();

  ipcMain.handle(IpcChannels.FS_READ_DIR, async (_event, path: string) => {
    return fs.readDirectory(path);
  });

  ipcMain.handle(IpcChannels.FS_STAT, async (_event, path: string) => {
    return fs.stat(path);
  });

  ipcMain.handle(IpcChannels.FS_MKDIR, async (_event, dirPath: string) => {
    return fs.mkdir(dirPath);
  });

  ipcMain.handle(IpcChannels.FS_DELETE, async (_event, paths: string[]) => {
    return fs.remove(paths);
  });

  ipcMain.handle(
    IpcChannels.FS_RENAME,
    async (_event, oldPath: string, newPath: string) => {
      return fs.rename(oldPath, newPath);
    },
  );

  ipcMain.handle(IpcChannels.FS_GET_HOME, () => {
    return fs.getHome();
  });

  ipcMain.handle(
    IpcChannels.FS_OPEN_IN_EXPLORER,
    async (_event, path: string) => {
      fs.openInExplorer(path);
    },
  );

  ipcMain.handle(
    IpcChannels.DIALOG_OPEN_FILE,
    async (_event, options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
      const parentWindow = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(
        ...(parentWindow ? [parentWindow] : []),
        {
          title: options?.title ?? 'Select File',
          defaultPath: options?.defaultPath,
          filters: options?.filters,
          properties: ['openFile', 'showHiddenFiles'],
        },
      );
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
  );
}

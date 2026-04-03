import { type IpcMain, dialog, shell, BrowserWindow } from 'electron';
import { platform } from 'node:os';
import { FilesystemService } from '../services/filesystem.service';
import { IpcChannels } from '@shared/constants/channels';

export function registerFilesystemHandlers(ipcMain: IpcMain): void {
  const fs = new FilesystemService();

  ipcMain.handle(IpcChannels.FS_READ_DIR, async (_event, path: string) => {
    try {
      return await fs.readDirectory(path);
    } catch (err) {
      if (
        platform() === 'darwin' &&
        err instanceof Error &&
        (err as NodeJS.ErrnoException).code === 'EPERM'
      ) {
        throw new Error(`MACOS_EPERM:${path}`);
      }
      throw err;
    }
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

  ipcMain.handle(IpcChannels.FS_LIST_DRIVES, async () => {
    return fs.listDrives();
  });

  ipcMain.handle(IpcChannels.FS_MOUNT_DRIVE, async (_event, devicePath: string) => {
    return fs.mountDrive(devicePath);
  });

  ipcMain.handle(
    IpcChannels.FS_OPEN_IN_EXPLORER,
    async (_event, path: string) => {
      fs.openInExplorer(path);
    },
  );

  ipcMain.handle(IpcChannels.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('Invalid url: expected a non-empty string');
    }
    const trimmedUrl = url.trim();
    if (!/^(https?|x-apple\.systempreferences):/.test(trimmedUrl)) {
      throw new Error(`Blocked unsafe URL scheme: ${trimmedUrl}`);
    }
    await shell.openExternal(trimmedUrl);
  });

  ipcMain.handle(IpcChannels.DIALOG_OPEN_DIRECTORY, async (_event, defaultPath?: string) => {
    const parentWindow = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(
      ...(parentWindow ? [parentWindow] : []),
      {
        title: 'Select Folder',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      },
    );
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

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

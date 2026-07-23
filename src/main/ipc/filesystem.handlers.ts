import { type OpenDialogOptions, dialog, BrowserWindow } from 'electron';
import { platform } from 'node:os';
import { FilesystemService } from '../services/filesystem.service';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcMainHandle } from './ipc-main-handle';

const DEVICE_PATH_PATTERN = /^\/dev\/(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

function assertNonEmptyPath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${label}: expected a non-empty string`);
  }
}

export function registerFilesystemHandlers(ipcMain: IpcMainHandle): void {
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
    assertNonEmptyPath(dirPath, 'path');
    return fs.mkdir(dirPath);
  });

  ipcMain.handle(IpcChannels.FS_DELETE, async (_event, paths: string[]) => {
    if (
      !Array.isArray(paths) ||
      paths.length === 0 ||
      paths.some((p) => typeof p !== 'string' || p.trim().length === 0)
    ) {
      throw new Error('Invalid paths: expected a non-empty array of non-empty strings');
    }
    return fs.remove(paths);
  });

  ipcMain.handle(
    IpcChannels.FS_RENAME,
    async (_event, oldPath: string, newPath: string) => {
      assertNonEmptyPath(oldPath, 'oldPath');
      assertNonEmptyPath(newPath, 'newPath');
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
    if (typeof devicePath !== 'string' || !DEVICE_PATH_PATTERN.test(devicePath)) {
      throw new Error(`Invalid device path: expected a /dev/ device node, got ${String(devicePath)}`);
    }
    return fs.mountDrive(devicePath);
  });

  ipcMain.handle(
    IpcChannels.FS_OPEN_IN_EXPLORER,
    async (_event, path: string) => {
      fs.openInExplorer(path);
    },
  );

  ipcMain.handle(IpcChannels.DIALOG_OPEN_DIRECTORY, async (_event, defaultPath?: string) => {
    const parentWindow = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: 'Select Folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle(
    IpcChannels.DIALOG_OPEN_FILE,
    async (_event, options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
      const parentWindow = BrowserWindow.getFocusedWindow();
      const dialogOptions: OpenDialogOptions = {
        title: options?.title ?? 'Select File',
        defaultPath: options?.defaultPath,
        filters: options?.filters,
        properties: ['openFile', 'showHiddenFiles'],
      };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
  );
}

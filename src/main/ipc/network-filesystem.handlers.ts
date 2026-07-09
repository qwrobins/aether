import { NetworkFilesystemService } from '../services/network-filesystem.service';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcMainHandle } from './ipc-main-handle';

export const networkFilesystemService = new NetworkFilesystemService();

export function registerNetworkFilesystemHandlers(ipcMain: IpcMainHandle): void {
  ipcMain.handle(IpcChannels.NETFS_LIST, async (_event, connectionId: string, path?: string) => {
    return networkFilesystemService.list(connectionId, path);
  });

  ipcMain.handle(IpcChannels.NETFS_MKDIR, async (_event, connectionId: string, path: string) => {
    return networkFilesystemService.mkdir(connectionId, path);
  });

  ipcMain.handle(IpcChannels.NETFS_DELETE, async (_event, connectionId: string, paths: string[]) => {
    return networkFilesystemService.remove(connectionId, paths);
  });

  ipcMain.handle(
    IpcChannels.NETFS_RENAME,
    async (_event, connectionId: string, oldPath: string, newPath: string) => {
      return networkFilesystemService.rename(connectionId, oldPath, newPath);
    },
  );
}

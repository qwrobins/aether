import { RsyncService } from '../services/rsync.service';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcMainHandle } from './ipc-main-handle';

export const rsyncService = new RsyncService();

export function registerRsyncHandlers(ipcMain: IpcMainHandle): void {
  ipcMain.handle(IpcChannels.RSYNC_LIST, async (_event, connectionId: string, path: string) => {
    return rsyncService.list(connectionId, path);
  });

  ipcMain.handle(IpcChannels.RSYNC_MKDIR, async (_event, connectionId: string, path: string) => {
    return rsyncService.mkdir(connectionId, path);
  });

  ipcMain.handle(IpcChannels.RSYNC_DELETE, async (_event, connectionId: string, paths: string[]) => {
    return rsyncService.remove(connectionId, paths);
  });

  ipcMain.handle(IpcChannels.RSYNC_RENAME, async (_event, connectionId: string, oldPath: string, newPath: string) => {
    return rsyncService.rename(connectionId, oldPath, newPath);
  });
}

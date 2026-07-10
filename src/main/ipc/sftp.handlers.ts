import { SftpService } from '../services/sftp.service';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcMainHandle } from './ipc-main-handle';

export const sftpService = new SftpService();

export function registerSftpHandlers(ipcMain: IpcMainHandle): void {
  ipcMain.handle(IpcChannels.SFTP_LIST, async (_event, connectionId: string, path: string) => {
    return sftpService.list(connectionId, path);
  });

  ipcMain.handle(IpcChannels.SFTP_MKDIR, async (_event, connectionId: string, path: string) => {
    return sftpService.mkdir(connectionId, path);
  });

  ipcMain.handle(IpcChannels.SFTP_DELETE, async (_event, connectionId: string, paths: string[]) => {
    return sftpService.remove(connectionId, paths);
  });

  ipcMain.handle(IpcChannels.SFTP_RENAME, async (_event, connectionId: string, oldPath: string, newPath: string) => {
    return sftpService.rename(connectionId, oldPath, newPath);
  });
}

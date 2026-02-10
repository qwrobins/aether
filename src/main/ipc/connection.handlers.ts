import { IpcMain } from 'electron';
import { ConnectionService } from '../services/connection.service';
import { IpcChannels } from '@shared/constants/channels';

export function registerConnectionHandlers(ipcMain: IpcMain): void {
  const service = new ConnectionService();

  ipcMain.handle(IpcChannels.CONN_LIST, async () => {
    return service.list();
  });

  ipcMain.handle(IpcChannels.CONN_SAVE, async (_event, profile) => {
    return service.save(profile);
  });

  ipcMain.handle(IpcChannels.CONN_DELETE, async (_event, id: string) => {
    return service.delete(id);
  });

  ipcMain.handle(IpcChannels.CONN_TEST, async (_event, profile) => {
    return service.test(profile);
  });
}

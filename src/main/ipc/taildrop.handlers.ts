import type { IpcMain } from 'electron';
import { IpcChannels } from '@shared/constants/channels';
import { TaildropService } from '../services/taildrop.service';
import { getTransferService } from './transfer.handlers';
import type { TaildropReceiveRequest } from '@shared/types/taildrop';

export const taildropService = new TaildropService();

function validateReceiveRequest(request: TaildropReceiveRequest): TaildropReceiveRequest {
  if (!request || typeof request.destinationPath !== 'string') {
    throw new Error('Receive destination is required');
  }
  if (request.destinationPath.trim().length === 0) {
    throw new Error('Receive destination is required');
  }
  return request;
}

export function registerTaildropHandlers(ipcMain: IpcMain): void {
  getTransferService().setTaildropSender((item, signal) =>
    taildropService.sendFile(item.sourcePath, item.destinationPath, signal),
  );

  ipcMain.handle(IpcChannels.TAILDROP_STATUS, async () => {
    return taildropService.getAvailability();
  });

  ipcMain.handle(IpcChannels.TAILDROP_LIST_TARGETS, async () => {
    return taildropService.listTargets();
  });

  ipcMain.handle(IpcChannels.TAILDROP_RECEIVE, async (_event, request: TaildropReceiveRequest) => {
    return taildropService.receive(validateReceiveRequest(request).destinationPath);
  });
}

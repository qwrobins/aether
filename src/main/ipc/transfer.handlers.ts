import { IpcMain, BrowserWindow } from 'electron';
import { TransferService } from '../services/transfer.service';
import { s3Service } from './s3.handlers';
import { sftpService } from './sftp.handlers';
import { IpcChannels } from '@shared/constants/channels';
import type { TransferRequest } from '@shared/types/transfer';

const transferService = new TransferService();

export function getTransferService(): TransferService {
  return transferService;
}

export function registerTransferHandlers(
  ipcMain: IpcMain,
  mainWindow: BrowserWindow,
): void {
  transferService.setWindow(mainWindow);

  ipcMain.handle(
    IpcChannels.TRANSFER_START,
    async (_event, request: TransferRequest) => {
      let s3Client, sftpClient;

      if (request.connectionType === 's3') {
        s3Client = s3Service.getClient(request.connectionId);
      } else if (request.connectionType === 'sftp') {
        sftpClient = sftpService.getClient(request.connectionId);
      }

      return transferService.enqueue(request, s3Client, sftpClient);
    },
  );

  ipcMain.handle(
    IpcChannels.TRANSFER_CANCEL,
    async (_event, transferId: string) => {
      transferService.cancel(transferId);
    },
  );

  ipcMain.handle(IpcChannels.TRANSFER_CLEAR, async () => {
    transferService.clear();
  });

  ipcMain.handle(IpcChannels.TRANSFER_LIST, async () => {
    return transferService.getTransfers();
  });
}

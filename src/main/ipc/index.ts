import {
  ipcMain,
  BrowserWindow,
  type IpcMain,
  type IpcMainInvokeEvent,
} from 'electron';
import { registerFilesystemHandlers } from './filesystem.handlers';
import { registerConnectionHandlers } from './connection.handlers';
import { registerS3Handlers } from './s3.handlers';
import { registerSftpHandlers } from './sftp.handlers';
import { registerRsyncHandlers } from './rsync.handlers';
import { registerNetworkFilesystemHandlers } from './network-filesystem.handlers';
import { registerTransferHandlers } from './transfer.handlers';
import { registerTaildropHandlers } from './taildrop.handlers';
import { IpcChannels } from '@shared/constants/channels';

type NavigationValidator = (url: string) => boolean;

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  mainWindow: BrowserWindow,
  isAllowedNavigation: NavigationValidator,
): void {
  const senderFrame = event.senderFrame;
  if (
    event.sender !== mainWindow.webContents ||
    !senderFrame ||
    senderFrame !== mainWindow.webContents.mainFrame ||
    !isAllowedNavigation(senderFrame.url)
  ) {
    throw new Error('Blocked IPC request from an untrusted renderer');
  }
}

function createTrustedIpcMain(
  target: IpcMain,
  mainWindow: BrowserWindow,
  isAllowedNavigation: NavigationValidator,
): IpcMain {
  return {
    handle(channel, listener) {
      target.handle(channel, (event, ...args) => {
        assertTrustedSender(event, mainWindow, isAllowedNavigation);
        return listener(event, ...args);
      });
    },
  } as IpcMain;
}

export function registerAllIpcHandlers(
  mainWindow: BrowserWindow,
  isAllowedNavigation: NavigationValidator,
): void {
  const trustedIpcMain = createTrustedIpcMain(ipcMain, mainWindow, isAllowedNavigation);

  registerFilesystemHandlers(trustedIpcMain);
  registerConnectionHandlers(trustedIpcMain);
  registerSftpHandlers(trustedIpcMain);
  registerRsyncHandlers(trustedIpcMain);
  registerNetworkFilesystemHandlers(trustedIpcMain);
  registerS3Handlers(trustedIpcMain);
  registerTransferHandlers(trustedIpcMain, mainWindow);
  registerTaildropHandlers(trustedIpcMain);

  trustedIpcMain.handle(IpcChannels.WINDOW_CLOSE, () => mainWindow?.close());
  trustedIpcMain.handle(IpcChannels.WINDOW_MINIMIZE, () => mainWindow?.minimize());
  trustedIpcMain.handle(IpcChannels.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
}

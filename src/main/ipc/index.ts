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
import { getTransferService, registerTransferHandlers } from './transfer.handlers';
import { registerTaildropHandlers } from './taildrop.handlers';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcMainHandle } from './ipc-main-handle';

type NavigationValidator = (url: string) => boolean;

// IPC handlers are registered once per app lifetime. The current window is kept
// in module state so a re-created window (e.g. macOS activate) takes over
// transfer events, window controls, and trusted-sender checks without leaving
// handlers closing over a destroyed window.
let currentMainWindow: BrowserWindow | null = null;
let currentNavigationValidator: NavigationValidator | null = null;
let handlersRegistered = false;

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const mainWindow = currentMainWindow;
  const senderFrame = event.senderFrame;
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    !senderFrame ||
    senderFrame !== mainWindow.webContents.mainFrame ||
    !currentNavigationValidator?.(senderFrame.url)
  ) {
    throw new Error('Blocked IPC request from an untrusted renderer');
  }
}

function createTrustedIpcMain(target: IpcMain): IpcMainHandle {
  return {
    handle(channel, listener) {
      target.handle(channel, (event, ...args) => {
        assertTrustedSender(event);
        return listener(event, ...args);
      });
    },
  };
}

export function updateMainWindow(
  mainWindow: BrowserWindow,
  isAllowedNavigation: NavigationValidator,
): void {
  currentMainWindow = mainWindow;
  currentNavigationValidator = isAllowedNavigation;
  getTransferService().setWindow(mainWindow);
}

export function registerAllIpcHandlers(
  mainWindow: BrowserWindow,
  isAllowedNavigation: NavigationValidator,
): void {
  // Always refresh the window reference, even when handlers are already
  // registered (re-created windows must not keep stale closures).
  updateMainWindow(mainWindow, isAllowedNavigation);
  if (handlersRegistered) {
    return;
  }

  const trustedIpcMain = createTrustedIpcMain(ipcMain);

  registerFilesystemHandlers(trustedIpcMain);
  registerConnectionHandlers(trustedIpcMain);
  registerSftpHandlers(trustedIpcMain);
  registerRsyncHandlers(trustedIpcMain);
  registerNetworkFilesystemHandlers(trustedIpcMain);
  registerS3Handlers(trustedIpcMain);
  registerTransferHandlers(trustedIpcMain, mainWindow);
  registerTaildropHandlers(trustedIpcMain);

  trustedIpcMain.handle(IpcChannels.WINDOW_CLOSE, () => currentMainWindow?.close());
  trustedIpcMain.handle(IpcChannels.WINDOW_MINIMIZE, () => currentMainWindow?.minimize());
  trustedIpcMain.handle(IpcChannels.WINDOW_MAXIMIZE, () => {
    if (currentMainWindow?.isMaximized()) {
      currentMainWindow.unmaximize();
    } else {
      currentMainWindow?.maximize();
    }
  });

  handlersRegistered = true;
}

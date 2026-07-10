import { app, BrowserWindow, nativeImage, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { registerAllIpcHandlers } from './ipc';

/** Resolve the app icon path for both dev and packaged builds. */
function getIconPath(): string {
  if (app.isPackaged) {
    // In packaged build, icon.png is copied to the asar root by afterCopy hook
    return path.join(__dirname, '../../icon.png');
  }
  // In dev, relative to project root
  return path.resolve(__dirname, '../../assets/icon.png');
}

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function getRendererIndexPath(): string {
  return path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
}

function isAllowedAppNavigation(url: string): boolean {
  if (url === pathToFileURL(getRendererIndexPath()).toString()) return true;
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) return false;

  try {
    const candidateUrl = new URL(url);
    const devServerUrl = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return candidateUrl.origin === devServerUrl.origin;
  } catch {
    return false;
  }
}

function formatUrlForSecurityLog(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

const createWindow = () => {
  console.log('[Aether] Creating window...');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#111118',
    show: false,
    icon: nativeImage.createFromPath(getIconPath()),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url)) {
      console.warn(`[Aether] Blocked renderer navigation to ${formatUrlForSecurityLog(url)}`);
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedAppNavigation(url)) {
      console.warn(`[Aether] Blocked renderer redirect to ${formatUrlForSecurityLog(url)}`);
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[Aether] Blocked renderer window open to ${formatUrlForSecurityLog(url)}`);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[Aether] Window ready to show');
    mainWindow?.show();
  });

  try {
    registerAllIpcHandlers(mainWindow, isAllowedAppNavigation);
    console.log('[Aether] IPC handlers registered');
  } catch (err) {
    console.error('[Aether] Failed to register IPC handlers:', err);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log('[Aether] Loading dev server:', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(getRendererIndexPath());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

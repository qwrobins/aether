import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@shared/constants/channels';

const readDirectory = vi.fn();
const stat = vi.fn();
const mkdir = vi.fn();
const remove = vi.fn();
const rename = vi.fn();
const getHome = vi.fn();
const listDrives = vi.fn();
const mountDrive = vi.fn();
const openInExplorer = vi.fn();

const showOpenDialog = vi.fn();
const getFocusedWindow = vi.fn();

vi.mock('electron', () => ({
  dialog: { showOpenDialog },
  BrowserWindow: { getFocusedWindow },
}));

vi.mock('../../services/filesystem.service', () => ({
  FilesystemService: class FilesystemService {
    readDirectory = readDirectory;
    stat = stat;
    mkdir = mkdir;
    remove = remove;
    rename = rename;
    getHome = getHome;
    listDrives = listDrives;
    mountDrive = mountDrive;
    openInExplorer = openInExplorer;
  },
}));

describe('registerFilesystemHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers filesystem handlers and delegates to the service', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown> | unknown) => {
        handlers.set(channel, handler);
      }),
    };

    const { registerFilesystemHandlers } = await import('../filesystem.handlers');
    registerFilesystemHandlers(ipcMain as never);

    await handlers.get(IpcChannels.FS_READ_DIR)?.({}, '/tmp');
    await handlers.get(IpcChannels.FS_STAT)?.({}, '/tmp/a');
    await handlers.get(IpcChannels.FS_MKDIR)?.({}, '/tmp/new');
    await handlers.get(IpcChannels.FS_DELETE)?.({}, ['/tmp/a']);
    await handlers.get(IpcChannels.FS_RENAME)?.({}, '/tmp/a', '/tmp/b');
    await handlers.get(IpcChannels.FS_GET_HOME)?.({});
    await handlers.get(IpcChannels.FS_LIST_DRIVES)?.({});
    await handlers.get(IpcChannels.FS_MOUNT_DRIVE)?.({}, '/dev/sdb1');
    await handlers.get(IpcChannels.FS_OPEN_IN_EXPLORER)?.({}, '/tmp/a');

    expect(readDirectory).toHaveBeenCalledWith('/tmp');
    expect(stat).toHaveBeenCalledWith('/tmp/a');
    expect(mkdir).toHaveBeenCalledWith('/tmp/new');
    expect(remove).toHaveBeenCalledWith(['/tmp/a']);
    expect(rename).toHaveBeenCalledWith('/tmp/a', '/tmp/b');
    expect(getHome).toHaveBeenCalled();
    expect(listDrives).toHaveBeenCalled();
    expect(mountDrive).toHaveBeenCalledWith('/dev/sdb1');
    expect(openInExplorer).toHaveBeenCalledWith('/tmp/a');
  });

  it('passes the focused window to open-file dialogs and returns the selected path', async () => {
    const parentWindow = { id: 1 };
    getFocusedWindow.mockReturnValue(parentWindow);
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/key'] });

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown> | unknown) => {
        handlers.set(channel, handler);
      }),
    };

    const { registerFilesystemHandlers } = await import('../filesystem.handlers');
    registerFilesystemHandlers(ipcMain as never);

    const selected = await handlers.get(IpcChannels.DIALOG_OPEN_FILE)?.({}, { title: 'Pick', defaultPath: '/tmp', filters: [{ name: 'SSH', extensions: ['pem'] }] });

    expect(selected).toBe('/tmp/key');
    expect(showOpenDialog).toHaveBeenCalledWith(parentWindow, expect.objectContaining({ title: 'Pick', defaultPath: '/tmp' }));
  });

  it('returns null when the open-file dialog is canceled', async () => {
    getFocusedWindow.mockReturnValue(null);
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown> | unknown) => {
        handlers.set(channel, handler);
      }),
    };

    const { registerFilesystemHandlers } = await import('../filesystem.handlers');
    registerFilesystemHandlers(ipcMain as never);

    const selected = await handlers.get(IpcChannels.DIALOG_OPEN_FILE)?.({}, undefined);

    expect(selected).toBeNull();
    expect(showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Select File' }));
  });
});

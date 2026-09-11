import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();
const getPathForFile = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
  webUtils: { getPathForFile },
}));

describe('preload bridge', () => {
  beforeEach(async () => {
    vi.resetModules();
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    on.mockClear();
    removeListener.mockClear();
    getPathForFile.mockReset();
    await import('./preload');
  });

  it('resolves native File paths through Electron without sending File objects over IPC', () => {
    const file = new File(['hello'], 'hello.txt');
    getPathForFile.mockReturnValue('/home/user/hello.txt');
    const api = exposeInMainWorld.mock.calls[0][1];

    expect(api.getPathForFile(file)).toBe('/home/user/hello.txt');
    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not substitute a caller-provided path for a File without a native path', () => {
    const file = Object.assign(new File(['hello'], 'hello.txt'), { path: '/private/secret' });
    getPathForFile.mockReturnValue('');
    const api = exposeInMainWorld.mock.calls[0][1];

    expect(api.getPathForFile(file)).toBe('');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('allows known invoke channels', async () => {
    invoke.mockResolvedValue('/home/user');
    const api = exposeInMainWorld.mock.calls[0][1];

    await expect(api.invoke('fs:get-home')).resolves.toBe('/home/user');

    expect(invoke).toHaveBeenCalledWith('fs:get-home');
  });

  it('blocks unknown invoke channels before reaching ipcRenderer', async () => {
    const api = exposeInMainWorld.mock.calls[0][1];

    expect(() => api.invoke('credential:dump')).toThrow('Blocked IPC channel: credential:dump');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('allows the host-key trust channel and blocks the removed shell channel', async () => {
    invoke.mockResolvedValue(true);
    const api = exposeInMainWorld.mock.calls[0][1];

    await expect(api.invoke('conn:trust-host-key', 'conn-1', 'SHA256:abc')).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('conn:trust-host-key', 'conn-1', 'SHA256:abc');
    expect(() => api.invoke('shell:open-external', 'https://example.com')).toThrow(
      'Blocked IPC channel: shell:open-external',
    );
  });

  it('does not expose bulk listener removal', () => {
    const api = exposeInMainWorld.mock.calls[0][1];

    expect(api.removeAllListeners).toBeUndefined();
  });

  it('allows transfer event subscriptions and cleanup', () => {
    const api = exposeInMainWorld.mock.calls[0][1];
    const callback = vi.fn();

    const unsubscribe = api.on('transfer:progress', callback);
    const handler = on.mock.calls[0][1];
    handler({}, { transferId: 'transfer-1' });
    unsubscribe();

    expect(on).toHaveBeenCalledWith('transfer:progress', expect.any(Function));
    expect(callback).toHaveBeenCalledWith({ transferId: 'transfer-1' });
    expect(removeListener).toHaveBeenCalledWith('transfer:progress', handler);
  });

  it('blocks unknown event channels', () => {
    const api = exposeInMainWorld.mock.calls[0][1];

    expect(() => api.on('fs:read-dir', vi.fn())).toThrow('Blocked IPC channel: fs:read-dir');
    expect(on).not.toHaveBeenCalled();
  });
});

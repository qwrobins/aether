import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
}));

describe('preload bridge', () => {
  beforeEach(async () => {
    vi.resetModules();
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    on.mockClear();
    removeListener.mockClear();
    await import('./preload');
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

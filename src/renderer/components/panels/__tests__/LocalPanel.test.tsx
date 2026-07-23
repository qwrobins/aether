// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalPanel } from '../LocalPanel';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { beginInternalDrag, endInternalDrag } from '@/lib/drag-guard';
import type { SftpConnectionProfile } from '@shared/types/connection';
import type { IpcInvokeMap } from '@shared/types/ipc';

function sftpProfile(): SftpConnectionProfile {
  return {
    id: 'sftp-1',
    name: 'SFTP',
    type: 'sftp',
    host: 'example.com',
    port: 22,
    username: 'deploy',
    authMethod: 'password',
    password: 'secret',
    createdAt: '2026-03-07T10:00:00.000Z',
    updatedAt: '2026-03-07T10:00:00.000Z',
  };
}

function remotePayloadRaw(): string {
  return JSON.stringify({
    panelType: 'remote',
    entries: [{ name: 'secret.txt', path: '/remote/secret.txt', size: 10, isDirectory: false }],
  });
}

function forgedDataTransfer(raw: string): DataTransfer {
  return {
    types: ['application/aether-transfer'],
    getData: (type: string) => (type === 'application/aether-transfer' ? raw : ''),
    files: { length: 0 },
  } as unknown as DataTransfer;
}

function internalDataTransfer(raw: string): DataTransfer {
  const store = new Map<string, string>();
  const dt = {
    types: ['application/aether-transfer'],
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) =>
      store.get(type) ?? (type === 'application/aether-transfer' ? raw : ''),
    files: { length: 0 },
  } as unknown as DataTransfer;
  // Registers the per-drag token into the DataTransfer, like FileItem does.
  beginInternalDrag(dt);
  return dt;
}

describe('LocalPanel drop guard', () => {
  beforeEach(() => {
    endInternalDrag();
    useLocalPanelStore.setState({
      currentPath: '/local',
      entries: [],
      selectedFiles: new Set(),
      selectionAnchor: null,
      isLoading: false,
      error: null,
      blockedPath: null,
    });
    useRemotePanelStore.setState({
      mode: 'connection',
      activeConnectionId: 'sftp-1',
      activeProfile: sftpProfile(),
      connectionStatus: 'connected',
      currentBucket: null,
      currentPath: '/remote',
      entries: [],
      selectedFiles: new Set(),
    });
    useTransferStore.setState({ transfers: [] });
    window.api.invoke = vi.fn(
      async (channel: keyof IpcInvokeMap): Promise<unknown> => {
        if (channel === 'fs:get-home') return '/local';
        if (channel === 'fs:read-dir') return { path: '/local', parentPath: '/', entries: [] };
        if (channel === 'transfer:start') return 'transfer-id-1';
        throw new Error(`Unhandled channel ${channel}`);
      },
    ) as unknown as typeof window.api.invoke;
  });

  it('ignores a forged aether-transfer drop that did not start inside this window', async () => {
    const { container } = render(<LocalPanel />);
    const panel = container.querySelector('[data-panel="local"]');
    expect(panel).not.toBeNull();

    fireEvent.drop(panel as Element, { dataTransfer: forgedDataTransfer(remotePayloadRaw()) });
    await Promise.resolve();

    expect(window.api.invoke).not.toHaveBeenCalledWith('transfer:start', expect.anything());
    expect(useTransferStore.getState().transfers).toHaveLength(0);
  });

  it('accepts a drop from a drag that began inside this window', async () => {
    const { container } = render(<LocalPanel />);
    const panel = container.querySelector('[data-panel="local"]');
    expect(panel).not.toBeNull();

    fireEvent.drop(panel as Element, { dataTransfer: internalDataTransfer(remotePayloadRaw()) });

    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(
        'transfer:start',
        expect.objectContaining({
          sourcePath: '/remote/secret.txt',
          destinationPath: '/local/secret.txt',
          direction: 'download',
        }),
      );
    });
    expect(useTransferStore.getState().transfers).toHaveLength(1);
  });
});

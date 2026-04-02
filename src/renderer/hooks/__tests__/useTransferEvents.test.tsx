// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransferEvents } from '../useTransferEvents';
import { useTransferStore } from '@/stores/transferStore';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import type { TransferItem } from '@shared/types/transfer';

function HookHarness() {
  useTransferEvents();
  return null;
}

function transfer(overrides: Partial<TransferItem>): TransferItem {
  return {
    id: 'transfer-1',
    fileName: 'demo.txt',
    sourcePath: '/tmp/demo.txt',
    destinationPath: '/remote/demo.txt',
    direction: 'upload',
    connectionId: 'conn-1',
    connectionType: 's3',
    size: 100,
    bytesTransferred: 0,
    status: 'queued',
    speed: 0,
    retryCount: 0,
    ...overrides,
  };
}

describe('useTransferEvents', () => {
  beforeEach(() => {
    useTransferStore.setState({ transfers: [] });
    useLocalPanelStore.setState({ refresh: vi.fn() });
    useRemotePanelStore.setState({ refresh: vi.fn() });
  });

  it('subscribes to transfer events and cleans up listeners', () => {
    const offProgress = vi.fn();
    const offComplete = vi.fn();
    const offError = vi.fn();

    window.api.on = vi
      .fn()
      .mockImplementationOnce(() => offProgress)
      .mockImplementationOnce(() => offComplete)
      .mockImplementationOnce(() => offError);

    const view = render(<HookHarness />);

    expect(window.api.on).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(offProgress).toHaveBeenCalled();
    expect(offComplete).toHaveBeenCalled();
    expect(offError).toHaveBeenCalled();
  });

  it('updates progress, marks completion, and refreshes the destination pane', () => {
    const handlers = new Map<string, (data: unknown) => void>();
    window.api.on = vi.fn((channel: string, callback: (data: unknown) => void) => {
      handlers.set(channel, callback);
      return vi.fn();
    });

    const remoteRefresh = vi.fn();
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'upload-1', direction: 'upload' })],
    });

    render(<HookHarness />);

    handlers.get('transfer:progress')?.({
      transferId: 'upload-1',
      bytesTransferred: 55,
      totalBytes: 100,
      speed: 10,
    });
    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      bytesTransferred: 55,
      status: 'active',
    });

    handlers.get('transfer:complete')?.({ transferId: 'upload-1', status: 'completed', success: true });
    expect(useTransferStore.getState().transfers[0].status).toBe('completed');
    expect(remoteRefresh).toHaveBeenCalledTimes(1);
  });

  it('marks failed transfers from error events without refreshing panes', () => {
    const handlers = new Map<string, (data: unknown) => void>();
    window.api.on = vi.fn((channel: string, callback: (data: unknown) => void) => {
      handlers.set(channel, callback);
      return vi.fn();
    });

    const localRefresh = vi.fn();
    useLocalPanelStore.setState({ refresh: localRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'download-1', direction: 'download' })],
    });

    render(<HookHarness />);

    handlers.get('transfer:error')?.({ transferId: 'download-1', error: 'boom' });
    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      status: 'failed',
      error: 'boom',
    });
    expect(localRefresh).not.toHaveBeenCalled();
  });

  it('refreshes the local pane when a download completes successfully', () => {
    const handlers = new Map<string, (data: unknown) => void>();
    window.api.on = vi.fn((channel: string, callback: (data: unknown) => void) => {
      handlers.set(channel, callback);
      return vi.fn();
    });

    const localRefresh = vi.fn();
    const remoteRefresh = vi.fn();
    useLocalPanelStore.setState({ refresh: localRefresh });
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'download-1', direction: 'download' })],
    });

    render(<HookHarness />);

    handlers.get('transfer:progress')?.({
      transferId: 'download-1',
      bytesTransferred: 100,
      totalBytes: 100,
      speed: 10,
    });
    handlers.get('transfer:complete')?.({ transferId: 'download-1', status: 'completed', success: true });

    expect(useTransferStore.getState().transfers[0].status).toBe('completed');
    expect(localRefresh).toHaveBeenCalledTimes(1);
    expect(remoteRefresh).not.toHaveBeenCalled();
  });

  it('marks cancelled transfers without refreshing panes', () => {
    const handlers = new Map<string, (data: unknown) => void>();
    window.api.on = vi.fn((channel: string, callback: (data: unknown) => void) => {
      handlers.set(channel, callback);
      return vi.fn();
    });

    const localRefresh = vi.fn();
    const remoteRefresh = vi.fn();
    useLocalPanelStore.setState({ refresh: localRefresh });
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'upload-1', direction: 'upload', status: 'active' })],
    });

    render(<HookHarness />);

    handlers.get('transfer:complete')?.({
      transferId: 'upload-1',
      status: 'cancelled',
      success: false,
    });

    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      status: 'cancelled',
    });
    expect(useTransferStore.getState().transfers[0].error).toBeUndefined();
    expect(localRefresh).not.toHaveBeenCalled();
    expect(remoteRefresh).not.toHaveBeenCalled();
  });
});

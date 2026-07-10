// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransferEvents } from '../useTransferEvents';
import { useTransferStore } from '@/stores/transferStore';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTaildropStore } from '@/stores/taildropStore';
import type { TransferItem } from '@shared/types/transfer';
import type { IpcEventMap } from '@shared/types/ipc';

type EventHandlers = Partial<Record<keyof IpcEventMap, (data: unknown) => void>>;

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

function mockEventSubscriptions(handlers: EventHandlers): void {
  window.api.on = vi.fn(<K extends keyof IpcEventMap>(
    channel: K,
    callback: (data: IpcEventMap[K]) => void,
  ) => {
    handlers[channel] = callback as (data: unknown) => void;
    return vi.fn();
  }) as typeof window.api.on;
}

describe('useTransferEvents', () => {
  beforeEach(() => {
    useTransferStore.getState().setTransfers([]);
    useLocalPanelStore.setState({ refresh: vi.fn() });
    useRemotePanelStore.setState({ refresh: vi.fn() });
    useTaildropStore.setState({ history: [] });
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
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);

    const remoteRefresh = vi.fn();
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'upload-1', direction: 'upload' })],
    });

    render(<HookHarness />);

    handlers['transfer:progress']?.({
      transferId: 'upload-1',
      bytesTransferred: 55,
      totalBytes: 100,
      speed: 10,
    });
    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      bytesTransferred: 55,
      status: 'active',
    });

    handlers['transfer:complete']?.({ transferId: 'upload-1', status: 'completed', success: true });
    expect(useTransferStore.getState().transfers[0].status).toBe('completed');
    expect(remoteRefresh).toHaveBeenCalledTimes(1);
  });

  it('marks failed transfers from error events without refreshing panes', () => {
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);

    const localRefresh = vi.fn();
    useLocalPanelStore.setState({ refresh: localRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'download-1', direction: 'download' })],
    });

    render(<HookHarness />);

    handlers['transfer:error']?.({ transferId: 'download-1', error: 'boom' });
    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      status: 'failed',
      error: 'boom',
    });
    expect(localRefresh).not.toHaveBeenCalled();
  });

  it('refreshes the local pane when a download completes successfully', () => {
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);

    const localRefresh = vi.fn();
    const remoteRefresh = vi.fn();
    useLocalPanelStore.setState({ refresh: localRefresh });
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'download-1', direction: 'download' })],
    });

    render(<HookHarness />);

    handlers['transfer:progress']?.({
      transferId: 'download-1',
      bytesTransferred: 100,
      totalBytes: 100,
      speed: 10,
    });
    handlers['transfer:complete']?.({ transferId: 'download-1', status: 'completed', success: true });

    expect(useTransferStore.getState().transfers[0].status).toBe('completed');
    expect(localRefresh).toHaveBeenCalledTimes(1);
    expect(remoteRefresh).not.toHaveBeenCalled();
  });

  it('refreshes once after the final transfer in a batch completes', () => {
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);
    const remoteRefresh = vi.fn();
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.getState().setTransfers([
      transfer({ id: 'one', batchId: 'batch-1', status: 'active' }),
      transfer({ id: 'two', batchId: 'batch-1', status: 'active' }),
    ]);
    render(<HookHarness />);

    handlers['transfer:complete']?.({
      transferId: 'one',
      status: 'completed',
      success: true,
    });
    expect(remoteRefresh).not.toHaveBeenCalled();

    handlers['transfer:complete']?.({
      transferId: 'two',
      status: 'completed',
      success: true,
    });
    expect(remoteRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a mixed-result batch finishes when at least one transfer succeeded', () => {
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);
    const remoteRefresh = vi.fn();
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.getState().setTransfers([
      transfer({ id: 'one', batchId: 'batch-1', status: 'active' }),
      transfer({ id: 'two', batchId: 'batch-1', status: 'active' }),
    ]);
    render(<HookHarness />);

    handlers['transfer:complete']?.({
      transferId: 'one',
      status: 'completed',
      success: true,
    });
    handlers['transfer:complete']?.({
      transferId: 'two',
      status: 'failed',
      success: false,
      error: 'failed',
    });

    expect(remoteRefresh).toHaveBeenCalledTimes(1);
  });

  it('records each Taildrop batch result with its own completion status', () => {
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);
    useTransferStore.getState().setTransfers([
      transfer({
        id: 'one',
        batchId: 'batch-1',
        connectionType: 'taildrop',
        targetName: 'laptop',
        status: 'active',
      }),
      transfer({
        id: 'two',
        batchId: 'batch-1',
        connectionType: 'taildrop',
        targetName: 'laptop',
        status: 'active',
      }),
    ]);
    render(<HookHarness />);

    handlers['transfer:complete']?.({
      transferId: 'one',
      status: 'completed',
      success: true,
    });
    handlers['transfer:complete']?.({
      transferId: 'two',
      status: 'failed',
      success: false,
      error: 'send failed',
    });

    expect(useTaildropStore.getState().history).toEqual([
      expect.objectContaining({ id: 'two', status: 'failed', error: 'send failed' }),
      expect.objectContaining({ id: 'one', status: 'completed', error: undefined }),
    ]);
  });

  it('marks cancelled transfers without refreshing panes', () => {
    const handlers: EventHandlers = {};
    mockEventSubscriptions(handlers);

    const localRefresh = vi.fn();
    const remoteRefresh = vi.fn();
    useLocalPanelStore.setState({ refresh: localRefresh });
    useRemotePanelStore.setState({ refresh: remoteRefresh });
    useTransferStore.setState({
      transfers: [transfer({ id: 'upload-1', direction: 'upload', status: 'active' })],
    });

    render(<HookHarness />);

    handlers['transfer:complete']?.({
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

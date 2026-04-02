// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { useTransferStore } from '../transferStore';
import { useUiStore } from '../uiStore';
import type { TransferItem } from '@shared/types/transfer';

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

describe('useTransferStore', () => {
  beforeEach(() => {
    useTransferStore.setState({ transfers: [] });
    useUiStore.setState({ transferQueueExpanded: false, sidebarExpanded: true, theme: 'dark' });
  });

  it('adds transfers and expands the queue', () => {
    useTransferStore.getState().addTransfer(transfer({ id: 'one' }));

    expect(useTransferStore.getState().transfers).toHaveLength(1);
    expect(useUiStore.getState().transferQueueExpanded).toBe(true);
  });

  it('updates progress and completion state', () => {
    useTransferStore.setState({ transfers: [transfer({ id: 'one' })] });

    useTransferStore.getState().updateProgress({
      transferId: 'one',
      bytesTransferred: 75,
      totalBytes: 100,
      speed: 12,
    });

    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      bytesTransferred: 75,
      size: 100,
      speed: 12,
      status: 'active',
    });

    useTransferStore.getState().markComplete({ transferId: 'one', status: 'completed', success: true });
    expect(useTransferStore.getState().transfers[0].status).toBe('completed');
    expect(useTransferStore.getState().transfers[0].completedAt).toBeTypeOf('string');
  });

  it('preserves cancelled completion state', () => {
    useTransferStore.setState({ transfers: [transfer({ id: 'one', status: 'active' })] });

    useTransferStore.getState().markComplete({
      transferId: 'one',
      status: 'cancelled',
      success: false,
    });

    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      status: 'cancelled',
      speed: 0,
    });
    expect(useTransferStore.getState().transfers[0].error).toBeUndefined();
  });

  it('reports counts and remaining bytes from active and queued transfers', () => {
    useTransferStore.setState({
      transfers: [
        transfer({ id: 'active', status: 'active', size: 100, bytesTransferred: 40 }),
        transfer({ id: 'queued', status: 'queued', size: 50, bytesTransferred: 0 }),
        transfer({ id: 'done', status: 'completed', size: 20, bytesTransferred: 20 }),
      ],
    });

    expect(useTransferStore.getState().activeCount()).toBe(1);
    expect(useTransferStore.getState().queuedCount()).toBe(1);
    expect(useTransferStore.getState().totalRemaining()).toBe(110);
  });
});

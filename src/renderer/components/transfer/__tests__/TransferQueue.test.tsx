// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferQueue } from '../TransferQueue';
import { useTransferStore } from '@/stores/transferStore';
import { useUiStore } from '@/stores/uiStore';
import type { TransferItem } from '@shared/types/transfer';

vi.mock('../TransferItem', () => ({
  TransferItem: ({ transfer }: { transfer: TransferItem }) => (
    <div data-testid="transfer-item">{transfer.id}</div>
  ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function transfer(id: string, status: TransferItem['status']): TransferItem {
  return {
    id,
    fileName: `${id}.txt`,
    sourcePath: `/source/${id}.txt`,
    destinationPath: `/destination/${id}.txt`,
    direction: 'upload',
    connectionId: 's3-1',
    connectionType: 's3',
    size: 100,
    bytesTransferred: status === 'completed' ? 100 : 0,
    status,
    speed: 0,
    retryCount: 0,
  };
}

describe('TransferQueue', () => {
  beforeEach(() => {
    useUiStore.setState({ transferQueueExpanded: true });
    useTransferStore.setState({ transfers: [] });
  });

  it('does not render terminal history when active transfers fill the visibility limit', () => {
    useTransferStore.setState({
      transfers: [
        ...Array.from({ length: 200 }, (_, index) => transfer(`active-${index}`, 'active')),
        transfer('completed-1', 'completed'),
        transfer('completed-2', 'completed'),
      ],
    });

    render(<TransferQueue />);

    expect(screen.getAllByTestId('transfer-item')).toHaveLength(200);
    expect(screen.queryByText('completed-1')).toBeNull();
    expect(screen.queryByText('completed-2')).toBeNull();
    expect(screen.getByText('2 additional transfers hidden')).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../TitleBar';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { useConnectionStore } from '@/stores/connectionStore';
import type { S3ConnectionProfile } from '@shared/types/connection';
import type { TransferItem } from '@shared/types/transfer';

function profile(overrides: Partial<S3ConnectionProfile> = {}): S3ConnectionProfile {
  return {
    id: 's3-1',
    name: 'Production S3',
    type: 's3',
    region: 'us-east-1',
    authMethod: 'profile',
    profile: 'production',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function transfer(overrides: Partial<TransferItem>): TransferItem {
  return {
    id: 'transfer-1',
    fileName: 'asset.png',
    sourcePath: '/local/asset.png',
    destinationPath: 'uploads/asset.png',
    direction: 'upload',
    connectionId: 's3-1',
    connectionType: 's3',
    size: 100,
    bytesTransferred: 0,
    status: 'queued',
    speed: 0,
    retryCount: 0,
    ...overrides,
  };
}

describe('TitleBar', () => {
  beforeEach(() => {
    vi.stubGlobal('api', {
      invoke: vi.fn(),
    });

    useRemotePanelStore.setState({
      activeConnectionId: null,
      activeProfile: null,
      connectionStatus: 'disconnected',
      connectionError: null,
    });
    useTransferStore.setState({ transfers: [] });
    useConnectionStore.setState({
      profiles: [],
      selectedConnectionId: null,
      isLoading: false,
    });
  });

  it('shows the connected profile pill from the active profile state', () => {
    useRemotePanelStore.setState({
      activeConnectionId: null,
      activeProfile: profile(),
      connectionStatus: 'connected',
    });

    render(<TitleBar />);

    expect(screen.getByText('Production S3')).toBeTruthy();
  });

  it('falls back to the saved profile when only the active connection id is available', () => {
    useConnectionStore.setState({
      profiles: [profile()],
    });
    useRemotePanelStore.setState({
      activeConnectionId: 's3-1',
      activeProfile: null,
      connectionStatus: 'connected',
    });

    render(<TitleBar />);

    expect(screen.getByText('Production S3')).toBeTruthy();
  });

  it('shows active and queued transfer activity', () => {
    useTransferStore.setState({
      transfers: [
        transfer({ id: 'active-1', status: 'active' }),
        transfer({ id: 'queued-1', status: 'queued' }),
        transfer({ id: 'completed-1', status: 'completed' }),
      ],
    });

    render(<TitleBar />);

    expect(screen.getByText('1 active, 1 queued')).toBeTruthy();
  });
});

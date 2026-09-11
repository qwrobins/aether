// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { RemotePanel } from '../RemotePanel';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useTransferStore } from '@/stores/transferStore';
import { beginInternalDrag, endInternalDrag } from '@/lib/drag-guard';
import type { S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';
import type { TransferItem } from '@shared/types/transfer';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const nativePaths = new Map<File, string>();

function sftpProfile(): SftpConnectionProfile {
  return {
    id: 'sftp-1',
    name: 'SFTP',
    type: 'sftp',
    host: 'example.com',
    port: 22,
    username: 'deploy',
    authMethod: 'key',
    createdAt: '2026-03-07T10:00:00.000Z',
    updatedAt: '2026-03-07T10:00:00.000Z',
  };
}

function s3Profile(): S3ConnectionProfile {
  return {
    id: 's3-1',
    name: 'S3',
    type: 's3',
    region: 'us-east-1',
    authMethod: 'default-chain',
    createdAt: '2026-03-07T10:00:00.000Z',
    updatedAt: '2026-03-07T10:00:00.000Z',
  };
}

function nativeFile(name: string, path: string, contents = 'hello'): File {
  const file = new File([contents], name);
  nativePaths.set(file, path);
  return file;
}

function dataTransfer(files: File[] = [], data: Record<string, string> = {}): DataTransfer {
  const values = new Map(Object.entries(data));
  return {
    files,
    types: [...(files.length > 0 ? ['Files'] : []), ...Object.keys(data)],
    dropEffect: 'none',
    getData: (type: string) => values.get(type) ?? '',
    setData: (type: string, value: string) => values.set(type, value),
  } as unknown as DataTransfer;
}

function localPayload(): string {
  return JSON.stringify({
    panelType: 'local',
    entries: [{ name: 'notes.txt', path: '/local/notes.txt', size: 10, isDirectory: false }],
  });
}

function renderDropTarget(): Element {
  const { container } = render(<RemotePanel />);
  const panel = container.querySelector('[data-panel="remote"]');
  expect(panel).not.toBeNull();
  return panel as Element;
}

describe('RemotePanel file drops', () => {
  beforeEach(() => {
    endInternalDrag();
    nativePaths.clear();
    useRemotePanelStore.setState({
      ...useRemotePanelStore.getInitialState(),
      activeConnectionId: 'sftp-1',
      activeProfile: sftpProfile(),
      connectionStatus: 'connected',
      currentPath: '/incoming/',
    });
    useTransferStore.setState({ transfers: [] });
    window.api.getPathForFile = vi.fn((file: File) => nativePaths.get(file) ?? '');
    window.api.invoke = vi.fn().mockResolvedValue('transfer-1');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it.each(['/incoming/', '/'])(
    'uploads a native file without File.path into SFTP directory %s',
    async (currentPath) => {
      useRemotePanelStore.setState({ currentPath });
      const file = nativeFile('report #1.txt', '/local/report #1.txt');
      expect('path' in file).toBe(false);
      const drop = dataTransfer([file]);
      const panel = renderDropTarget();

      expect(fireEvent.dragOver(panel, { dataTransfer: drop })).toBe(false);
      expect(drop.dropEffect).toBe('copy');
      fireEvent.drop(panel, { dataTransfer: drop });

      await waitFor(() => expect(useTransferStore.getState().transfers).toHaveLength(1));
      expect(window.api.getPathForFile).toHaveBeenCalledWith(file);
      expect(window.api.invoke).toHaveBeenCalledWith('transfer:start', expect.objectContaining({
        sourcePath: '/local/report #1.txt',
        destinationPath: `${currentPath}report #1.txt`,
        direction: 'upload',
        connectionId: 'sftp-1',
        connectionType: 'sftp',
      }));
      expect(useTransferStore.getState().transfers[0]).toMatchObject({
        id: 'transfer-1',
        fileName: 'report #1.txt',
        size: file.size,
        status: 'queued',
      });
    },
  );

  it.each(['photos/', ''])('queues every native file under S3 prefix "%s"', async (currentPath) => {
    useRemotePanelStore.setState({
      activeConnectionId: 's3-1',
      activeProfile: s3Profile(),
      currentBucket: 'uploads',
      currentPath,
    });
    const first = nativeFile('first.txt', '/local/first.txt');
    const second = nativeFile('second.txt', '/local/second.txt', 'second');
    vi.mocked(window.api.invoke)
      .mockResolvedValueOnce('transfer-1')
      .mockResolvedValueOnce('transfer-2');

    fireEvent.drop(renderDropTarget(), { dataTransfer: dataTransfer([first, second]) });

    // Native paths must be captured before the first IPC await, while the drop is accessible.
    expect(window.api.getPathForFile).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(useTransferStore.getState().transfers).toHaveLength(2));
    for (const [index, file] of [first, second].entries()) {
      expect(window.api.invoke).toHaveBeenNthCalledWith(index + 1, 'transfer:start', expect.objectContaining({
        sourcePath: `/local/${file.name}`,
        destinationPath: `${currentPath}${file.name}`,
        direction: 'upload',
        connectionId: 's3-1',
        connectionType: 's3',
        bucket: 'uploads',
      }));
    }
    expect(useTransferStore.getState().transfers.map((transfer) => transfer.id)).toEqual([
      'transfer-1', 'transfer-2',
    ]);
  });

  it('adds directory transfer batches returned by the main process', async () => {
    const directory = nativeFile('photos', '/local/photos', '');
    const batch: TransferItem[] = ['first.jpg', 'second.jpg'].map((name, index) => ({
      id: `photo-${index}`,
      batchId: 'photos-batch',
      fileName: name,
      sourcePath: `/local/photos/${name}`,
      destinationPath: `/incoming/photos/${name}`,
      direction: 'upload',
      connectionId: 'sftp-1',
      connectionType: 'sftp',
      size: 100,
      bytesTransferred: 0,
      status: 'queued',
      speed: 0,
      retryCount: 0,
    }));
    vi.mocked(window.api.invoke).mockResolvedValue(batch);

    fireEvent.drop(renderDropTarget(), { dataTransfer: dataTransfer([directory]) });

    await waitFor(() => expect(useTransferStore.getState().transfers).toEqual(batch));
    expect(window.api.invoke).toHaveBeenCalledTimes(1);
    expect(window.api.invoke).toHaveBeenCalledWith('transfer:start', expect.objectContaining({
      sourcePath: '/local/photos',
      destinationPath: '/incoming/photos',
    }));
  });

  it('reports a file without a native path instead of silently skipping it', async () => {
    const file = new File(['hello'], 'unavailable.txt');

    fireEvent.drop(renderDropTarget(), { dataTransfer: dataTransfer([file]) });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Upload failed:.*unavailable\.txt/),
    ));
    expect(window.api.invoke).not.toHaveBeenCalled();
    expect(useTransferStore.getState().transfers).toHaveLength(0);
  });

  it('reports native path extraction errors', async () => {
    vi.mocked(window.api.getPathForFile).mockImplementation(() => {
      throw new Error('Native file is unavailable');
    });

    fireEvent.drop(renderDropTarget(), {
      dataTransfer: dataTransfer([new File(['hello'], 'report.txt')]),
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Native file is unavailable'),
    ));
    expect(window.api.invoke).not.toHaveBeenCalled();
  });

  it('reports transfer failures without adding a phantom queued transfer', async () => {
    vi.mocked(window.api.invoke).mockRejectedValue(new Error('Connection closed'));

    fireEvent.drop(renderDropTarget(), {
      dataTransfer: dataTransfer([nativeFile('report.txt', '/local/report.txt')]),
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Upload failed: Connection closed'));
    expect(useTransferStore.getState().transfers).toHaveLength(0);
  });

  it('continues accepting authenticated internal drags from the local pane', async () => {
    const drop = dataTransfer([], { 'application/aether-transfer': localPayload() });
    beginInternalDrag(drop);

    fireEvent.drop(renderDropTarget(), { dataTransfer: drop });

    await waitFor(() => expect(useTransferStore.getState().transfers).toHaveLength(1));
    expect(window.api.invoke).toHaveBeenCalledWith('transfer:start', expect.objectContaining({
      sourcePath: '/local/notes.txt',
      destinationPath: '/incoming/notes.txt',
      direction: 'upload',
    }));
    expect(window.api.getPathForFile).not.toHaveBeenCalled();
  });

  it('rejects forged internal payloads even when the drop also carries a native file', () => {
    const drop = dataTransfer([nativeFile('real.txt', '/local/real.txt')], {
      'application/aether-transfer': localPayload(),
    });

    fireEvent.drop(renderDropTarget(), { dataTransfer: drop });

    expect(window.api.invoke).not.toHaveBeenCalled();
    expect(window.api.getPathForFile).not.toHaveBeenCalled();
    expect(useTransferStore.getState().transfers).toHaveLength(0);
  });

  it('does not convert an external URI payload into an upload path', () => {
    fireEvent.drop(renderDropTarget(), {
      dataTransfer: dataTransfer([], { 'text/uri-list': 'file:///local/private.txt' }),
    });

    expect(window.api.invoke).not.toHaveBeenCalled();
    expect(window.api.getPathForFile).not.toHaveBeenCalled();
    expect(useTransferStore.getState().transfers).toHaveLength(0);
  });
});

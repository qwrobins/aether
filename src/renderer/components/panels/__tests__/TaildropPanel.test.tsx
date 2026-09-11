// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { TaildropPanel } from '../TaildropPanel';
import { useTaildropStore } from '@/stores/taildropStore';
import { useTransferStore } from '@/stores/transferStore';
import { endInternalDrag } from '@/lib/drag-guard';
import type { TaildropTarget } from '@shared/types/taildrop';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const target: TaildropTarget = { id: 'device-1', name: 'Laptop', status: 'available' };

async function dropOnDevice(...files: File[]) {
  render(<TaildropPanel />);
  const name = await screen.findByText('Laptop');
  const card = name.closest('[class*="group"]');
  expect(card).not.toBeNull();
  fireEvent.drop(card as Element, {
    dataTransfer: { files, types: ['Files'], getData: () => '' },
  });
}

describe('TaildropPanel native file drops', () => {
  beforeEach(() => {
    endInternalDrag();
    useTaildropStore.setState(useTaildropStore.getInitialState());
    useTransferStore.setState({ transfers: [] });
    let transferCount = 0;
    window.api.invoke = vi.fn().mockImplementation(async (channel: string) => {
      if (channel === 'taildrop:status') return { status: 'available', platform: 'linux' };
      if (channel === 'taildrop:list-targets') return [target];
      if (channel === 'transfer:start') return `transfer-${++transferCount}`;
      throw new Error(`Unexpected channel: ${channel}`);
    });
  });

  it('queues a native file that has no legacy File.path', async () => {
    const file = new File(['hello'], 'hello.txt');
    window.api.getPathForFile = vi.fn().mockReturnValue('/local/hello.txt');

    await dropOnDevice(file);

    await waitFor(() => expect(useTransferStore.getState().transfers).toHaveLength(1));
    expect(window.api.getPathForFile).toHaveBeenCalledWith(file);
    expect(window.api.invoke).toHaveBeenCalledWith('transfer:start', expect.objectContaining({
      sourcePath: '/local/hello.txt',
      destinationPath: target.id,
      connectionType: 'taildrop',
      direction: 'upload',
    }));
    expect(toast.success).toHaveBeenCalledWith('Queued 1 file for Laptop');
  });

  it('reports inaccessible native files without claiming they were queued', async () => {
    window.api.getPathForFile = vi.fn().mockReturnValue('');

    await dropOnDevice(new File(['hello'], 'hello.txt'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Taildrop send failed:.*hello\.txt/),
    ));
    expect(window.api.invoke).not.toHaveBeenCalledWith('transfer:start', expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each(['empty path', 'resolver error'])(
    'queues the accessible files before and after a file with an %s',
    async (failure) => {
      const first = new File(['first'], 'first.txt');
      const unavailable = new File(['unavailable'], 'unavailable.txt');
      const last = new File(['last'], 'last.txt');
      window.api.getPathForFile = vi.fn((file: File) => {
        if (file === unavailable) {
          if (failure === 'resolver error') throw new Error('Native file is unavailable');
          return '';
        }
        return `/local/${file.name}`;
      });

      await dropOnDevice(first, unavailable, last);

      await waitFor(() => expect(useTransferStore.getState().transfers).toHaveLength(2));
      expect(window.api.getPathForFile).toHaveBeenCalledTimes(3);
      expect(useTransferStore.getState().transfers.map((transfer) => transfer.sourcePath)).toEqual([
        '/local/first.txt', '/local/last.txt',
      ]);
      expect(window.api.invoke).not.toHaveBeenCalledWith('transfer:start', expect.objectContaining({
        sourcePath: '/local/unavailable.txt',
      }));
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Taildrop send failed:.*unavailable\.txt/),
      );
      expect(toast.success).toHaveBeenCalledWith('Queued 2 files for Laptop');
    },
  );
});

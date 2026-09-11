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

async function dropOnDevice(file: File) {
  render(<TaildropPanel />);
  const name = await screen.findByText('Laptop');
  const card = name.closest('[class*="group"]');
  expect(card).not.toBeNull();
  fireEvent.drop(card as Element, {
    dataTransfer: { files: [file], types: ['Files'], getData: () => '' },
  });
}

describe('TaildropPanel native file drops', () => {
  beforeEach(() => {
    endInternalDrag();
    useTaildropStore.setState(useTaildropStore.getInitialState());
    useTransferStore.setState({ transfers: [] });
    window.api.invoke = vi.fn().mockImplementation(async (channel: string) => {
      if (channel === 'taildrop:status') return { status: 'available', platform: 'linux' };
      if (channel === 'taildrop:list-targets') return [target];
      if (channel === 'transfer:start') return 'transfer-1';
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
});

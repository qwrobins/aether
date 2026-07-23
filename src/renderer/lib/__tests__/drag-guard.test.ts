import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_DRAG_ENTRIES,
  MAX_DRAG_NAME_LENGTH,
  MAX_DRAG_PATH_LENGTH,
  MAX_DRAG_PAYLOAD_LENGTH,
  beginInternalDrag,
  consumeInternalDrag,
  endInternalDrag,
  isInternalDrag,
  parseDragTransferPayload,
} from '../drag-guard';

function mockDataTransfer(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? '',
  };
}

describe('drag-guard', () => {
  afterEach(() => {
    endInternalDrag();
  });

  it('tracks drags that begin inside this window', () => {
    expect(isInternalDrag()).toBe(false);
    beginInternalDrag(mockDataTransfer());
    expect(isInternalDrag()).toBe(true);
    endInternalDrag();
    expect(isInternalDrag()).toBe(false);
  });

  it('consumeInternalDrag accepts only the matching per-drag token and clears it', () => {
    expect(consumeInternalDrag(mockDataTransfer())).toBe(false);

    const dt = mockDataTransfer();
    beginInternalDrag(dt);
    expect(consumeInternalDrag(dt)).toBe(true);
    expect(isInternalDrag()).toBe(false);
    expect(consumeInternalDrag(dt)).toBe(false);
  });

  it('consumeInternalDrag rejects drops without the token data', () => {
    beginInternalDrag(mockDataTransfer());
    // A forged drop carries no token entry in its DataTransfer.
    expect(consumeInternalDrag(mockDataTransfer())).toBe(false);
    expect(isInternalDrag()).toBe(false);
  });

  it('consumeInternalDrag rejects a stale token from a previous drag', () => {
    const first = mockDataTransfer();
    beginInternalDrag(first);
    const staleToken = first.getData('application/aether-drag-token');
    endInternalDrag();

    beginInternalDrag(mockDataTransfer());
    expect(
      consumeInternalDrag(mockDataTransfer({ 'application/aether-drag-token': staleToken })),
    ).toBe(false);
  });

  it('parses a valid transfer payload', () => {
    const raw = JSON.stringify({
      panelType: 'local',
      entries: [{ name: 'a.txt', path: '/home/a.txt', size: 12, isDirectory: false }],
    });

    expect(parseDragTransferPayload(raw)).toEqual({
      panelType: 'local',
      entries: [{ name: 'a.txt', path: '/home/a.txt', size: 12, isDirectory: false }],
    });
  });

  it('rejects payloads that are not well-formed transfer payloads', () => {
    expect(parseDragTransferPayload('not json')).toBeNull();
    expect(parseDragTransferPayload('null')).toBeNull();
    expect(parseDragTransferPayload('42')).toBeNull();
    expect(parseDragTransferPayload('[]')).toBeNull();
    expect(parseDragTransferPayload(JSON.stringify({ panelType: 'remote' }))).toBeNull();
    expect(
      parseDragTransferPayload(JSON.stringify({ panelType: 'elsewhere', entries: [] })),
    ).toBeNull();
    expect(
      parseDragTransferPayload(JSON.stringify({ panelType: 'local', entries: 'oops' })),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({ panelType: 'local', entries: [{ name: 1, path: '/x', isDirectory: false }] }),
      ),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({ panelType: 'local', entries: [{ name: 'x', isDirectory: false }] }),
      ),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({
          panelType: 'remote',
          entries: [{ name: 'x', path: '/x', isDirectory: 'yes' }],
        }),
      ),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({
          panelType: 'local',
          entries: [{ name: 'x', path: '/x', size: 'big', isDirectory: false }],
        }),
      ),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({
          panelType: 'local',
          entries: [{ name: 'x', path: '/x', size: -1, isDirectory: false }],
        }),
      ),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({
          panelType: 'local',
          entries: [{ name: 'x', path: '/x', size: Number.MAX_SAFE_INTEGER + 1, isDirectory: false }],
        }),
      ),
    ).toBeNull();
  });

  it('rejects oversized raw payloads and over-long names/paths', () => {
    expect(parseDragTransferPayload('x'.repeat(MAX_DRAG_PAYLOAD_LENGTH + 1))).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({
          panelType: 'local',
          entries: [{ name: 'n'.repeat(MAX_DRAG_NAME_LENGTH + 1), path: '/x', isDirectory: false }],
        }),
      ),
    ).toBeNull();
    expect(
      parseDragTransferPayload(
        JSON.stringify({
          panelType: 'local',
          entries: [{ name: 'x', path: `/${'p'.repeat(MAX_DRAG_PATH_LENGTH)}`, isDirectory: false }],
        }),
      ),
    ).toBeNull();
  });

  it('rejects payloads over the entry cap', () => {
    const entries = Array.from({ length: MAX_DRAG_ENTRIES + 1 }, (_, i) => ({
      name: `f${i}`,
      path: `/f${i}`,
      isDirectory: false,
    }));

    expect(
      parseDragTransferPayload(JSON.stringify({ panelType: 'remote', entries })),
    ).toBeNull();
  });
});

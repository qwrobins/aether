import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_DRAG_ENTRIES,
  beginInternalDrag,
  consumeInternalDrag,
  endInternalDrag,
  isInternalDrag,
  parseDragTransferPayload,
} from '../drag-guard';

describe('drag-guard', () => {
  afterEach(() => {
    endInternalDrag();
  });

  it('tracks drags that begin inside this window', () => {
    expect(isInternalDrag()).toBe(false);
    beginInternalDrag();
    expect(isInternalDrag()).toBe(true);
    endInternalDrag();
    expect(isInternalDrag()).toBe(false);
  });

  it('consumeInternalDrag reports the token once and clears it', () => {
    expect(consumeInternalDrag()).toBe(false);
    beginInternalDrag();
    expect(consumeInternalDrag()).toBe(true);
    expect(isInternalDrag()).toBe(false);
    expect(consumeInternalDrag()).toBe(false);
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

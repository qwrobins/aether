/**
 * Guards against forged `application/aether-transfer` drag payloads.
 *
 * Content outside this window (e.g. a malicious web page) can set the same
 * custom MIME type on its own drags and trick a user into dropping
 * attacker-chosen local paths into Aether. A drag that begins inside this
 * window stores an unpredictable per-drag token in the DataTransfer; drop
 * handlers must ignore the custom payload when the token is absent or does
 * not match. External forgers cannot read or guess the token.
 */

const DRAG_TOKEN_MIME = 'application/aether-drag-token';

/** Minimal DataTransfer surface so tests can use plain mocks. */
interface DragDataWriter {
  setData(type: string, value: string): void;
}

interface DragDataReader {
  getData(type: string): string;
}

let activeToken: string | null = null;

export function beginInternalDrag(dataTransfer: DragDataWriter): void {
  const token = crypto.randomUUID();
  activeToken = token;
  try {
    dataTransfer.setData(DRAG_TOKEN_MIME, token);
  } catch {
    activeToken = null;
  }
}

/** Lifecycle fallback: dragend always fires on the drag source. */
export function endInternalDrag(): void {
  activeToken = null;
}

export function isInternalDrag(): boolean {
  return activeToken !== null;
}

/**
 * Returns whether the current drop carries this window's per-drag token and
 * clears it. A drop always ends the drag gesture, so the token must not
 * outlive it.
 */
export function consumeInternalDrag(dataTransfer: DragDataReader): boolean {
  const token = activeToken;
  activeToken = null;
  if (!token) return false;
  try {
    return dataTransfer.getData(DRAG_TOKEN_MIME) === token;
  } catch {
    return false;
  }
}

export const MAX_DRAG_ENTRIES = 1000;
/** Upper bound on the serialized payload size (characters). */
export const MAX_DRAG_PAYLOAD_LENGTH = 256 * 1024;
export const MAX_DRAG_NAME_LENGTH = 255;
export const MAX_DRAG_PATH_LENGTH = 4096;

export interface DragTransferEntry {
  name: string;
  path: string;
  size?: number;
  isDirectory: boolean;
}

export interface DragTransferPayload {
  panelType: 'local' | 'remote';
  entries: DragTransferEntry[];
}

export function parseDragTransferPayload(raw: string): DragTransferPayload | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_DRAG_PAYLOAD_LENGTH) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const { panelType, entries } = parsed as { panelType?: unknown; entries?: unknown };
  if (panelType !== 'local' && panelType !== 'remote') return null;
  if (!Array.isArray(entries) || entries.length > MAX_DRAG_ENTRIES) return null;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.name !== 'string' ||
      candidate.name.length === 0 ||
      candidate.name.length > MAX_DRAG_NAME_LENGTH
    ) {
      return null;
    }
    if (
      typeof candidate.path !== 'string' ||
      candidate.path.length === 0 ||
      candidate.path.length > MAX_DRAG_PATH_LENGTH
    ) {
      return null;
    }
    if (
      candidate.size !== undefined &&
      (typeof candidate.size !== 'number' ||
        !Number.isSafeInteger(candidate.size) ||
        candidate.size < 0)
    ) {
      return null;
    }
    if (typeof candidate.isDirectory !== 'boolean') return null;
  }

  return { panelType, entries: entries as DragTransferEntry[] };
}

/**
 * Guards against forged `application/aether-transfer` drag payloads.
 *
 * Content outside this window (e.g. a malicious web page) can set the same
 * custom MIME type on its own drags and trick a user into dropping
 * attacker-chosen local paths into Aether. A drag that begins inside this
 * window sets a module-level token; drop handlers must ignore the custom
 * payload when the token is not set.
 */

let internalDragActive = false;

export function beginInternalDrag(): void {
  internalDragActive = true;
}

export function endInternalDrag(): void {
  internalDragActive = false;
}

export function isInternalDrag(): boolean {
  return internalDragActive;
}

/**
 * Returns whether the current drag began inside this window and clears the
 * token. A drop always ends the drag gesture, so the token must not outlive it.
 */
export function consumeInternalDrag(): boolean {
  const active = internalDragActive;
  internalDragActive = false;
  return active;
}

export const MAX_DRAG_ENTRIES = 1000;

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
    if (typeof candidate.name !== 'string' || typeof candidate.path !== 'string') return null;
    if (candidate.size !== undefined && typeof candidate.size !== 'number') return null;
    if (typeof candidate.isDirectory !== 'boolean') return null;
  }

  return { panelType, entries: entries as DragTransferEntry[] };
}

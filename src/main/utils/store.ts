import { chmodSync, readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { app } from 'electron';

interface StoreSchema {
  connections: Record<string, unknown>[];
}

const defaults: StoreSchema = {
  connections: [],
};

function getStorePath(): string {
  return join(app.getPath('userData'), 'connections.json');
}

export function readStore(): StoreSchema {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return { ...defaults };
  }
  try {
    const raw = readFileSync(storePath, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch (error) {
    console.warn(
      '[Aether] Failed to read connections store; falling back to defaults:',
      error instanceof Error ? error.message : error,
    );
    return { ...defaults };
  }
}

export function writeStore(data: StoreSchema): void {
  const storePath = getStorePath();
  const dir = dirname(storePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  // Write to a temp file and rename over the target so a crash mid-write
  // cannot leave a truncated credential store behind.
  const tempPath = `${storePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  renameSync(tempPath, storePath);
  chmodSync(storePath, 0o600);
}

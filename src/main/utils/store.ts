import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
  } catch {
    return { ...defaults };
  }
}

export function writeStore(data: StoreSchema): void {
  const storePath = getStorePath();
  const dir = dirname(storePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
}

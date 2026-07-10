import SftpClient from 'ssh2-sftp-client';
import { homedir } from 'node:os';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';
import type { SftpConnectionProfile } from '@shared/types/connection';
import type {
  SftpDeletePathResult,
  SftpDeleteResult,
  SftpTransferClient,
} from '@shared/types/transfer';

interface RecursiveListOptions {
  maxFiles?: number;
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return filePath.replace('~', homedir());
  }
  return filePath;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function assertRecursiveLimit(count: number, maxFiles: number | undefined): void {
  if (maxFiles !== undefined && count > maxFiles) {
    throw new Error(`Directory expansion exceeded the safe limit of ${maxFiles} files`);
  }
}

function formatHostKeyFingerprint(hashedKey: string): string {
  const digest = Buffer.from(hashedKey, 'hex').toString('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

export class UntrustedSshHostKeyError extends Error {
  constructor(public readonly fingerprint: string) {
    super(`SSH host key is not trusted: ${fingerprint}`);
    this.name = 'UntrustedSshHostKeyError';
  }
}

export class SftpService {
  private clients: Map<string, SftpClient> = new Map();
  private profiles: Map<string, SftpConnectionProfile> = new Map();

  private async createClient(profile: SftpConnectionProfile): Promise<SftpClient> {
    const client = new SftpClient();
    let observedFingerprint: string | undefined;
    const expectedFingerprint = profile.hostKeyFingerprint?.trim();
    const config = await this.buildConfig(profile, (fingerprint) => {
      observedFingerprint = fingerprint;
    });

    try {
      await client.connect(config);
      return client;
    } catch (error) {
      try {
        await client.end();
      } catch {
        // The rejected handshake may already have closed the client.
      }

      if (observedFingerprint && !expectedFingerprint) {
        throw new UntrustedSshHostKeyError(observedFingerprint);
      }
      if (
        observedFingerprint &&
        expectedFingerprint &&
        observedFingerprint !== expectedFingerprint
      ) {
        throw new Error(
          `SSH host key mismatch. Expected ${expectedFingerprint}, received ${observedFingerprint}.`,
        );
      }
      throw error;
    }
  }

  private async buildConfig(
    profile: SftpConnectionProfile,
    onFingerprint: (fingerprint: string) => void,
  ): Promise<SftpClient.ConnectOptions> {
    const expectedFingerprint = profile.hostKeyFingerprint?.trim();
    const config: SftpClient.ConnectOptions = {
      host: profile.host,
      port: profile.port || 22,
      username: profile.username,
      hostHash: 'sha256',
      hostVerifier: (hashedKey: string) => {
        const fingerprint = formatHostKeyFingerprint(hashedKey);
        onFingerprint(fingerprint);
        return Boolean(expectedFingerprint && fingerprint === expectedFingerprint);
      },
    };

    if (profile.authMethod === 'password' && profile.password) {
      config.password = profile.password;
    } else if (profile.authMethod === 'key' && profile.privateKeyPath) {
      const fs = await import('node:fs/promises');
      config.privateKey = await fs.readFile(expandTilde(profile.privateKeyPath), 'utf-8');
      if (profile.passphrase) {
        config.passphrase = profile.passphrase;
      }
    }

    return config;
  }

  async connect(connectionId: string, profile: SftpConnectionProfile): Promise<void> {
    await this.disconnect(connectionId);
    const client = await this.createClient(profile);
    this.clients.set(connectionId, client);
    this.profiles.set(connectionId, profile);
  }

  async disconnect(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    this.clients.delete(connectionId);
    this.profiles.delete(connectionId);
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.warn(`[Aether] Failed to close SFTP connection ${connectionId}:`, error);
      }
    }
  }

  getClient(connectionId: string): SftpClient {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Not connected');
    return client;
  }

  async createTransferClient(connectionId: string): Promise<SftpTransferClient> {
    const profile = this.profiles.get(connectionId);
    if (!profile) throw new Error('Not connected');

    const client = await this.createClient(profile);
    let closed = false;

    const close = async () => {
      if (closed) return;
      closed = true;
      await client.end();
    };

    return {
      mkdir: async (path, recursive) => {
        await client.mkdir(path, recursive);
      },
      fastPut: async (sourcePath, destinationPath, options) => {
        await client.fastPut(sourcePath, destinationPath, options);
      },
      stat: client.stat.bind(client),
      fastGet: async (sourcePath, destinationPath, options) => {
        await client.fastGet(sourcePath, destinationPath, options);
      },
      abort: close,
      disconnect: close,
    };
  }

  async list(connectionId: string, remotePath: string): Promise<DirectoryListing> {
    const client = this.getClient(connectionId);
    const items = await client.list(remotePath);

    const entries: FileEntry[] = items
      .filter(item => item.name !== '.' && item.name !== '..')
      .map(item => ({
        name: item.name,
        path: remotePath === '/' ? `/${item.name}` : `${remotePath}/${item.name}`,
        size: item.size,
        isDirectory: item.type === 'd',
        modifiedAt: new Date(item.modifyTime).toISOString(),
        permissions: item.rights ? `${item.rights.user}${item.rights.group}${item.rights.other}` : undefined,
        owner: item.owner ? String(item.owner) : undefined,
      }));

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = remotePath === '/' ? null : remotePath.replace(/\/[^/]+\/?$/, '') || '/';

    return { path: remotePath, entries, parentPath };
  }

  async *walkFilesRecursive(
    connectionId: string,
    dirPath: string,
    options: RecursiveListOptions = {},
  ): AsyncGenerator<{ path: string; relativePath: string; size: number }> {
    const client = this.getClient(connectionId);
    let fileCount = 0;

    const walk = async function* (
      currentDir: string,
      relativePrefix: string,
    ): AsyncGenerator<{ path: string; relativePath: string; size: number }> {
      const items = await client.list(currentDir);
      for (const item of items) {
        if (item.name === '.' || item.name === '..') continue;
        const fullPath = currentDir === '/' ? `/${item.name}` : `${currentDir}/${item.name}`;
        const relativePath = relativePrefix ? `${relativePrefix}/${item.name}` : item.name;
        if (item.type === 'd') {
          yield* walk(fullPath, relativePath);
        } else {
          fileCount++;
          assertRecursiveLimit(fileCount, options.maxFiles);
          yield { path: fullPath, relativePath, size: item.size || 0 };
        }
      }
    };

    yield* walk(dirPath, '');
  }

  /** Recursively list all files (not directories) under a path */
  async listFilesRecursive(
    connectionId: string,
    dirPath: string,
  ): Promise<Array<{ path: string; relativePath: string; size: number }>> {
    const results: Array<{ path: string; relativePath: string; size: number }> = [];
    for await (const file of this.walkFilesRecursive(connectionId, dirPath)) {
      results.push(file);
    }
    return results;
  }

  async mkdir(connectionId: string, remotePath: string): Promise<void> {
    const client = this.getClient(connectionId);
    await client.mkdir(remotePath, true);
  }

  async remove(connectionId: string, paths: string[]): Promise<SftpDeleteResult> {
    const client = this.getClient(connectionId);
    const results: SftpDeletePathResult[] = [];

    for (const p of paths) {
      try {
        const stat = await client.stat(p);
        if (stat.isDirectory) {
          await client.rmdir(p, true);
        } else {
          await client.delete(p);
        }
        results.push({ path: p, success: true });
      } catch (err) {
        const error = getErrorMessage(err);
        console.error(`[Aether] Failed to delete ${p}:`, err);
        results.push({ path: p, success: false, error });
      }
    }

    const failedCount = results.filter((result) => !result.success).length;
    return {
      results,
      deletedCount: results.length - failedCount,
      failedCount,
    };
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    const client = this.getClient(connectionId);
    await client.rename(oldPath, newPath);
  }
}

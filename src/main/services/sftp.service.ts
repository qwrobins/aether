import SftpClient from 'ssh2-sftp-client';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';
import type { SftpConnectionProfile } from '@shared/types/connection';

export class SftpService {
  private clients: Map<string, SftpClient> = new Map();

  async connect(connectionId: string, profile: SftpConnectionProfile): Promise<void> {
    const client = new SftpClient();

    const config: SftpClient.ConnectOptions = {
      host: profile.host,
      port: profile.port || 22,
      username: profile.username,
    };

    if (profile.authMethod === 'password' && profile.password) {
      config.password = profile.password;
    } else if (profile.authMethod === 'key' && profile.privateKeyPath) {
      const fs = await import('node:fs/promises');
      config.privateKey = await fs.readFile(profile.privateKeyPath, 'utf-8');
      if (profile.passphrase) {
        config.passphrase = profile.passphrase;
      }
    }

    await client.connect(config);
    this.clients.set(connectionId, client);
  }

  async disconnect(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (client) {
      await client.end();
      this.clients.delete(connectionId);
    }
  }

  getClient(connectionId: string): SftpClient {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Not connected');
    return client;
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

  async mkdir(connectionId: string, remotePath: string): Promise<void> {
    const client = this.getClient(connectionId);
    await client.mkdir(remotePath, true);
  }

  async remove(connectionId: string, paths: string[]): Promise<void> {
    const client = this.getClient(connectionId);
    for (const p of paths) {
      try {
        const stat = await client.stat(p);
        if (stat.isDirectory) {
          await client.rmdir(p, true);
        } else {
          await client.delete(p);
        }
      } catch (err) {
        console.error(`Failed to delete ${p}:`, err);
      }
    }
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    const client = this.getClient(connectionId);
    await client.rename(oldPath, newPath);
  }
}

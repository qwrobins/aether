import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';
import type { S3ConnectionProfile } from '@shared/types/connection';

export class S3Service {
  private clients: Map<string, S3Client> = new Map();

  connect(connectionId: string, profile: S3ConnectionProfile): void {
    const client = new S3Client({
      region: profile.region,
      credentials: {
        accessKeyId: profile.accessKeyId,
        secretAccessKey: profile.secretAccessKey,
      },
      ...(profile.endpoint
        ? { endpoint: profile.endpoint, forcePathStyle: true }
        : {}),
    });
    this.clients.set(connectionId, client);
  }

  disconnect(connectionId: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      client.destroy();
      this.clients.delete(connectionId);
    }
  }

  getClient(connectionId: string): S3Client {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Not connected');
    return client;
  }

  async listBuckets(connectionId: string): Promise<string[]> {
    const client = this.getClient(connectionId);
    const result = await client.send(new ListBucketsCommand({}));
    return (result.Buckets || []).map((b) => b.Name!).filter(Boolean);
  }

  async listObjects(
    connectionId: string,
    bucket: string,
    prefix: string,
  ): Promise<DirectoryListing> {
    const client = this.getClient(connectionId);
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: '/',
      }),
    );

    const entries: FileEntry[] = [];

    // Folders (CommonPrefixes)
    for (const cp of result.CommonPrefixes || []) {
      const fullPrefix = cp.Prefix!;
      const name = fullPrefix.slice(prefix.length).replace(/\/$/, '');
      if (name) {
        entries.push({
          name,
          path: fullPrefix,
          size: 0,
          isDirectory: true,
          modifiedAt: new Date().toISOString(),
        });
      }
    }

    // Files (Contents)
    for (const obj of result.Contents || []) {
      const key = obj.Key!;
      if (key === prefix) continue; // skip the prefix itself
      const name = key.slice(prefix.length);
      if (!name || name.endsWith('/')) continue;
      entries.push({
        name,
        path: key,
        size: obj.Size || 0,
        isDirectory: false,
        modifiedAt: obj.LastModified?.toISOString() || new Date().toISOString(),
      });
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = prefix ? prefix.replace(/[^/]+\/$/, '') : null;

    return { path: prefix, entries, parentPath };
  }

  async deleteObject(
    connectionId: string,
    bucket: string,
    key: string,
  ): Promise<void> {
    const client = this.getClient(connectionId);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async createFolder(
    connectionId: string,
    bucket: string,
    key: string,
  ): Promise<void> {
    const client = this.getClient(connectionId);
    const folderKey = key.endsWith('/') ? key : key + '/';
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: folderKey, Body: '' }),
    );
  }
}

import {
  S3Client,
  type S3ClientConfig,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { IAMClient, type IAMClientConfig, ListRolesCommand } from '@aws-sdk/client-iam';
import { fromTemporaryCredentials, fromIni } from '@aws-sdk/credential-providers';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';
import type { S3ConnectionProfile } from '@shared/types/connection';

interface RecursiveListOptions {
  maxFiles?: number;
}

function assertRecursiveLimit(count: number, maxFiles: number | undefined): void {
  if (maxFiles !== undefined && count > maxFiles) {
    throw new Error(`S3 prefix expansion exceeded the safe limit of ${maxFiles} objects`);
  }
}

function normalizeRecursivePrefix(prefix: string): string {
  if (prefix === '') return '';
  return prefix.endsWith('/') ? prefix : prefix + '/';
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Custom S3 endpoints (e.g. MinIO) must use TLS so credentials are not sent in
 * cleartext; plain http is only allowed for local loopback development servers.
 */
function assertSecureS3Endpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`Invalid S3 endpoint URL: ${endpoint}`);
  }

  if (url.protocol === 'https:') {
    return;
  }
  if (url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return;
  }
  throw new Error(
    `Insecure S3 endpoint "${endpoint}": custom endpoints must use https (http is only allowed for localhost)`,
  );
}

export class S3Service {
  private clients: Map<string, S3Client> = new Map();
  private regions: Map<string, string> = new Map();

  connect(connectionId: string, profile: S3ConnectionProfile): void {
    this.disconnect(connectionId);
    const baseConfig: S3ClientConfig = {
      region: profile.region,
      followRegionRedirects: true,
    };

    if (profile.endpoint) {
      assertSecureS3Endpoint(profile.endpoint);
      baseConfig.endpoint = profile.endpoint;
      baseConfig.forcePathStyle = true;
    }

    if (profile.authMethod === 'credentials') {
      if (!profile.accessKeyId || !profile.secretAccessKey) {
        throw new Error('Access key and secret key are required for credentials auth');
      }
      baseConfig.credentials = {
        accessKeyId: profile.accessKeyId,
        secretAccessKey: profile.secretAccessKey,
      };
    } else if (profile.authMethod === 'iam-role') {
      if (!profile.roleArn) {
        throw new Error('Role ARN is required for IAM role auth');
      }
      // Use STS AssumeRole with optional source credentials
      const params: Parameters<typeof fromTemporaryCredentials>[0] = {
        clientConfig: { region: profile.region },
        params: {
          RoleArn: profile.roleArn,
          RoleSessionName: `aether-${Date.now()}`,
          ...(profile.externalId ? { ExternalId: profile.externalId } : {}),
        },
      };
      if (profile.sourceAccessKeyId && profile.sourceSecretAccessKey) {
        params.masterCredentials = {
          accessKeyId: profile.sourceAccessKeyId,
          secretAccessKey: profile.sourceSecretAccessKey,
        };
      }
      baseConfig.credentials = fromTemporaryCredentials(params);
    } else if (profile.authMethod === 'profile') {
      if (!profile.awsProfile) {
        throw new Error('AWS profile name is required');
      }
      baseConfig.credentials = fromIni({ profile: profile.awsProfile });
    }
    // 'default-chain' — no credentials specified, SDK uses default provider chain

    const client = new S3Client(baseConfig);
    this.clients.set(connectionId, client);
    this.regions.set(connectionId, profile.region);
  }

  disconnect(connectionId: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      client.destroy();
      this.clients.delete(connectionId);
      this.regions.delete(connectionId);
    }
  }

  getClient(connectionId: string): S3Client {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Not connected');
    return client;
  }

  async listAwsProfiles(): Promise<string[]> {
    const profiles = new Set<string>();
    const awsDir = path.join(homedir(), '.aws');

    for (const file of ['credentials', 'config']) {
      try {
        const content = await readFile(path.join(awsDir, file), 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          // [profile foo] in config, [foo] in credentials
          let match = trimmed.match(/^\[profile\s+(.+)\]$/);
          if (!match) match = trimmed.match(/^\[(.+)\]$/);
          if (match && match[1] !== 'default') {
            profiles.add(match[1]);
          } else if (match) {
            profiles.add('default');
          }
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    return Array.from(profiles).sort();
  }

  async listRoles(
    region: string,
    accessKeyId?: string,
    secretAccessKey?: string,
  ): Promise<Array<{ arn: string; name: string }>> {
    const config: IAMClientConfig = { region };
    if (accessKeyId && secretAccessKey) {
      config.credentials = { accessKeyId, secretAccessKey };
    }

    const iam = new IAMClient(config);
    try {
      const roles: Array<{ arn: string; name: string }> = [];
      let marker: string | undefined;

      do {
        const result = await iam.send(
          new ListRolesCommand({ Marker: marker, MaxItems: 100 }),
        );
        for (const role of result.Roles || []) {
          if (role.Arn && role.RoleName) {
            roles.push({ arn: role.Arn, name: role.RoleName });
          }
        }
        marker = result.IsTruncated ? result.Marker : undefined;
      } while (marker);

      return roles.sort((a, b) => a.name.localeCompare(b.name));
    } finally {
      iam.destroy();
    }
  }

  async listBuckets(connectionId: string): Promise<string[]> {
    const client = this.getClient(connectionId);
    const result = await client.send(new ListBucketsCommand({}));
    // Return all buckets sorted alphabetically — cross-region access is
    // handled transparently by followRegionRedirects on the S3 client
    return (result.Buckets || [])
      .map((b) => b.Name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
  }

  async listObjects(
    connectionId: string,
    bucket: string,
    prefix: string,
    continuationToken?: string,
  ): Promise<DirectoryListing> {
    const client = this.getClient(connectionId);
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: '/',
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    const entries: FileEntry[] = [];

    for (const cp of result.CommonPrefixes || []) {
      const fullPrefix = cp.Prefix;
      if (!fullPrefix) continue;
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

    for (const obj of result.Contents || []) {
      const key = obj.Key;
      if (!key) continue;
      if (key === prefix) continue;
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

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = prefix ? prefix.replace(/[^/]+\/$/, '') : null;
    return {
      path: prefix,
      entries,
      parentPath,
      continuationToken: result.IsTruncated ? result.NextContinuationToken : undefined,
    };
  }

  async *walkObjectKeysRecursive(
    connectionId: string,
    bucket: string,
    prefix: string,
    options: RecursiveListOptions = {},
  ): AsyncGenerator<{ key: string; size: number }> {
    const client = this.getClient(connectionId);
    const normPrefix = normalizeRecursivePrefix(prefix);
    let continuationToken: string | undefined;
    let objectCount = 0;

    do {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normPrefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of result.Contents || []) {
        if (obj.Key && !obj.Key.endsWith('/')) {
          objectCount++;
          assertRecursiveLimit(objectCount, options.maxFiles);
          yield { key: obj.Key, size: obj.Size || 0 };
        }
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  /** List all object keys under a prefix (recursive, no delimiter) */
  async listObjectKeysRecursive(
    connectionId: string,
    bucket: string,
    prefix: string,
    maxFiles?: number,
  ): Promise<Array<{ key: string; size: number }>> {
    const results: Array<{ key: string; size: number }> = [];
    for await (const object of this.walkObjectKeysRecursive(connectionId, bucket, prefix)) {
      results.push(object);
      if (maxFiles !== undefined && results.length >= maxFiles) {
        break;
      }
    }

    return results;
  }

  async deleteObject(connectionId: string, bucket: string, key: string): Promise<void> {
    const client = this.getClient(connectionId);
    if (key.endsWith('/')) {
      await this.deletePrefixRecursive(client, bucket, key);
    } else {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  }

  /** Delete all objects under a prefix (for S3 "folder" deletion). */
  private async deletePrefixRecursive(
    client: S3Client,
    bucket: string,
    prefix: string,
  ): Promise<void> {
    const normPrefix = normalizeRecursivePrefix(prefix);
    let hasObjects = true;
    while (hasObjects) {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normPrefix,
          MaxKeys: 1000,
        }),
      );
      let batch = (result.Contents || [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));
      if (batch.length === 0) {
        hasObjects = false;
        continue;
      }

      const maxRetries = 3;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          }),
        );

        if (response.Errors && response.Errors.length > 0) {
          const failedKeys = response.Errors
            .filter((e) => e.Key)
            .map((e) => e.Key as string);
          const errorDetails = response.Errors
            .map((e) => `${e.Key}: ${e.Code} - ${e.Message}`)
            .join('; ');

          if (attempt < maxRetries && failedKeys.length > 0) {
            console.warn(
              `[Aether] S3 partial delete failure (attempt ${attempt + 1}/${maxRetries}), ` +
              `retrying ${failedKeys.length} key(s): ${errorDetails}`,
            );
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
            batch = failedKeys;
          } else {
            throw new Error(
              `S3 delete failed for ${failedKeys.length} object(s) after ${attempt + 1} attempt(s): ${errorDetails}`,
            );
          }
        } else {
          break;
        }
      }
    }
  }

  async createFolder(connectionId: string, bucket: string, key: string): Promise<void> {
    const client = this.getClient(connectionId);
    const folderKey = key.endsWith('/') ? key : key + '/';
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: folderKey, Body: '' }));
  }
}

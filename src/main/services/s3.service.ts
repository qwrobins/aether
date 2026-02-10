import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { IAMClient, ListRolesCommand } from '@aws-sdk/client-iam';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';
import type { S3ConnectionProfile } from '@shared/types/connection';

export class S3Service {
  private clients: Map<string, S3Client> = new Map();

  connect(connectionId: string, profile: S3ConnectionProfile): void {
    const baseConfig: Record<string, unknown> = {
      region: profile.region,
    };

    if (profile.endpoint) {
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
      const params: Record<string, unknown> = {
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
      baseConfig.credentials = fromTemporaryCredentials(params as any);
    }
    // 'default-chain' — no credentials specified, SDK uses default provider chain
    // (env vars, ~/.aws/credentials, EC2 instance role, etc.)

    const client = new S3Client(baseConfig as any);
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

  async listRoles(
    region: string,
    accessKeyId?: string,
    secretAccessKey?: string,
  ): Promise<Array<{ arn: string; name: string }>> {
    const config: Record<string, unknown> = { region };
    if (accessKeyId && secretAccessKey) {
      config.credentials = { accessKeyId, secretAccessKey };
    }

    const iam = new IAMClient(config as any);
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

    iam.destroy();
    return roles.sort((a, b) => a.name.localeCompare(b.name));
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

    for (const obj of result.Contents || []) {
      const key = obj.Key!;
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
    return { path: prefix, entries, parentPath };
  }

  async deleteObject(connectionId: string, bucket: string, key: string): Promise<void> {
    const client = this.getClient(connectionId);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async createFolder(connectionId: string, bucket: string, key: string): Promise<void> {
    const client = this.getClient(connectionId);
    const folderKey = key.endsWith('/') ? key : key + '/';
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: folderKey, Body: '' }));
  }
}

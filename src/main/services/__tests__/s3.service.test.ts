import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromIni, fromTemporaryCredentials } from '@aws-sdk/credential-providers';

const S3Client = vi.fn();
const IAMClient = vi.fn();

class ListBucketsCommand {
  constructor(public input: unknown) {}
}

class ListObjectsV2Command {
  constructor(public input: unknown) {}
}

class DeleteObjectCommand {
  constructor(public input: unknown) {}
}

class DeleteObjectsCommand {
  constructor(public input: unknown) {}
}

class PutObjectCommand {
  constructor(public input: unknown) {}
}

class ListRolesCommand {
  constructor(public input: unknown) {}
}

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
}));

vi.mock('@aws-sdk/client-iam', () => ({
  IAMClient,
  ListRolesCommand,
}));

vi.mock('@aws-sdk/credential-providers', () => ({
  fromTemporaryCredentials: vi.fn(() => 'temp-creds'),
  fromIni: vi.fn(() => 'ini-creds'),
}));

type S3ServiceInternals = {
  clients: Map<string, { send: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>;
};

describe('S3Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    S3Client.mockReset();
    IAMClient.mockReset();
  });

  it('connects with direct credentials and disconnects cleanly', async () => {
    const destroy = vi.fn();
    S3Client.mockImplementation(function S3ClientMock() {
      return { destroy };
    });

    const { S3Service } = await import('../s3.service');
    const service = new S3Service();

    service.connect('conn-1', {
      id: 'conn-1',
      name: 'Primary',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'credentials',
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    });

    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKIA123', secretAccessKey: 'secret' },
    }));
    expect(service.getClient('conn-1')).toBeTruthy();

    service.disconnect('conn-1');
    expect(destroy).toHaveBeenCalled();
    expect(() => service.getClient('conn-1')).toThrow('Not connected');
  });

  it('connects with profile and IAM role auth methods', async () => {
    S3Client.mockImplementation(function S3ClientMock() {
      return { destroy: vi.fn() };
    });

    const { S3Service } = await import('../s3.service');
    const service = new S3Service();

    service.connect('profile-conn', {
      id: 'profile-conn',
      name: 'Profile',
      type: 's3',
      region: 'us-west-2',
      authMethod: 'profile',
      awsProfile: 'work',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    });
    service.connect('role-conn', {
      id: 'role-conn',
      name: 'Role',
      type: 's3',
      region: 'us-east-2',
      authMethod: 'iam-role',
      roleArn: 'arn:aws:iam::123456789012:role/demo',
      externalId: 'ext-1',
      sourceAccessKeyId: 'source-key',
      sourceSecretAccessKey: 'source-secret',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    });

    expect(fromIni).toHaveBeenCalledWith({ profile: 'work' });
    expect(fromTemporaryCredentials).toHaveBeenCalledWith(expect.objectContaining({
      clientConfig: { region: 'us-east-2' },
      params: expect.objectContaining({ RoleArn: 'arn:aws:iam::123456789012:role/demo', ExternalId: 'ext-1' }),
      masterCredentials: { accessKeyId: 'source-key', secretAccessKey: 'source-secret' },
    }));
    expect(S3Client).toHaveBeenCalledTimes(2);
  });

  it('throws on missing auth requirements', async () => {
    const { S3Service } = await import('../s3.service');
    const service = new S3Service();

    expect(() => service.connect('bad-creds', {
      id: 'bad-creds',
      name: 'Bad Creds',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'credentials',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as never)).toThrow('Access key and secret key are required');

    expect(() => service.connect('bad-role', {
      id: 'bad-role',
      name: 'Bad Role',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'iam-role',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as never)).toThrow('Role ARN is required');

    expect(() => service.connect('bad-profile', {
      id: 'bad-profile',
      name: 'Bad Profile',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'profile',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as never)).toThrow('AWS profile name is required');
  });

  it('lists buckets, roles, creates folders, and deletes single objects', async () => {
    const client = {
      send: vi.fn()
        .mockResolvedValueOnce({ Buckets: [{ Name: 'zebra' }, { Name: undefined }, { Name: 'alpha' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      destroy: vi.fn(),
    };
    const iamDestroy = vi.fn();
    IAMClient.mockImplementation(function IAMClientMock() {
      return {
        send: vi.fn()
          .mockResolvedValueOnce({
            Roles: [{ Arn: 'arn:2', RoleName: 'Writer' }],
            IsTruncated: true,
            Marker: 'page-2',
          })
          .mockResolvedValueOnce({
            Roles: [{ Arn: 'arn:1', RoleName: 'Admin' }],
            IsTruncated: false,
          }),
        destroy: iamDestroy,
      };
    });

    const { S3Service } = await import('../s3.service');
    const service = new S3Service();
    (service as unknown as S3ServiceInternals).clients.set('conn-1', client);

    await expect(service.listBuckets('conn-1')).resolves.toEqual(['alpha', 'zebra']);
    await expect(service.listRoles('us-east-1')).resolves.toEqual([
      { arn: 'arn:1', name: 'Admin' },
      { arn: 'arn:2', name: 'Writer' },
    ]);
    await service.createFolder('conn-1', 'bucket', 'photos');
    await service.deleteObject('conn-1', 'bucket', 'photos/a.jpg');

    expect(client.send).toHaveBeenNthCalledWith(2, expect.any(PutObjectCommand));
    expect((client.send.mock.calls[1][0] as PutObjectCommand).input).toMatchObject({ Bucket: 'bucket', Key: 'photos/' });
    expect(client.send).toHaveBeenNthCalledWith(3, expect.any(DeleteObjectCommand));
    expect((client.send.mock.calls[2][0] as DeleteObjectCommand).input).toMatchObject({ Bucket: 'bucket', Key: 'photos/a.jpg' });
    expect(iamDestroy).toHaveBeenCalled();
  });

  it('builds directory listings from prefixes and objects', async () => {
    const { S3Service } = await import('../s3.service');
    const service = new S3Service();
    const client = {
      send: vi.fn().mockResolvedValue({
        CommonPrefixes: [{ Prefix: 'photos/2026/' }, { Prefix: undefined }],
        Contents: [
          { Key: 'photos/', Size: 0 },
          { Key: 'photos/a.jpg', Size: 10, LastModified: new Date('2026-03-07T10:00:00.000Z') },
          { Key: 'photos/folder/', Size: 0 },
        ],
      }),
      destroy: vi.fn(),
    };

    (service as unknown as S3ServiceInternals).clients.set('conn-1', client);

    const listing = await service.listObjects('conn-1', 'bucket', 'photos/');

    expect(listing.parentPath).toBe('');
    expect(listing.entries).toEqual([
      expect.objectContaining({ name: '2026', path: 'photos/2026/', isDirectory: true }),
      expect.objectContaining({ name: 'a.jpg', path: 'photos/a.jpg', isDirectory: false, size: 10 }),
    ]);
    expect(client.send).toHaveBeenCalledWith(expect.any(ListObjectsV2Command));
  });

  it('recursively lists object keys across paginated responses', async () => {
    const { S3Service } = await import('../s3.service');
    const service = new S3Service();
    const client = {
      send: vi.fn()
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'photos/a.jpg', Size: 12 },
            { Key: 'photos/folder/', Size: 0 },
          ],
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'photos/b.jpg', Size: 20 }],
          IsTruncated: false,
        }),
      destroy: vi.fn(),
    };

    (service as unknown as S3ServiceInternals).clients.set('conn-1', client);

    const results = await service.listObjectKeysRecursive('conn-1', 'bucket', 'photos');

    expect(results).toEqual([
      { key: 'photos/a.jpg', size: 12 },
      { key: 'photos/b.jpg', size: 20 },
    ]);
    expect(client.send).toHaveBeenCalledTimes(2);
    expect((client.send.mock.calls[1][0] as ListObjectsV2Command).input).toMatchObject({
      ContinuationToken: 'page-2',
    });
  });

  it('retries failed prefix deletions and re-sends only failed keys', async () => {
    vi.useFakeTimers();

    const { S3Service } = await import('../s3.service');
    const service = new S3Service();
    const client = {
      send: vi.fn()
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'photos/a.jpg' },
            { Key: 'photos/b.jpg' },
          ],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({
          Errors: [{ Key: 'photos/b.jpg', Code: 'InternalError', Message: 'retry me' }],
        })
        .mockResolvedValueOnce({ Errors: [] }),
      destroy: vi.fn(),
    };

    (service as unknown as S3ServiceInternals).clients.set('conn-1', client);

    const deleting = service.deleteObject('conn-1', 'bucket', 'photos/');
    await vi.runOnlyPendingTimersAsync();
    await deleting;

    expect(client.send).toHaveBeenCalledTimes(3);
    expect((client.send.mock.calls[1][0] as DeleteObjectsCommand).input).toMatchObject({
      Delete: { Objects: [{ Key: 'photos/a.jpg' }, { Key: 'photos/b.jpg' }] },
    });
    expect((client.send.mock.calls[2][0] as DeleteObjectsCommand).input).toMatchObject({
      Delete: { Objects: [{ Key: 'photos/b.jpg' }] },
    });
  });
});

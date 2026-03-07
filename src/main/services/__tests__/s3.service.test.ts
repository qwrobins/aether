import { beforeEach, describe, expect, it, vi } from 'vitest';

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

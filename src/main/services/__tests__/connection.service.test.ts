import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';

const encryptString = vi.fn((value: string) => Buffer.from(`enc:${value}`));
const decryptString = vi.fn((value: Buffer) => value.toString('utf-8').replace(/^enc:/, ''));
const readStore = vi.fn();
const writeStore = vi.fn();

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    encryptString,
    decryptString,
  },
}));

vi.mock('../../utils/store', () => ({
  readStore,
  writeStore,
}));

describe('ConnectionService', () => {
  beforeEach(() => {
    vi.resetModules();
    encryptString.mockClear();
    decryptString.mockClear();
    readStore.mockReset();
    writeStore.mockReset();
  });

  it('encrypts only sensitive S3 fields when saving a new profile', async () => {
    readStore.mockReturnValue({ connections: [] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    const profile = {
      name: 'Primary S3',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'credentials',
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret-123',
      defaultBucket: 'uploads',
    } as S3ConnectionProfile;

    const id = service.save(profile);

    expect(id).toBeTypeOf('string');
    expect(encryptString).toHaveBeenCalledTimes(2);
    expect(writeStore).toHaveBeenCalledTimes(1);

    const saved = writeStore.mock.calls[0][0].connections[0] as S3ConnectionProfile;
    expect(saved.id).toBe(id);
    expect(saved.createdAt).toBeTypeOf('string');
    expect(saved.updatedAt).toBeTypeOf('string');
    expect(saved.name).toBe('Primary S3');
    expect(saved.region).toBe('us-east-1');
    expect(saved.defaultBucket).toBe('uploads');
    expect(saved.accessKeyId).not.toBe('AKIA123');
    expect(saved.secretAccessKey).not.toBe('secret-123');
  });

  it('encrypts IAM role source credentials when saving a profile', async () => {
    readStore.mockReturnValue({ connections: [] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    const profile = {
      name: 'Assume Role',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'iam-role',
      roleArn: 'arn:aws:iam::123456789012:role/AetherRole',
      sourceAccessKeyId: 'SOURCEKEY',
      sourceSecretAccessKey: 'source-secret',
    } as S3ConnectionProfile;

    service.save(profile);

    expect(encryptString).toHaveBeenCalledTimes(2);
    const saved = writeStore.mock.calls[0][0].connections[0] as S3ConnectionProfile;
    expect(saved.sourceAccessKeyId).not.toBe('SOURCEKEY');
    expect(saved.sourceSecretAccessKey).not.toBe('source-secret');
  });

  it('redacts stored profiles when listing and decrypts when reading by id', async () => {
    const encryptedProfile = {
      id: 'conn-1',
      name: 'Remote Host',
      type: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'deploy',
      authMethod: 'password',
      password: Buffer.from('enc:hunter2').toString('base64'),
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as SftpConnectionProfile;

    readStore.mockReturnValue({ connections: [encryptedProfile] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();

    expect((service.list()[0] as SftpConnectionProfile).password).toBeUndefined();
    expect((service.getById('conn-1') as SftpConnectionProfile | undefined)?.password).toBe('hunter2');
    expect(decryptString).toHaveBeenCalled();
  });

  it('keeps createdAt when updating an existing profile', async () => {
    const existing = {
      id: 'conn-2',
      name: 'Existing',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'credentials',
      accessKeyId: Buffer.from('enc:old-key').toString('base64'),
      secretAccessKey: Buffer.from('enc:old-secret').toString('base64'),
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as S3ConnectionProfile;

    readStore.mockReturnValue({ connections: [existing] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    const updated = {
      ...existing,
      name: 'Updated',
      accessKeyId: 'new-key',
      secretAccessKey: 'new-secret',
    };

    service.save(updated);

    const saved = writeStore.mock.calls[0][0].connections[0] as S3ConnectionProfile;
    expect(saved.id).toBe('conn-2');
    expect(saved.createdAt).toBe('2026-03-07T10:00:00.000Z');
    expect(saved.updatedAt).not.toBe('2026-03-07T10:00:00.000Z');
    expect(saved.name).toBe('Updated');
  });

  it('preserves existing secrets when updating redacted profile fields', async () => {
    const existing = {
      id: 'conn-3',
      name: 'Existing',
      type: 's3',
      region: 'us-east-1',
      authMethod: 'iam-role',
      roleArn: 'arn:aws:iam::123456789012:role/AetherRole',
      sourceAccessKeyId: Buffer.from('enc:source-key').toString('base64'),
      sourceSecretAccessKey: Buffer.from('enc:source-secret').toString('base64'),
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as S3ConnectionProfile;

    readStore.mockReturnValue({ connections: [existing] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    service.save({
      ...service.list()[0],
      name: 'Renamed',
    });

    const saved = writeStore.mock.calls[0][0].connections[0] as S3ConnectionProfile;
    expect(saved.name).toBe('Renamed');
    expect(saved.sourceAccessKeyId).not.toBeUndefined();
    expect(saved.sourceSecretAccessKey).not.toBeUndefined();
    expect(saved.sourceAccessKeyId).toBe(existing.sourceAccessKeyId);
    expect(saved.sourceSecretAccessKey).toBe(existing.sourceSecretAccessKey);
    expect(decryptString).toHaveBeenCalledTimes(2);
    expect(encryptString).not.toHaveBeenCalled();
  });

  it('rejects stored secrets that cannot be decrypted during metadata-only updates', async () => {
    const existing = {
      id: 'conn-bad-secret',
      name: 'Existing',
      type: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'deploy',
      authMethod: 'password',
      password: Buffer.from('enc:hunter2').toString('base64'),
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as SftpConnectionProfile;

    readStore.mockReturnValue({ connections: [existing] });
    decryptString.mockImplementationOnce(() => {
      throw new Error('decrypt failed');
    });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    expect(() =>
      service.save({
        ...service.list()[0],
        name: 'Renamed',
      }),
    ).toThrow('Failed to preserve stored credential field "password"');
    expect(writeStore).not.toHaveBeenCalled();
  });

  it('rejects legacy plaintext secrets when decryption fails', async () => {
    const existing = {
      id: 'conn-legacy',
      name: 'Legacy',
      type: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'deploy',
      authMethod: 'password',
      password: 'legacy-secret',
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as SftpConnectionProfile;

    decryptString.mockImplementationOnce(() => {
      throw new Error('decrypt failed');
    });
    readStore.mockReturnValue({ connections: [existing] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();

    expect(() => service.getById('conn-legacy')).toThrow(
      'Failed to decrypt stored credential field "password"',
    );
  });

  it('clears existing secrets when updating with empty string fields', async () => {
    const existing = {
      id: 'conn-4',
      name: 'Existing',
      type: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'deploy',
      authMethod: 'password',
      password: Buffer.from('enc:hunter2').toString('base64'),
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as SftpConnectionProfile;

    readStore.mockReturnValue({ connections: [existing] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    service.save({
      ...service.list()[0],
      password: '',
    } as SftpConnectionProfile);

    const saved = writeStore.mock.calls[0][0].connections[0] as SftpConnectionProfile;
    expect(saved.password).toBe('');
    expect(encryptString).not.toHaveBeenCalledWith('hunter2');
  });

  it('rejects non-object profiles and unknown profile types when saving', async () => {
    readStore.mockReturnValue({ connections: [] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();

    expect(() => service.save(null as never)).toThrow(
      'Invalid connection profile: expected a plain object',
    );
    expect(() => service.save(['not-a-profile'] as never)).toThrow(
      'Invalid connection profile: expected a plain object',
    );
    expect(() => service.save({ name: 'Mystery', type: 'carrier-pigeon' } as never)).toThrow(
      'Invalid connection profile type: carrier-pigeon',
    );
    expect(writeStore).not.toHaveBeenCalled();
  });

  it('rejects profiles with non-string id or field values', async () => {
    readStore.mockReturnValue({ connections: [] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();

    expect(() =>
      service.save({
        name: 'Bad Host',
        type: 'sftp',
        host: { evil: true },
        port: 22,
        username: 'deploy',
        authMethod: 'password',
      } as never),
    ).toThrow('Invalid connection profile: "host" must be a string');
    expect(() =>
      service.save({
        id: 42,
        name: 'Bad Id',
        type: 's3',
        region: 'us-east-1',
        authMethod: 'credentials',
      } as never),
    ).toThrow('Invalid connection profile: id must be a string');
    expect(writeStore).not.toHaveBeenCalled();
  });

  it('fails closed when a stored profile has an unknown type', async () => {
    readStore.mockReturnValue({
      connections: [{ id: 'conn-x', name: 'Mystery', type: 'carrier-pigeon' }],
    });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();

    expect(() => service.list()).toThrow('Unknown connection profile type: carrier-pigeon');
  });

  it('persists a trusted host key fingerprint without re-encrypting stored secrets', async () => {
    const existing = {
      id: 'conn-ssh',
      name: 'Remote Host',
      type: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'deploy',
      authMethod: 'password',
      password: Buffer.from('enc:hunter2').toString('base64'),
      createdAt: '2026-03-07T10:00:00.000Z',
      updatedAt: '2026-03-07T10:00:00.000Z',
    } as SftpConnectionProfile;

    readStore.mockReturnValue({ connections: [existing] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();
    service.trustHostKey('conn-ssh', 'SHA256:abc123');

    const saved = writeStore.mock.calls[0][0].connections[0] as SftpConnectionProfile;
    expect(saved.hostKeyFingerprint).toBe('SHA256:abc123');
    expect(saved.updatedAt).not.toBe('2026-03-07T10:00:00.000Z');
    expect(saved.password).toBe(existing.password);
    expect(encryptString).not.toHaveBeenCalled();
  });

  it('refuses to trust a host key for an unknown connection id', async () => {
    readStore.mockReturnValue({ connections: [] });

    const { ConnectionService } = await import('../connection.service');
    const service = new ConnectionService();

    expect(() => service.trustHostKey('missing', 'SHA256:abc123')).toThrow(
      'Connection not found: missing',
    );
    expect(writeStore).not.toHaveBeenCalled();
  });
});

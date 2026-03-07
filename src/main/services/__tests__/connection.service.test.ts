import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';

const encryptString = vi.fn((value: string) => Buffer.from(`enc:${value}`));
const decryptString = vi.fn((value: Buffer) => value.toString('utf-8').replace(/^enc:/, ''));
const readStore = vi.fn();
const writeStore = vi.fn();

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
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

  it('decrypts stored profiles when listing and reading by id', async () => {
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

    expect((service.list()[0] as SftpConnectionProfile).password).toBe('hunter2');
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
});

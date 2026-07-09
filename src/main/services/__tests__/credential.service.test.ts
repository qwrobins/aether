import { beforeEach, describe, expect, it, vi } from 'vitest';

const isEncryptionAvailable = vi.fn();
const getSelectedStorageBackend = vi.fn();
const encryptString = vi.fn((value: string) => Buffer.from(`encrypted:${value}`));
const decryptString = vi.fn((value: Buffer) =>
  value.toString('utf-8').replace(/^encrypted:/, ''),
);

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable,
    getSelectedStorageBackend,
    encryptString,
    decryptString,
  },
}));

describe('CredentialService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEncryptionAvailable.mockReturnValue(true);
    getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
  });

  it('stores versioned safeStorage ciphertext and decrypts it', async () => {
    const { CredentialService } = await import('../credential.service');
    const service = new CredentialService();

    const encrypted = service.encrypt('secret');

    expect(encrypted).toMatch(/^safe:v1:/);
    expect(service.decrypt(encrypted)).toBe('secret');
  });

  it('fails closed when OS encryption is unavailable', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    const { CredentialService } = await import('../credential.service');
    const service = new CredentialService();

    expect(() => service.encrypt('secret')).toThrow('Secure credential storage is unavailable');
    expect(() => service.decrypt('c2VjcmV0')).toThrow('Secure credential storage is unavailable');
  });

  it.runIf(process.platform === 'linux')('rejects Electron basic_text storage on Linux', async () => {
    getSelectedStorageBackend.mockReturnValue('basic_text');
    const { CredentialService } = await import('../credential.service');
    const service = new CredentialService();

    expect(service.isAvailable()).toBe(false);
    expect(() => service.encrypt('secret')).toThrow('Secure credential storage is unavailable');
  });
});

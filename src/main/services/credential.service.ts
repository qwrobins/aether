import { safeStorage } from 'electron';

const ENCRYPTED_VALUE_PREFIX = 'safe:v1:';

export class CredentialService {
  isAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
      return false;
    }

    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend();
      return backend !== 'basic_text' && backend !== 'unknown';
    }

    return true;
  }

  encrypt(plainText: string): string {
    if (!this.isAvailable()) {
      throw new Error(
        'Secure credential storage is unavailable. Configure an OS keyring before saving credentials.',
      );
    }
    return `${ENCRYPTED_VALUE_PREFIX}${safeStorage.encryptString(plainText).toString('base64')}`;
  }

  decrypt(encryptedBase64: string): string {
    if (!this.isAvailable()) {
      throw new Error(
        'Secure credential storage is unavailable. Configure an OS keyring before using saved credentials.',
      );
    }
    const encodedValue = encryptedBase64.startsWith(ENCRYPTED_VALUE_PREFIX)
      ? encryptedBase64.slice(ENCRYPTED_VALUE_PREFIX.length)
      : encryptedBase64;
    const buffer = Buffer.from(encodedValue, 'base64');
    return safeStorage.decryptString(buffer);
  }
}

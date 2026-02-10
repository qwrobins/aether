import { safeStorage } from 'electron';

export class CredentialService {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  encrypt(plainText: string): string {
    if (!this.isAvailable()) {
      return Buffer.from(plainText).toString('base64');
    }
    return safeStorage.encryptString(plainText).toString('base64');
  }

  decrypt(encryptedBase64: string): string {
    if (!this.isAvailable()) {
      return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
    }
    const buffer = Buffer.from(encryptedBase64, 'base64');
    return safeStorage.decryptString(buffer);
  }
}

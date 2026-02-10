import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../utils/store';
import { CredentialService } from './credential.service';
import type { ConnectionProfile, S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';

const SENSITIVE_FIELDS_S3: (keyof S3ConnectionProfile)[] = ['accessKeyId', 'secretAccessKey'];
const SENSITIVE_FIELDS_SFTP: (keyof SftpConnectionProfile)[] = ['password', 'passphrase'];

export class ConnectionService {
  private credentials = new CredentialService();

  list(): ConnectionProfile[] {
    const store = readStore();
    return (store.connections as unknown as ConnectionProfile[]).map((profile) =>
      this.decryptProfile(profile),
    );
  }

  getById(id: string): ConnectionProfile | undefined {
    const store = readStore();
    const profiles = store.connections as unknown as ConnectionProfile[];
    const profile = profiles.find((p) => p.id === id);
    return profile ? this.decryptProfile(profile) : undefined;
  }

  save(profile: ConnectionProfile): string {
    const store = readStore();
    const profiles = store.connections as unknown as ConnectionProfile[];
    const now = new Date().toISOString();

    if (!profile.id) {
      profile.id = randomUUID();
      profile.createdAt = now;
    }
    profile.updatedAt = now;

    const encrypted = this.encryptProfile(profile);
    const existingIndex = profiles.findIndex((p) => p.id === profile.id);

    if (existingIndex >= 0) {
      profiles[existingIndex] = encrypted;
    } else {
      profiles.push(encrypted);
    }

    store.connections = profiles as unknown as Record<string, unknown>[];
    writeStore(store);
    return profile.id;
  }

  delete(id: string): void {
    const store = readStore();
    const profiles = store.connections as unknown as ConnectionProfile[];
    store.connections = profiles.filter((p) => p.id !== id) as unknown as Record<string, unknown>[];
    writeStore(store);
  }

  async test(_profile: ConnectionProfile): Promise<boolean> {
    // Actual S3/SFTP connectivity testing comes in Phase 4/5
    return true;
  }

  private encryptProfile(profile: ConnectionProfile): ConnectionProfile {
    const clone = { ...profile };
    const fields = this.getSensitiveFields(clone);

    for (const field of fields) {
      const value = (clone as Record<string, unknown>)[field as string];
      if (typeof value === 'string' && value.length > 0) {
        (clone as Record<string, unknown>)[field as string] = this.credentials.encrypt(value);
      }
    }
    return clone;
  }

  private decryptProfile(profile: ConnectionProfile): ConnectionProfile {
    const clone = { ...profile };
    const fields = this.getSensitiveFields(clone);

    for (const field of fields) {
      const value = (clone as Record<string, unknown>)[field as string];
      if (typeof value === 'string' && value.length > 0) {
        try {
          (clone as Record<string, unknown>)[field as string] = this.credentials.decrypt(value);
        } catch {
          // If decryption fails, leave the value as-is
        }
      }
    }
    return clone;
  }

  private getSensitiveFields(profile: ConnectionProfile): string[] {
    if (profile.type === 's3') {
      return SENSITIVE_FIELDS_S3 as string[];
    }
    return SENSITIVE_FIELDS_SFTP as string[];
  }
}

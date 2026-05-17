import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../utils/store';
import { CredentialService } from './credential.service';
import type {
  AzureBlobConnectionProfile,
  ConnectionProfile,
  FtpConnectionProfile,
  GcsConnectionProfile,
  MountableConnectionProfile,
  RedactedConnectionProfile,
  RsyncConnectionProfile,
  S3ConnectionProfile,
  SftpConnectionProfile,
} from '@shared/types/connection';

const SENSITIVE_FIELDS_S3: (keyof S3ConnectionProfile)[] = [
  'accessKeyId',
  'secretAccessKey',
  'sourceAccessKeyId',
  'sourceSecretAccessKey',
];
const SENSITIVE_FIELDS_SFTP: (keyof SftpConnectionProfile)[] = ['password', 'passphrase'];
const SENSITIVE_FIELDS_MOUNTABLE: (keyof MountableConnectionProfile)[] = ['password'];
const SENSITIVE_FIELDS_FTP: (keyof FtpConnectionProfile)[] = ['password'];
const SENSITIVE_FIELDS_RSYNC: (keyof RsyncConnectionProfile)[] = ['password', 'passphrase'];
const SENSITIVE_FIELDS_AZURE_BLOB: (keyof AzureBlobConnectionProfile)[] = [
  'accountKey',
  'sasToken',
];
const SENSITIVE_FIELDS_GCS: (keyof GcsConnectionProfile)[] = ['serviceAccountKeyPath'];
type DecryptedProfileResult = {
  profile: ConnectionProfile;
  decryptedFields: Set<string>;
};
type PreservedProfileResult = {
  profile: ConnectionProfile;
  preservedEncryptedFields: Set<string>;
};

export class ConnectionService {
  private credentials = new CredentialService();

  list(): RedactedConnectionProfile[] {
    const store = readStore();
    return (store.connections as unknown as ConnectionProfile[]).map((profile) =>
      this.redactProfile(profile),
    );
  }

  getById(id: string): ConnectionProfile | undefined {
    const store = readStore();
    const profiles = store.connections as unknown as ConnectionProfile[];
    const profile = profiles.find((p) => p.id === id);
    return profile ? this.decryptProfile(profile).profile : undefined;
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

    const existingIndex = profiles.findIndex((p) => p.id === profile.id);
    const { profile: profileToSave, preservedEncryptedFields } = existingIndex >= 0
      ? this.preserveExistingSensitiveFields(profile, profiles[existingIndex])
      : { profile, preservedEncryptedFields: new Set<string>() };
    const encrypted = this.encryptProfile(profileToSave, preservedEncryptedFields);

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

  async test(profile: ConnectionProfile): Promise<boolean> {
    void profile;
    // Actual S3/SFTP connectivity testing comes in Phase 4/5
    return true;
  }

  private encryptProfile(
    profile: ConnectionProfile,
    preservedEncryptedFields = new Set<string>(),
  ): ConnectionProfile {
    const clone = { ...profile };
    const fields = this.getSensitiveFields(clone);

    for (const field of fields) {
      if (preservedEncryptedFields.has(field)) {
        continue;
      }
      const value = (clone as Record<string, unknown>)[field as string];
      if (typeof value === 'string' && value.length > 0) {
        (clone as Record<string, unknown>)[field as string] = this.credentials.encrypt(value);
      }
    }
    return clone;
  }

  private decryptProfile(profile: ConnectionProfile): DecryptedProfileResult {
    const clone = { ...profile };
    const fields = this.getSensitiveFields(clone);
    const decryptedFields = new Set<string>();

    for (const field of fields) {
      const value = (clone as Record<string, unknown>)[field as string];
      if (typeof value === 'string' && value.length > 0) {
        try {
          (clone as Record<string, unknown>)[field as string] = this.credentials.decrypt(value);
          decryptedFields.add(field);
        } catch {
          // If decryption fails, leave the value as-is
        }
      }
    }
    return { profile: clone, decryptedFields };
  }

  private redactProfile(profile: ConnectionProfile): RedactedConnectionProfile {
    const clone = { ...profile };
    const fields = this.getSensitiveFields(clone);

    for (const field of fields) {
      delete (clone as Record<string, unknown>)[field];
    }
    return clone as RedactedConnectionProfile;
  }

  private preserveExistingSensitiveFields(
    profile: ConnectionProfile,
    existingStoredProfile: ConnectionProfile,
  ): PreservedProfileResult {
    const clone = { ...profile };
    const { profile: existing, decryptedFields } = this.decryptProfile(existingStoredProfile);
    const fields = this.getSensitiveFields(clone);
    const preservedEncryptedFields = new Set<string>();

    for (const field of fields) {
      const currentValue = (clone as Record<string, unknown>)[field];
      const existingValue = (existing as unknown as Record<string, unknown>)[field];
      const existingStoredValue = (existingStoredProfile as unknown as Record<string, unknown>)[field];
      if (
        currentValue === undefined &&
        decryptedFields.has(field) &&
        typeof existingValue === 'string' &&
        existingValue.length > 0
      ) {
        (clone as Record<string, unknown>)[field] = existingValue;
      } else if (
        currentValue === undefined &&
        typeof existingStoredValue === 'string' &&
        existingStoredValue.length > 0
      ) {
        (clone as Record<string, unknown>)[field] =
          this.encryptExistingStoredSensitiveField(field, existingStoredValue);
        preservedEncryptedFields.add(field);
      }
    }

    return { profile: clone, preservedEncryptedFields };
  }

  private encryptExistingStoredSensitiveField(field: string, value: string): string {
    try {
      return this.credentials.encrypt(value);
    } catch (error) {
      throw new Error(
        `Failed to preserve stored credential field "${field}": ${
          error instanceof Error ? error.message : 'encryption failed'
        }`,
      );
    }
  }

  private getSensitiveFields(profile: ConnectionProfile): string[] {
    if (profile.type === 's3') {
      return SENSITIVE_FIELDS_S3 as string[];
    }
    if (profile.type === 'sftp') {
      return SENSITIVE_FIELDS_SFTP as string[];
    }
    if (profile.type === 'smb' || profile.type === 'nfs' || profile.type === 'webdav') {
      return SENSITIVE_FIELDS_MOUNTABLE as string[];
    }
    if (profile.type === 'ftp' || profile.type === 'ftps') {
      return SENSITIVE_FIELDS_FTP as string[];
    }
    if (profile.type === 'rsync') {
      return SENSITIVE_FIELDS_RSYNC as string[];
    }
    if (profile.type === 'azure-blob') {
      return SENSITIVE_FIELDS_AZURE_BLOB as string[];
    }
    if (profile.type === 'gcs') {
      return SENSITIVE_FIELDS_GCS as string[];
    }
    return [];
  }
}

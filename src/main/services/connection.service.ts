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

/**
 * Known connection types mapped to the profile fields that must be strings
 * when present. Doubles as the allowlist of persistable profile types.
 */
const PROFILE_STRING_FIELDS: Record<string, string[]> = {
  s3: [
    'region',
    'authMethod',
    'accessKeyId',
    'secretAccessKey',
    'roleArn',
    'externalId',
    'sourceAccessKeyId',
    'sourceSecretAccessKey',
    'awsProfile',
    'defaultBucket',
    'endpoint',
  ],
  sftp: [
    'host',
    'username',
    'authMethod',
    'password',
    'privateKeyPath',
    'passphrase',
    'defaultPath',
    'hostKeyFingerprint',
  ],
  smb: ['host', 'share', 'mountPath', 'username', 'password', 'domain', 'defaultPath'],
  nfs: ['host', 'share', 'mountPath', 'username', 'password', 'domain', 'defaultPath'],
  webdav: ['host', 'share', 'mountPath', 'username', 'password', 'domain', 'defaultPath'],
  ftp: ['host', 'username', 'password', 'defaultPath'],
  ftps: ['host', 'username', 'password', 'defaultPath'],
  rsync: [
    'host',
    'module',
    'username',
    'authMethod',
    'password',
    'privateKeyPath',
    'passphrase',
    'defaultPath',
    'hostKeyFingerprint',
  ],
  'azure-blob': ['accountName', 'container', 'accountKey', 'sasToken', 'endpoint'],
  gcs: ['projectId', 'bucket', 'serviceAccountKeyPath'],
};
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
    this.validateProfile(profile);
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

  /** Persist a user-confirmed SSH host key fingerprint for a stored profile. */
  trustHostKey(id: string, fingerprint: string): void {
    const store = readStore();
    const profiles = store.connections as unknown as ConnectionProfile[];
    const profile = profiles.find((p) => p.id === id);
    if (!profile) {
      throw new Error(`Connection not found: ${id}`);
    }
    (profile as SftpConnectionProfile | RsyncConnectionProfile).hostKeyFingerprint = fingerprint;
    profile.updatedAt = new Date().toISOString();
    store.connections = profiles as unknown as Record<string, unknown>[];
    writeStore(store);
  }

  /**
   * Lightweight structural validation for renderer-supplied profiles.
   * Rejects non-objects and unknown types so secrets are never persisted
   * for profiles we cannot encrypt correctly.
   */
  private validateProfile(profile: unknown): void {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error('Invalid connection profile: expected a plain object');
    }
    const candidate = profile as Record<string, unknown>;
    const type = candidate.type;
    if (typeof type !== 'string' || !(type in PROFILE_STRING_FIELDS)) {
      throw new Error(`Invalid connection profile type: ${String(type)}`);
    }
    if (candidate.id !== undefined && typeof candidate.id !== 'string') {
      throw new Error('Invalid connection profile: id must be a string');
    }
    if (candidate.name !== undefined && typeof candidate.name !== 'string') {
      throw new Error('Invalid connection profile: name must be a string');
    }
    for (const field of PROFILE_STRING_FIELDS[type]) {
      const value = candidate[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new Error(`Invalid connection profile: "${field}" must be a string`);
      }
    }
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
        } catch (error) {
          throw new Error(
            `Failed to decrypt stored credential field "${field}": ${
              error instanceof Error ? error.message : 'decryption failed'
            }`,
          );
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
    const fields = this.getSensitiveFields(clone);
    const preservedEncryptedFields = new Set<string>();

    for (const field of fields) {
      const currentValue = (clone as Record<string, unknown>)[field];
      const existingStoredValue = (existingStoredProfile as unknown as Record<string, unknown>)[field];
      if (
        currentValue === undefined &&
        typeof existingStoredValue === 'string' &&
        existingStoredValue.length > 0
      ) {
        try {
          this.credentials.decrypt(existingStoredValue);
        } catch (error) {
          throw new Error(
            `Failed to preserve stored credential field "${field}": ${
              error instanceof Error ? error.message : 'decryption failed'
            }`,
          );
        }
        (clone as Record<string, unknown>)[field] = existingStoredValue;
        preservedEncryptedFields.add(field);
      }
    }

    return { profile: clone, preservedEncryptedFields };
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
    // Fail closed: never persist secrets for a profile type we cannot encrypt.
    throw new Error(`Unknown connection profile type: ${String(profile.type)}`);
  }
}

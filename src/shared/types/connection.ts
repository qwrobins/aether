export type ConnectionType =
  | 's3'
  | 'sftp'
  | 'smb'
  | 'nfs'
  | 'webdav'
  | 'ftp'
  | 'ftps'
  | 'rsync'
  | 'azure-blob'
  | 'gcs';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BaseConnectionProfile {
  id: string;
  name: string;
  type: ConnectionType;
  createdAt: string;
  updatedAt: string;
}

export type S3AuthMethod = 'credentials' | 'iam-role' | 'profile' | 'default-chain';

export interface S3ConnectionProfile extends BaseConnectionProfile {
  type: 's3';
  region: string;
  authMethod: S3AuthMethod;
  // For 'credentials' auth
  accessKeyId?: string;
  secretAccessKey?: string;
  // For 'iam-role' auth
  roleArn?: string;
  externalId?: string;
  sourceAccessKeyId?: string;
  sourceSecretAccessKey?: string;
  // For 'profile' auth
  awsProfile?: string;
  // Common
  defaultBucket?: string;
  endpoint?: string;
}

export interface SftpConnectionProfile extends BaseConnectionProfile {
  type: 'sftp';
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  defaultPath?: string;
  hostKeyFingerprint?: string;
}

export type MountableConnectionType = 'smb' | 'nfs' | 'webdav';

export interface MountableConnectionProfile extends BaseConnectionProfile {
  type: MountableConnectionType;
  host: string;
  share: string;
  mountPath: string;
  username?: string;
  password?: string;
  domain?: string;
  defaultPath?: string;
}

export interface FtpConnectionProfile extends BaseConnectionProfile {
  type: 'ftp' | 'ftps';
  host: string;
  port: number;
  username?: string;
  password?: string;
  defaultPath?: string;
}

export interface RsyncConnectionProfile extends BaseConnectionProfile {
  type: 'rsync';
  host: string;
  module?: string;
  username: string;
  authMethod: 'password' | 'key';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  defaultPath?: string;
  sshPort?: number;
  hostKeyFingerprint?: string;
}

export type ConnectionConnectResult =
  | { status: 'connected' }
  | { status: 'host-key-untrusted'; fingerprint: string };

export interface AzureBlobConnectionProfile extends BaseConnectionProfile {
  type: 'azure-blob';
  accountName: string;
  container?: string;
  accountKey?: string;
  sasToken?: string;
  endpoint?: string;
}

export interface GcsConnectionProfile extends BaseConnectionProfile {
  type: 'gcs';
  projectId?: string;
  bucket?: string;
  serviceAccountKeyPath?: string;
}

export type ConnectionProfile =
  | S3ConnectionProfile
  | SftpConnectionProfile
  | MountableConnectionProfile
  | FtpConnectionProfile
  | RsyncConnectionProfile
  | AzureBlobConnectionProfile
  | GcsConnectionProfile;

export type RedactedS3ConnectionProfile = Omit<
  S3ConnectionProfile,
  'accessKeyId' | 'secretAccessKey' | 'sourceAccessKeyId' | 'sourceSecretAccessKey'
>;

export type RedactedSftpConnectionProfile = Omit<
  SftpConnectionProfile,
  'password' | 'passphrase'
>;

export type RedactedMountableConnectionProfile = Omit<MountableConnectionProfile, 'password'>;
export type RedactedFtpConnectionProfile = Omit<FtpConnectionProfile, 'password'>;
export type RedactedRsyncConnectionProfile = Omit<
  RsyncConnectionProfile,
  'password' | 'passphrase'
>;
export type RedactedAzureBlobConnectionProfile = Omit<
  AzureBlobConnectionProfile,
  'accountKey' | 'sasToken'
>;
export type RedactedGcsConnectionProfile = Omit<GcsConnectionProfile, 'serviceAccountKeyPath'>;

export type RedactedConnectionProfile =
  | RedactedS3ConnectionProfile
  | RedactedSftpConnectionProfile
  | RedactedMountableConnectionProfile
  | RedactedFtpConnectionProfile
  | RedactedRsyncConnectionProfile
  | RedactedAzureBlobConnectionProfile
  | RedactedGcsConnectionProfile;

export interface ActiveConnection {
  id: string;
  profile: ConnectionProfile;
  status: ConnectionStatus;
  error?: string;
  connectedAt?: string;
}

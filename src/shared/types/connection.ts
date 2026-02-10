export type ConnectionType = 's3' | 'sftp';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BaseConnectionProfile {
  id: string;
  name: string;
  type: ConnectionType;
  createdAt: string;
  updatedAt: string;
}

export type S3AuthMethod = 'credentials' | 'iam-role' | 'default-chain';

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
}

export type ConnectionProfile = S3ConnectionProfile | SftpConnectionProfile;

export interface ActiveConnection {
  id: string;
  profile: ConnectionProfile;
  status: ConnectionStatus;
  error?: string;
  connectedAt?: string;
}

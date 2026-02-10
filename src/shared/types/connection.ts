export type ConnectionType = 's3' | 'sftp';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BaseConnectionProfile {
  id: string;
  name: string;
  type: ConnectionType;
  createdAt: string;
  updatedAt: string;
}

export interface S3ConnectionProfile extends BaseConnectionProfile {
  type: 's3';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
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

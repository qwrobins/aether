import { IpcMain } from 'electron';
import { S3Service } from '../services/s3.service';
import { ConnectionService } from '../services/connection.service';
import { sftpService } from './sftp.handlers';
import { rsyncService } from './rsync.handlers';
import { networkFilesystemService } from './network-filesystem.handlers';
import { UntrustedSshHostKeyError } from '../services/sftp.service';
import { IpcChannels } from '@shared/constants/channels';
import type {
  MountableConnectionProfile,
  RsyncConnectionProfile,
  S3ConnectionProfile,
  SftpConnectionProfile,
} from '@shared/types/connection';

export const s3Service = new S3Service();

export function registerS3Handlers(ipcMain: IpcMain): void {
  const connections = new ConnectionService();

  ipcMain.handle(IpcChannels.CONN_CONNECT, async (_event, id: string) => {
    const profile = connections.getById(id);
    if (!profile) throw new Error('Connection not found');
    if (profile.type === 's3') {
      s3Service.connect(id, profile as S3ConnectionProfile);
      return { status: 'connected' };
    } else if (profile.type === 'sftp') {
      try {
        await sftpService.connect(id, profile as SftpConnectionProfile);
        return { status: 'connected' };
      } catch (error) {
        if (error instanceof UntrustedSshHostKeyError) {
          return { status: 'host-key-untrusted', fingerprint: error.fingerprint };
        }
        throw error;
      }
    } else if (profile.type === 'rsync') {
      try {
        await rsyncService.connect(id, profile as RsyncConnectionProfile);
        return { status: 'connected' };
      } catch (error) {
        if (error instanceof UntrustedSshHostKeyError) {
          return { status: 'host-key-untrusted', fingerprint: error.fingerprint };
        }
        throw error;
      }
    } else if (profile.type === 'smb' || profile.type === 'nfs' || profile.type === 'webdav') {
      await networkFilesystemService.connect(id, profile as MountableConnectionProfile);
      return { status: 'connected' };
    }
    throw new Error(`Unsupported connection type: ${profile.type}`);
  });

  ipcMain.handle(IpcChannels.CONN_DISCONNECT, async (_event, id: string) => {
    s3Service.disconnect(id);
    await sftpService.disconnect(id);
    await rsyncService.disconnect(id);
    networkFilesystemService.disconnect(id);
  });

  ipcMain.handle(IpcChannels.S3_LIST_PROFILES, async () => {
    console.log('[Aether] s3:list-profiles called');
    try {
      const profiles = await s3Service.listAwsProfiles();
      console.log('[Aether] Found AWS profiles:', profiles);
      return profiles;
    } catch (err) {
      console.error('[Aether] Failed to list AWS profiles:', err);
      throw err;
    }
  });

  ipcMain.handle(
    IpcChannels.S3_LIST_ROLES,
    async (_event, region: string, accessKeyId?: string, secretAccessKey?: string) => {
      return s3Service.listRoles(region, accessKeyId, secretAccessKey);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_LIST_BUCKETS,
    async (_event, connectionId: string) => {
      return s3Service.listBuckets(connectionId);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_LIST_OBJECTS,
    async (_event, connectionId: string, bucket: string, prefix: string) => {
      return s3Service.listObjects(connectionId, bucket, prefix);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_DELETE_OBJECT,
    async (_event, connectionId: string, bucket: string, key: string) => {
      return s3Service.deleteObject(connectionId, bucket, key);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_CREATE_FOLDER,
    async (_event, connectionId: string, bucket: string, key: string) => {
      return s3Service.createFolder(connectionId, bucket, key);
    },
  );
}

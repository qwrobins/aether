import { IpcMain } from 'electron';
import { S3Service } from '../services/s3.service';
import { ConnectionService } from '../services/connection.service';
import { sftpService } from './sftp.handlers';
import { IpcChannels } from '@shared/constants/channels';
import type { S3ConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';

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
      await sftpService.connect(id, profile as SftpConnectionProfile);
      return { status: 'connected' };
    }
    throw new Error(`Connection type ${profile.type} not supported`);
  });

  ipcMain.handle(IpcChannels.CONN_DISCONNECT, async (_event, id: string) => {
    s3Service.disconnect(id);
    await sftpService.disconnect(id);
  });

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

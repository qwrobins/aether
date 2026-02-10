import { IpcMain } from 'electron';
import { S3Service } from '../services/s3.service';
import { ConnectionService } from '../services/connection.service';
import { IpcChannels } from '@shared/constants/channels';
import type { S3ConnectionProfile } from '@shared/types/connection';

export function registerS3Handlers(ipcMain: IpcMain): void {
  const s3 = new S3Service();
  const connections = new ConnectionService();

  ipcMain.handle(IpcChannels.CONN_CONNECT, async (_event, id: string) => {
    const profile = connections.getById(id);
    if (!profile) throw new Error('Connection not found');
    if (profile.type === 's3') {
      s3.connect(id, profile as S3ConnectionProfile);
      return { status: 'connected' };
    }
    // SFTP will be handled in Phase 5
    throw new Error(`Connection type ${profile.type} not yet supported`);
  });

  ipcMain.handle(IpcChannels.CONN_DISCONNECT, async (_event, id: string) => {
    s3.disconnect(id);
  });

  ipcMain.handle(
    IpcChannels.S3_LIST_BUCKETS,
    async (_event, connectionId: string) => {
      return s3.listBuckets(connectionId);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_LIST_OBJECTS,
    async (_event, connectionId: string, bucket: string, prefix: string) => {
      return s3.listObjects(connectionId, bucket, prefix);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_DELETE_OBJECT,
    async (_event, connectionId: string, bucket: string, key: string) => {
      return s3.deleteObject(connectionId, bucket, key);
    },
  );

  ipcMain.handle(
    IpcChannels.S3_CREATE_FOLDER,
    async (_event, connectionId: string, bucket: string, key: string) => {
      return s3.createFolder(connectionId, bucket, key);
    },
  );
}

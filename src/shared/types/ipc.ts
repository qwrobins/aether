import type { FileEntry, DirectoryListing } from './filesystem';
import type { ConnectionProfile } from './connection';
import type { TransferRequest, TransferItem, TransferProgress, TransferResult } from './transfer';

export interface IpcInvokeMap {
  'fs:read-dir': { args: [path: string]; return: DirectoryListing };
  'fs:stat': { args: [path: string]; return: FileEntry };
  'fs:mkdir': { args: [path: string]; return: void };
  'fs:delete': { args: [paths: string[]]; return: void };
  'fs:rename': { args: [oldPath: string, newPath: string]; return: void };
  'fs:get-home': { args: []; return: string };
  'fs:open-in-explorer': { args: [path: string]; return: void };

  // S3
  's3:list-roles': { args: [region: string, accessKeyId?: string, secretAccessKey?: string]; return: Array<{ arn: string; name: string }> };
  's3:list-buckets': { args: [connectionId: string]; return: string[] };
  's3:list-objects': { args: [connectionId: string, bucket: string, prefix: string]; return: DirectoryListing };
  's3:delete-object': { args: [connectionId: string, bucket: string, key: string]; return: void };
  's3:create-folder': { args: [connectionId: string, bucket: string, key: string]; return: void };

  // SFTP
  'sftp:list': { args: [connectionId: string, path: string]; return: DirectoryListing };
  'sftp:mkdir': { args: [connectionId: string, path: string]; return: void };
  'sftp:delete': { args: [connectionId: string, paths: string[]]; return: void };
  'sftp:rename': { args: [connectionId: string, oldPath: string, newPath: string]; return: void };

  // Connections
  'conn:save': { args: [profile: ConnectionProfile]; return: string };
  'conn:delete': { args: [id: string]; return: void };
  'conn:list': { args: []; return: ConnectionProfile[] };
  'conn:test': { args: [profile: ConnectionProfile]; return: boolean };
  'conn:connect': { args: [id: string]; return: { status: string } };
  'conn:disconnect': { args: [id: string]; return: void };

  // Transfers
  'transfer:start': { args: [request: TransferRequest]; return: string };
  'transfer:cancel': { args: [transferId: string]; return: void };
  'transfer:clear': { args: []; return: void };
  'transfer:list': { args: []; return: TransferItem[] };
}

export interface IpcEventMap {
  'transfer:progress': TransferProgress;
  'transfer:complete': TransferResult;
  'transfer:error': { transferId: string; error: string };
}

import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcEventMap, IpcInvokeMap } from '@shared/types/ipc';

const allowedInvokeChannels = new Set<keyof IpcInvokeMap>([
  IpcChannels.FS_READ_DIR,
  IpcChannels.FS_STAT,
  IpcChannels.FS_MKDIR,
  IpcChannels.FS_DELETE,
  IpcChannels.FS_RENAME,
  IpcChannels.FS_GET_HOME,
  IpcChannels.FS_LIST_DRIVES,
  IpcChannels.FS_MOUNT_DRIVE,
  IpcChannels.FS_OPEN_IN_EXPLORER,
  IpcChannels.S3_LIST_PROFILES,
  IpcChannels.S3_LIST_ROLES,
  IpcChannels.S3_LIST_BUCKETS,
  IpcChannels.S3_LIST_OBJECTS,
  IpcChannels.S3_DELETE_OBJECT,
  IpcChannels.S3_CREATE_FOLDER,
  IpcChannels.SFTP_LIST,
  IpcChannels.SFTP_MKDIR,
  IpcChannels.SFTP_DELETE,
  IpcChannels.SFTP_RENAME,
  IpcChannels.NETFS_LIST,
  IpcChannels.NETFS_MKDIR,
  IpcChannels.NETFS_DELETE,
  IpcChannels.NETFS_RENAME,
  IpcChannels.TAILDROP_STATUS,
  IpcChannels.TAILDROP_LIST_TARGETS,
  IpcChannels.TAILDROP_RECEIVE,
  IpcChannels.CONN_SAVE,
  IpcChannels.CONN_DELETE,
  IpcChannels.CONN_LIST,
  IpcChannels.CONN_TEST,
  IpcChannels.CONN_CONNECT,
  IpcChannels.CONN_DISCONNECT,
  IpcChannels.TRANSFER_START,
  IpcChannels.TRANSFER_CANCEL,
  IpcChannels.TRANSFER_CLEAR,
  IpcChannels.TRANSFER_LIST,
  IpcChannels.DIALOG_OPEN_FILE,
  IpcChannels.DIALOG_OPEN_DIRECTORY,
  IpcChannels.SHELL_OPEN_EXTERNAL,
  IpcChannels.WINDOW_CLOSE,
  IpcChannels.WINDOW_MINIMIZE,
  IpcChannels.WINDOW_MAXIMIZE,
]);

const allowedEventChannels = new Set<keyof IpcEventMap>([
  IpcChannels.TRANSFER_PROGRESS,
  IpcChannels.TRANSFER_COMPLETE,
  IpcChannels.TRANSFER_ERROR,
]);

function assertAllowedChannel<K extends string>(
  channel: string,
  allowedChannels: Set<K>,
): asserts channel is K {
  if (!allowedChannels.has(channel as K)) {
    throw new Error(`Blocked IPC channel: ${channel}`);
  }
}

contextBridge.exposeInMainWorld('api', {
  invoke: <K extends keyof IpcInvokeMap>(
    channel: K,
    ...args: IpcInvokeMap[K]['args']
  ): Promise<IpcInvokeMap[K]['return']> => {
    assertAllowedChannel(channel, allowedInvokeChannels);
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeMap[K]['return']>;
  },
  on: <K extends keyof IpcEventMap>(channel: K, callback: (data: IpcEventMap[K]) => void) => {
    assertAllowedChannel(channel, allowedEventChannels);
    const handler = (_event: unknown, ...args: unknown[]) => {
      callback(args[0] as IpcEventMap[K]);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
});

export const IpcChannels = {
  FS_READ_DIR: 'fs:read-dir',
  FS_STAT: 'fs:stat',
  FS_MKDIR: 'fs:mkdir',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_GET_HOME: 'fs:get-home',
  FS_OPEN_IN_EXPLORER: 'fs:open-in-explorer',

  // S3
  S3_LIST_PROFILES: 's3:list-profiles',
  S3_LIST_ROLES: 's3:list-roles',
  S3_LIST_BUCKETS: 's3:list-buckets',
  S3_LIST_OBJECTS: 's3:list-objects',
  S3_DELETE_OBJECT: 's3:delete-object',
  S3_CREATE_FOLDER: 's3:create-folder',

  // SFTP
  SFTP_LIST: 'sftp:list',
  SFTP_MKDIR: 'sftp:mkdir',
  SFTP_DELETE: 'sftp:delete',
  SFTP_RENAME: 'sftp:rename',

  // Connections
  CONN_SAVE: 'conn:save',
  CONN_DELETE: 'conn:delete',
  CONN_LIST: 'conn:list',
  CONN_TEST: 'conn:test',
  CONN_CONNECT: 'conn:connect',
  CONN_DISCONNECT: 'conn:disconnect',

  // Transfers
  TRANSFER_START: 'transfer:start',
  TRANSFER_CANCEL: 'transfer:cancel',
  TRANSFER_CLEAR: 'transfer:clear',
  TRANSFER_LIST: 'transfer:list',

  // Transfer events (main -> renderer)
  TRANSFER_PROGRESS: 'transfer:progress',
  TRANSFER_COMPLETE: 'transfer:complete',
  TRANSFER_ERROR: 'transfer:error',

  // Window controls
  WINDOW_CLOSE: 'window:close',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
} as const;

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels];

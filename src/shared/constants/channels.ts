export const IpcChannels = {
  FS_READ_DIR: 'fs:read-dir',
  FS_STAT: 'fs:stat',
  FS_MKDIR: 'fs:mkdir',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_GET_HOME: 'fs:get-home',
  FS_OPEN_IN_EXPLORER: 'fs:open-in-explorer',

  // S3
  S3_LIST_BUCKETS: 's3:list-buckets',
  S3_LIST_OBJECTS: 's3:list-objects',
  S3_DELETE_OBJECT: 's3:delete-object',
  S3_CREATE_FOLDER: 's3:create-folder',

  // Connections
  CONN_SAVE: 'conn:save',
  CONN_DELETE: 'conn:delete',
  CONN_LIST: 'conn:list',
  CONN_TEST: 'conn:test',
  CONN_CONNECT: 'conn:connect',
  CONN_DISCONNECT: 'conn:disconnect',
} as const;

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels];

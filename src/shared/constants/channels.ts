export const IpcChannels = {
  FS_READ_DIR: 'fs:read-dir',
  FS_STAT: 'fs:stat',
  FS_MKDIR: 'fs:mkdir',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_GET_HOME: 'fs:get-home',
  FS_OPEN_IN_EXPLORER: 'fs:open-in-explorer',

  // Connections
  CONN_SAVE: 'conn:save',
  CONN_DELETE: 'conn:delete',
  CONN_LIST: 'conn:list',
  CONN_TEST: 'conn:test',
} as const;

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels];

import type { FileEntry, DirectoryListing } from './filesystem';

export interface IpcInvokeMap {
  'fs:read-dir': { args: [path: string]; return: DirectoryListing };
  'fs:stat': { args: [path: string]; return: FileEntry };
  'fs:mkdir': { args: [path: string]; return: void };
  'fs:delete': { args: [paths: string[]]; return: void };
  'fs:rename': { args: [oldPath: string, newPath: string]; return: void };
  'fs:get-home': { args: []; return: string };
  'fs:open-in-explorer': { args: [path: string]; return: void };
}

export interface IpcEventMap {
  // Transfer events will be added in Phase 6
}

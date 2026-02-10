import { useCallback } from 'react';
import type { DirectoryListing, FileEntry } from '@shared/types/filesystem';

export function useFileSystem() {
  const readDir = useCallback((path: string): Promise<DirectoryListing> => {
    return window.api.invoke('fs:read-dir', path);
  }, []);

  const stat = useCallback((path: string): Promise<FileEntry> => {
    return window.api.invoke('fs:stat', path);
  }, []);

  const mkdir = useCallback((path: string): Promise<void> => {
    return window.api.invoke('fs:mkdir', path);
  }, []);

  const deletePaths = useCallback((paths: string[]): Promise<void> => {
    return window.api.invoke('fs:delete', paths);
  }, []);

  const rename = useCallback((oldPath: string, newPath: string): Promise<void> => {
    return window.api.invoke('fs:rename', oldPath, newPath);
  }, []);

  const getHome = useCallback((): Promise<string> => {
    return window.api.invoke('fs:get-home');
  }, []);

  const openInExplorer = useCallback((path: string): Promise<void> => {
    return window.api.invoke('fs:open-in-explorer', path);
  }, []);

  return { readDir, stat, mkdir, deletePaths, rename, getHome, openInExplorer };
}

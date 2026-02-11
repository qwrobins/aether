import {
  readdir,
  stat as fsStat,
  mkdir as fsMkdir,
  rm,
  rename as fsRename,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { shell } from 'electron';
import type { FileEntry, DirectoryListing } from '@shared/types/filesystem';

export class FilesystemService {
  async readDirectory(dirPath: string): Promise<DirectoryListing> {
    const dirents = await readdir(dirPath, { withFileTypes: true });

    const entries: FileEntry[] = await Promise.all(
      dirents.map(async (dirent) => {
        const fullPath = join(dirPath, dirent.name);
        try {
          const stats = await fsStat(fullPath);
          return {
            name: dirent.name,
            path: fullPath,
            size: dirent.isDirectory() ? 0 : stats.size,
            isDirectory: dirent.isDirectory(),
            modifiedAt: stats.mtime.toISOString(),
          };
        } catch {
          return {
            name: dirent.name,
            path: fullPath,
            size: 0,
            isDirectory: dirent.isDirectory(),
            modifiedAt: new Date().toISOString(),
          };
        }
      }),
    );

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const parent = dirname(dirPath);
    return {
      path: dirPath,
      entries,
      parentPath: parent === dirPath ? null : parent,
    };
  }

  /** Recursively list all files (not directories) under a path. Returns full paths. */
  async listFilesRecursive(dirPath: string): Promise<Array<{ path: string; relativePath: string }>> {
    const results: Array<{ path: string; relativePath: string }> = [];
    const walk = async (currentDir: string, relativePrefix: string) => {
      const dirents = await readdir(currentDir, { withFileTypes: true });
      for (const dirent of dirents) {
        const fullPath = join(currentDir, dirent.name);
        const relativePath = relativePrefix ? `${relativePrefix}/${dirent.name}` : dirent.name;
        if (dirent.isDirectory()) {
          await walk(fullPath, relativePath);
        } else {
          results.push({ path: fullPath, relativePath });
        }
      }
    };
    await walk(dirPath, '');
    return results;
  }

  async stat(filePath: string): Promise<FileEntry> {
    const stats = await fsStat(filePath);
    return {
      name: basename(filePath),
      path: filePath,
      size: stats.isDirectory() ? 0 : stats.size,
      isDirectory: stats.isDirectory(),
      modifiedAt: stats.mtime.toISOString(),
    };
  }

  async mkdir(dirPath: string): Promise<void> {
    await fsMkdir(dirPath, { recursive: true });
  }

  async remove(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map((p) => rm(p, { recursive: true, force: true })),
    );
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fsRename(oldPath, newPath);
  }

  getHome(): string {
    return homedir();
  }

  openInExplorer(filePath: string): void {
    shell.openPath(filePath);
  }
}

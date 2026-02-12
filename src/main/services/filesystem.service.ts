import {
  readdir,
  stat as fsStat,
  access,
  mkdir as fsMkdir,
  rm,
  rename as fsRename,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';
import { shell } from 'electron';
import type { FileEntry, DirectoryListing, DriveInfo } from '@shared/types/filesystem';

const execFileAsync = promisify(execFile);

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

  async listDrives(): Promise<DriveInfo[]> {
    const os = platform();
    const drives: DriveInfo[] = [];

    // Always include root on Unix
    if (os !== 'win32') {
      drives.push({ name: 'Root', path: '/', isRemovable: false, isMounted: true });
    }

    if (os === 'linux') {
      await this.listLinuxDrives(drives);
    } else if (os === 'darwin') {
      await this.listMacDrives(drives);
    } else if (os === 'win32') {
      await this.listWindowsDrives(drives);
    }

    return drives;
  }

  /** Mount an unmounted partition via udisksctl. Returns the mount path. */
  async mountDrive(devicePath: string): Promise<string> {
    const { stdout } = await execFileAsync('udisksctl', ['mount', '-b', devicePath]);
    // udisksctl outputs: "Mounted /dev/sdc1 at /run/media/user/Label."
    const match = stdout.match(/at (.+?)\.?\s*$/);
    if (match) return match[1];
    throw new Error(`Could not parse mount point from: ${stdout}`);
  }

  private async listLinuxDrives(drives: DriveInfo[]): Promise<void> {
    // System mount points to skip (they're internal OS partitions)
    const systemMounts = new Set(['/', '/boot', '/boot/efi', '/home', '/root', '/srv', '[SWAP]']);
    const systemPrefixes = ['/var/', '/sys/', '/proc/', '/dev/', '/run/docker/', '/snap/'];

    try {
      const { stdout } = await execFileAsync('lsblk', [
        '-Jpo', 'NAME,MOUNTPOINT,FSTYPE,SIZE,RM,HOTPLUG,TYPE,LABEL',
      ]);
      const data = JSON.parse(stdout);

      interface LsblkDevice {
        name: string;
        mountpoint: string | null;
        fstype: string | null;
        size: string;
        rm: boolean;
        hotplug: boolean;
        type: string;
        label: string | null;
        children?: LsblkDevice[];
      }

      for (const disk of data.blockdevices as LsblkDevice[]) {
        const partitions = disk.children || (disk.type === 'part' ? [disk] : []);
        const parentRemovable = disk.rm || disk.hotplug;

        for (const part of partitions) {
          if (part.type !== 'part') continue;
          if (!part.fstype) continue;
          if (part.fstype === 'swap') continue;

          const mounted = !!part.mountpoint && part.mountpoint !== '[SWAP]';
          const mountPoint = part.mountpoint || '';
          const isRemovable = part.rm || part.hotplug || parentRemovable;

          // Skip system mount points for non-removable drives
          if (mounted && !isRemovable) {
            if (systemMounts.has(mountPoint)) continue;
            if (systemPrefixes.some((p) => mountPoint.startsWith(p))) continue;
          }

          // For mounted drives, verify we can access them
          if (mounted) {
            try {
              await access(mountPoint);
            } catch {
              continue; // No permission
            }
          }

          const label = part.label || (mounted ? basename(mountPoint) : basename(part.name));
          drives.push({
            name: label,
            path: mounted ? mountPoint : '',
            devicePath: part.name,
            isRemovable,
            isMounted: mounted,
            size: part.size,
            fsType: part.fstype,
          });
        }
      }
    } catch {
      // lsblk not available — no additional drives
    }
  }

  private async listMacDrives(drives: DriveInfo[]): Promise<void> {
    try {
      const volumes = await readdir('/Volumes');
      for (const vol of volumes) {
        const volPath = `/Volumes/${vol}`;
        try {
          await access(volPath);
          drives.push({
            name: vol,
            path: volPath,
            isRemovable: vol !== 'Macintosh HD',
            isMounted: true,
          });
        } catch {
          // No access
        }
      }
    } catch {
      // /Volumes not readable
    }
  }

  private async listWindowsDrives(drives: DriveInfo[]): Promise<void> {
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const drivePath = `${letter}:\\`;
      try {
        await access(drivePath);
        drives.push({
          name: `${letter}:`,
          path: drivePath,
          isRemovable: !['C'].includes(letter),
          isMounted: true,
        });
      } catch {
        // Drive doesn't exist or inaccessible
      }
    }
  }
}

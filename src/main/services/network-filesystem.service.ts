import {
  access,
  mkdir as fsMkdir,
  realpath,
  rm,
  rename as fsRename,
  stat as fsStat,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { FilesystemService } from './filesystem.service';
import type { DirectoryListing } from '@shared/types/filesystem';
import type { MountableConnectionProfile } from '@shared/types/connection';

export class NetworkFilesystemService {
  private filesystem = new FilesystemService();
  private profiles: Map<string, MountableConnectionProfile> = new Map();

  async connect(connectionId: string, profile: MountableConnectionProfile): Promise<void> {
    const root = this.normalizeRoot(profile.mountPath);
    const stats = await fsStat(root);
    if (!stats.isDirectory()) {
      throw new Error('mountPath must be a directory');
    }
    this.profiles.set(connectionId, { ...profile, mountPath: root });
  }

  disconnect(connectionId: string): void {
    this.profiles.delete(connectionId);
  }

  async list(connectionId: string, requestedPath?: string): Promise<DirectoryListing> {
    const path = await this.resolveExistingPath(connectionId, requestedPath);
    return this.filesystem.readDirectory(path);
  }

  async mkdir(connectionId: string, requestedPath: string): Promise<void> {
    await fsMkdir(await this.resolveWritablePath(connectionId, requestedPath), { recursive: true });
  }

  async remove(connectionId: string, paths: string[]): Promise<void> {
    const results = await Promise.allSettled(
      paths.map(async (path) => {
        await rm(await this.resolveExistingPath(connectionId, path), { recursive: true, force: false });
      }),
    );
    const failures = results
      .map((result, index) => ({ result, path: paths[index] }))
      .filter((entry): entry is { result: PromiseRejectedResult; path: string } =>
        entry.result.status === 'rejected',
      );

    if (failures.length > 0) {
      const failedPaths = failures
        .slice(0, 3)
        .map((failure) => `${failure.path}: ${
          failure.result.reason instanceof Error ? failure.result.reason.message : 'delete failed'
        }`);
      const suffix = failures.length > failedPaths.length
        ? ` and ${failures.length - failedPaths.length} more`
        : '';
      throw new Error(`Failed to delete ${failures.length} of ${paths.length}: ${failedPaths.join(', ')}${suffix}`);
    }
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    await fsRename(
      await this.resolveExistingPath(connectionId, oldPath),
      await this.resolveWritablePath(connectionId, newPath),
    );
  }

  getDefaultPath(connectionId: string): string {
    const profile = this.getProfile(connectionId);
    return this.getLexicalPath(connectionId, profile.defaultPath || profile.mountPath);
  }

  async assertTransferPath(
    connectionId: string,
    requestedPath: string,
    options: { writable?: boolean } = {},
  ): Promise<void> {
    if (options.writable) {
      await this.resolveWritablePath(connectionId, requestedPath);
    } else {
      await this.resolveExistingPath(connectionId, requestedPath);
    }
  }

  private getProfile(connectionId: string): MountableConnectionProfile {
    const profile = this.profiles.get(connectionId);
    if (!profile) throw new Error('Not connected');
    return profile;
  }

  private normalizeRoot(mountPath: string): string {
    if (!mountPath) throw new Error('Mount path is required');
    return resolve(mountPath);
  }

  private getLexicalPath(connectionId: string, requestedPath?: string): string {
    const profile = this.getProfile(connectionId);
    const root = this.normalizeRoot(profile.mountPath);
    const path = requestedPath && requestedPath.length > 0
      ? resolve(requestedPath.startsWith(root) ? requestedPath : join(root, requestedPath))
      : root;

    const rel = relative(root, path);
    if (this.isOutsideRoot(rel)) {
      throw new Error('Path is outside the configured mount path');
    }
    return path;
  }

  private async assertPathWithinRoot(connectionId: string, existingPath: string): Promise<void> {
    const profile = this.getProfile(connectionId);
    const realRoot = await realpath(this.normalizeRoot(profile.mountPath));
    const realTarget = await realpath(existingPath);
    const rel = relative(realRoot, realTarget);
    if (this.isOutsideRoot(rel)) {
      throw new Error('Path is outside the configured mount path');
    }
  }

  private async resolveExistingPath(connectionId: string, requestedPath?: string): Promise<string> {
    const path = this.getLexicalPath(connectionId, requestedPath);
    await this.assertPathWithinRoot(connectionId, path);
    return path;
  }

  private async resolveWritablePath(connectionId: string, requestedPath: string): Promise<string> {
    const path = this.getLexicalPath(connectionId, requestedPath);
    const profile = this.getProfile(connectionId);
    const root = this.normalizeRoot(profile.mountPath);
    const existingAncestor = await this.findExistingAncestor(dirname(path), root);
    await this.assertPathWithinRoot(connectionId, existingAncestor);
    return path;
  }

  private async findExistingAncestor(path: string, root: string): Promise<string> {
    let current = path;
    while (current !== root && current !== dirname(current)) {
      try {
        await access(current);
        return current;
      } catch {
        current = dirname(current);
      }
    }
    return root;
  }

  private isOutsideRoot(relativePath: string): boolean {
    return relativePath === '..' ||
      relativePath.startsWith(`..${pathSeparator()}`) ||
      isAbsolute(relativePath);
  }
}

function pathSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

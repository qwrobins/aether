import { SftpService } from './sftp.service';
import type { RsyncConnectionProfile, SftpConnectionProfile } from '@shared/types/connection';
import type { DirectoryListing } from '@shared/types/filesystem';
import type { SftpDeleteResult, SftpTransferClient } from '@shared/types/transfer';

function toSftpProfile(profile: RsyncConnectionProfile): SftpConnectionProfile {
  return {
    ...profile,
    type: 'sftp',
    port: profile.sshPort || 22,
    defaultPath: profile.defaultPath || profile.module || '/',
  };
}

export class RsyncService {
  private sftp = new SftpService();

  async connect(connectionId: string, profile: RsyncConnectionProfile): Promise<void> {
    await this.sftp.connect(connectionId, toSftpProfile(profile));
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.sftp.disconnect(connectionId);
  }

  getClient(connectionId: string) {
    return this.sftp.getClient(connectionId);
  }

  async createTransferClient(connectionId: string): Promise<SftpTransferClient> {
    return this.sftp.createTransferClient(connectionId);
  }

  async list(connectionId: string, remotePath: string): Promise<DirectoryListing> {
    return this.sftp.list(connectionId, remotePath);
  }

  async *walkFilesRecursive(
    connectionId: string,
    dirPath: string,
    options = {},
  ): AsyncGenerator<{ path: string; relativePath: string; size: number }> {
    yield* this.sftp.walkFilesRecursive(connectionId, dirPath, options);
  }

  async mkdir(connectionId: string, remotePath: string): Promise<void> {
    return this.sftp.mkdir(connectionId, remotePath);
  }

  async remove(connectionId: string, paths: string[]): Promise<SftpDeleteResult> {
    return this.sftp.remove(connectionId, paths);
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    return this.sftp.rename(connectionId, oldPath, newPath);
  }
}

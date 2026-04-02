import type { ConnectionType } from './connection';

export type TransferDirection = 'upload' | 'download';
export type TransferStatus = 'queued' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface TransferRequest {
  sourcePath: string;
  destinationPath: string;
  direction: TransferDirection;
  connectionId: string;
  connectionType: ConnectionType;
  bucket?: string;
}

export interface TransferItem {
  id: string;
  fileName: string;
  sourcePath: string;
  destinationPath: string;
  tempPath?: string;
  direction: TransferDirection;
  connectionId: string;
  connectionType: ConnectionType;
  bucket?: string;
  size: number;
  bytesTransferred: number;
  status: TransferStatus;
  speed: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
}

export interface TransferProgress {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  speed: number;
}

export interface SftpTransferClient {
  mkdir: (path: string, recursive: boolean) => Promise<void>;
  fastPut: (
    sourcePath: string,
    destinationPath: string,
    options: { step: (totalTransferred: number, chunk: number, total: number) => void },
  ) => Promise<void>;
  stat: (path: string) => Promise<{ size: number }>;
  fastGet: (
    sourcePath: string,
    destinationPath: string,
    options: { step: (totalTransferred: number, chunk: number, total: number) => void },
  ) => Promise<void>;
  abort?: () => Promise<void>;
  disconnect?: () => Promise<void>;
}

export type TransferResult =
  | {
      transferId: string;
      status: 'completed';
      success: true;
    }
  | {
      transferId: string;
      status: 'failed';
      success: false;
      error: string;
    }
  | {
      transferId: string;
      status: 'cancelled';
      success: false;
    };

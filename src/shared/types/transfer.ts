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

export interface TransferResult {
  transferId: string;
  status: Extract<TransferStatus, 'completed' | 'failed' | 'cancelled'>;
  success: boolean;
  error?: string;
}

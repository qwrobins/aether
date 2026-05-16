export type TaildropAvailabilityStatus =
  | 'available'
  | 'missing'
  | 'unavailable'
  | 'unsupported';

export interface TaildropAvailability {
  status: TaildropAvailabilityStatus;
  platform: NodeJS.Platform;
  message?: string;
}

export interface TaildropTarget {
  id: string;
  name: string;
  address?: string;
  status: 'available' | 'offline' | 'unavailable';
  detail?: string;
}

export interface TaildropSendRequest {
  targetId: string;
  sourcePaths: string[];
}

export interface TaildropReceiveRequest {
  destinationPath: string;
}

export interface TaildropReceiveResult {
  destinationPath: string;
  files: string[];
  message?: string;
}

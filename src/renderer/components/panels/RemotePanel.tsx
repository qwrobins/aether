import { CloudOff } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';

export function RemotePanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-hidden">
      <EmptyState
        icon={CloudOff}
        title="No connection"
        subtitle="Connect to S3 or SFTP to browse remote files"
      />
    </div>
  );
}

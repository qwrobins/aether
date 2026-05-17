import { Cloud, Database, FolderSync, Network, Server } from 'lucide-react';
import { siGooglecloudstorage, siTailscale } from 'simple-icons';
import { cn } from '@/lib/utils';
import type { ConnectionType } from '@shared/types/connection';

type ProviderIconKind = ConnectionType | 'taildrop' | 'tailscale' | 's3-bucket';

interface ProviderIconProps {
  type: ProviderIconKind;
  size?: number;
  className?: string;
}

const brandPaths: Partial<Record<ProviderIconKind, { path: string; title: string }>> = {
  gcs: { path: siGooglecloudstorage.path, title: siGooglecloudstorage.title },
  taildrop: { path: siTailscale.path, title: siTailscale.title },
  tailscale: { path: siTailscale.path, title: siTailscale.title },
};

export function ProviderIcon({ type, size = 16, className }: ProviderIconProps) {
  const brand = brandPaths[type];
  if (brand) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={cn('shrink-0 fill-current', className)}
      >
        <path d={brand.path} />
      </svg>
    );
  }

  if (type === 's3') {
    return <AwsMark size={size} className={className} />;
  }

  if (type === 'azure-blob') {
    return <AzureMark size={size} className={className} />;
  }

  if (type === 's3-bucket') {
    return <Database size={size} className={cn('text-primary/80', className)} />;
  }

  if (type === 'sftp' || type === 'ftp' || type === 'ftps') {
    return <Server size={size} className={cn('text-emerald-400/80', className)} />;
  }

  if (type === 'rsync') {
    return <FolderSync size={size} className={cn('text-emerald-400/80', className)} />;
  }

  if (type === 'smb' || type === 'nfs' || type === 'webdav') {
    return <Network size={size} className={cn('text-amber-300/80', className)} />;
  }

  return <Cloud size={size} className={cn('text-primary/80', className)} />;
}

function AwsMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
    >
      <text
        x="12"
        y="11.4"
        textAnchor="middle"
        className="fill-current font-mono text-[7px] font-semibold"
      >
        aws
      </text>
      <path
        d="M6.2 14.2c3.3 1.9 7.3 2 11.2.2"
        className="fill-none stroke-[#ff9900]"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M17.1 14.4l1.8-.9-.5 1.9" className="fill-none stroke-[#ff9900]" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AzureMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
    >
      <path d="M8.9 3.5 3.8 18.2h4.5l.9-2.9h5.2l-2.7-4.5-1.6 4.5H7.5l3.4-9.7z" className="fill-[#0078d4]" />
      <path d="M12.2 3.5 20.2 20.5h-5.1l-2.5-4.6h-3.4l4.7-12.4z" className="fill-[#50a7f9]" />
    </svg>
  );
}

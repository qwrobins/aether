import { Plus, Pencil, Trash2, Cloud, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ConnectionProfile } from '@shared/types/connection';

interface ConnectionListProps {
  profiles: ConnectionProfile[];
  onEdit: (profile: ConnectionProfile) => void;
  onDelete: (id: string) => void;
  onNewConnection: () => void;
}

function getDisplayHost(profile: ConnectionProfile): string {
  if (profile.type === 's3') {
    return profile.defaultBucket
      ? `${profile.region} / ${profile.defaultBucket}`
      : profile.region;
  }
  return `${profile.host}:${profile.port}`;
}

export function ConnectionList({ profiles, onEdit, onDelete, onNewConnection }: ConnectionListProps) {
  return (
    <div className="flex flex-col gap-2 px-1">
      {profiles.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Cloud size={28} className="opacity-30" />
          <p className="text-[13px]">No saved connections</p>
          <p className="text-[11px] opacity-60">
            Add a connection to get started
          </p>
        </div>
      )}

      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="group flex h-16 items-center gap-0 rounded-lg border border-border bg-card transition-colors duration-150 hover:bg-white/[0.03]"
        >
          {/* Accent strip */}
          <div
            className={`w-1 self-stretch rounded-l-lg ${
              profile.type === 's3' ? 'bg-primary' : 'bg-emerald-500'
            }`}
          />

          {/* Content */}
          <div className="flex flex-1 items-center gap-3 px-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-white/[0.04]">
              {profile.type === 's3' ? (
                <Cloud size={16} className="text-primary/80" />
              ) : (
                <Server size={16} className="text-emerald-400/80" />
              )}
            </div>

            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
              <span className="truncate text-[14px] font-medium leading-tight">
                {profile.name}
              </span>
              <span className="truncate font-mono text-[11px] leading-tight text-muted-foreground">
                {getDisplayHost(profile)}
              </span>
            </div>

            <Badge
              variant="outline"
              className="shrink-0 text-[10px] uppercase tracking-wider"
            >
              {profile.type}
            </Badge>
          </div>

          {/* Actions — visible on hover */}
          <div className="flex items-center gap-0.5 pr-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEdit(profile)}
              aria-label={`Edit ${profile.name}`}
            >
              <Pencil size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDelete(profile.id)}
              aria-label={`Delete ${profile.name}`}
            >
              <Trash2 size={13} className="text-destructive/70" />
            </Button>
          </div>
        </div>
      ))}

      {/* New connection card */}
      <button
        onClick={onNewConnection}
        className="flex h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:text-primary"
      >
        <Plus size={16} />
        <span className="text-[13px] font-medium">New Connection</span>
      </button>
    </div>
  );
}

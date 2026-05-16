import { IpcChannels } from '@shared/constants/channels';
import { useTransferStore } from '@/stores/transferStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { useConnectionStore } from '@/stores/connectionStore';
import appIcon from '../../../../assets/icon.png';

export function TitleBar() {
  const transfers = useTransferStore((s) => s.transfers);
  const activeConnectionId = useRemotePanelStore((s) => s.activeConnectionId);
  const connectionStatus = useRemotePanelStore((s) => s.connectionStatus);
  const connectionError = useRemotePanelStore((s) => s.connectionError);
  const activeProfile = useRemotePanelStore((s) => s.activeProfile);
  const profiles = useConnectionStore((s) => s.profiles);

  const activeCount = transfers.filter((t) => t.status === 'active').length;
  const queuedCount = transfers.filter((t) => t.status === 'queued').length;
  const hasTransferActivity = activeCount > 0 || queuedCount > 0;
  const displayedProfile =
    activeProfile ??
    profiles.find((profile) => profile.id === activeConnectionId) ??
    null;

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';
  const isError = connectionStatus === 'error';

  return (
    <div
      className="relative z-30 flex h-[var(--titlebar-height)] shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-surface to-card px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <img
          src={appIcon}
          alt=""
          aria-hidden="true"
          className="h-4 w-4 shrink-0 rounded-[4px] object-contain"
        />
        <span className="text-[13px] font-semibold tracking-[0.08em] text-foreground/90">
          Aether
        </span>

        {/* Activity indicators */}
        <div
          className="ml-3 flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Transfer activity pill */}
          {hasTransferActivity && (
            <div className="flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/15 px-2 py-0.5 shadow-[0_0_16px_oklch(0.78_0.16_75/0.10)]">
              <span className="relative inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-accent">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" />
              </span>
              <span className="text-[10px] font-semibold text-accent/80">
                {activeCount > 0 && queuedCount > 0
                  ? `${activeCount} active, ${queuedCount} queued`
                  : activeCount > 0
                    ? `${activeCount} active`
                    : `${queuedCount} queued`}
              </span>
            </div>
          )}

          {/* Connection status pill */}
          {isConnected && displayedProfile && (
            <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/15 px-2 py-0.5 shadow-[0_0_16px_oklch(0.62_0.25_280/0.10)]">
              <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-success" />
              <span className="max-w-[120px] truncate text-[10px] font-semibold text-primary/85">
                {displayedProfile.name}
              </span>
            </div>
          )}

          {isConnecting && displayedProfile && (
            <div className="flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/15 px-2 py-0.5 shadow-[0_0_16px_oklch(0.78_0.16_75/0.10)]">
              <span className="relative inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-warning">
                <span className="absolute inset-0 animate-ping rounded-full bg-warning/50" />
              </span>
              <span className="max-w-[120px] truncate text-[10px] font-semibold text-warning/80">
                Connecting {displayedProfile.name}
              </span>
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5">
              <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-destructive" />
              <span className="max-w-[160px] truncate text-[10px] font-semibold text-destructive/80">
                {connectionError ?? 'Connection failed'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Minimize"
          onClick={() => window.api?.invoke(IpcChannels.WINDOW_MINIMIZE)}
        >
          &#8722;
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Maximize"
          onClick={() => window.api?.invoke(IpcChannels.WINDOW_MAXIMIZE)}
        >
          &#9633;
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-red-500/80 hover:text-white"
          aria-label="Close"
          onClick={() => window.api?.invoke(IpcChannels.WINDOW_CLOSE)}
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { House, Monitor, Download, Cloud, Server, Settings, X, HardDrive, Disc, Slash, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRemotePanelStore } from '@/stores/remotePanelStore';
import { ConnectionManager } from '@/components/connection/ConnectionManager';

const quickAccessItems = [
  { label: 'Home', icon: House, pathKey: 'home' as const },
  { label: 'Desktop', icon: Monitor, pathKey: 'desktop' as const },
  { label: 'Downloads', icon: Download, pathKey: 'downloads' as const },
];

function getQuickAccessPath(pathKey: string, homePath: string): string {
  switch (pathKey) {
    case 'home':
      return homePath;
    case 'desktop':
      return `${homePath}/Desktop`;
    case 'downloads':
      return `${homePath}/Downloads`;
    default:
      return homePath;
  }
}

function ConnectionStatusDot({ profileId }: { profileId: string }) {
  const { activeConnectionId, connectionStatus } = useRemotePanelStore();
  const isActive = activeConnectionId === profileId;
  const isConnecting = connectionStatus === 'connecting';

  if (isActive) {
    return (
      <span className="relative inline-block size-[6px] shrink-0 rounded-full bg-success">
        <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />
      </span>
    );
  }

  if (isConnecting && useRemotePanelStore.getState().activeProfile?.id === profileId) {
    return (
      <span className="relative inline-block size-[6px] shrink-0 rounded-full bg-amber-400">
        <span className="absolute inset-0 animate-pulse rounded-full bg-amber-400/60" />
      </span>
    );
  }

  if (connectionStatus === 'error' && useRemotePanelStore.getState().activeProfile?.id === profileId) {
    return (
      <span className="inline-block size-[6px] shrink-0 rounded-full bg-destructive" />
    );
  }

  return (
    <span className="inline-block size-[6px] shrink-0 rounded-full bg-muted-foreground/40" />
  );
}

interface DriveInfo {
  name: string;
  path: string;
  devicePath?: string;
  isRemovable: boolean;
  isMounted: boolean;
  size?: string;
  fsType?: string;
}

export function AppSidebar() {
  const { navigateTo } = useLocalPanelStore();
  const { profiles, loadProfiles } = useConnectionStore();
  const { activeConnectionId, connect, disconnect } = useRemotePanelStore();
  const [connectionManagerOpen, setConnectionManagerOpen] = useState(false);
  const [drives, setDrives] = useState<DriveInfo[]>([]);

  const loadDrives = useCallback(async () => {
    try {
      const result = await window.api.invoke('fs:list-drives');
      setDrives(result);
    } catch {
      // Drives unavailable
    }
  }, []);

  async function handleDriveClick(drive: DriveInfo) {
    if (drive.isMounted && drive.path) {
      navigateTo(drive.path);
      return;
    }

    // Attempt to mount unmounted drive
    if (drive.devicePath) {
      try {
        const mountPath = await window.api.invoke('fs:mount-drive', drive.devicePath);
        toast.success(`Mounted ${drive.name} at ${mountPath}`);
        navigateTo(mountPath);
        // Refresh drive list to update mount status
        loadDrives();
      } catch (err) {
        toast.error(`Failed to mount ${drive.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  useEffect(() => {
    loadProfiles();
    loadDrives();
  }, [loadProfiles, loadDrives]);

  async function handleQuickAccess(pathKey: string) {
    const home = await window.api.invoke('fs:get-home');
    const target = getQuickAccessPath(pathKey, home);
    navigateTo(target);
  }

  async function handleConnectionClick(profileId: string) {
    // If already connected to this profile, do nothing
    if (activeConnectionId === profileId) return;

    // If connected to a different profile, disconnect first
    if (activeConnectionId) {
      await disconnect();
    }

    const profile = profiles.find((p) => p.id === profileId);
    if (profile) {
      await connect(profile);
    }
  }

  async function handleDisconnect(e: React.MouseEvent) {
    e.stopPropagation();
    await disconnect();
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.05em]">
              Quick Access
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {quickAccessItems.map((item) => (
                  <SidebarMenuItem key={item.pathKey}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      onClick={() => handleQuickAccess(item.pathKey)}
                    >
                      <item.icon size={16} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {drives.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.05em]">
                Volumes
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {drives.map((drive) => (
                    <SidebarMenuItem key={drive.devicePath || drive.path}>
                      <SidebarMenuButton
                        tooltip={
                          drive.isMounted
                            ? `${drive.name} — ${drive.path}${drive.size ? ` (${drive.size})` : ''}`
                            : `${drive.name} — not mounted${drive.size ? ` (${drive.size})` : ''} — click to mount`
                        }
                        onClick={() => handleDriveClick(drive)}
                        className={cn(!drive.isMounted && drive.path !== '/' && 'opacity-50')}
                      >
                        {drive.path === '/' ? (
                          <Slash size={16} className="text-muted-foreground/70" />
                        ) : !drive.isMounted ? (
                          <CircleDashed size={16} className="text-muted-foreground/40" />
                        ) : drive.isRemovable ? (
                          <Disc size={16} className="text-amber-400/70" />
                        ) : (
                          <HardDrive size={16} className="text-muted-foreground/70" />
                        )}
                        <span className="truncate">{drive.name}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground/40 group-data-[collapsible=icon]:hidden">
                          {drive.isMounted ? drive.size || drive.path : drive.size || 'unmounted'}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup>
            <div className="flex items-center justify-between pr-2">
              <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.05em]">
                Connections
              </SidebarGroupLabel>
              <Button
                variant="ghost"
                size="icon-xs"
                className="group-data-[collapsible=icon]:hidden"
                onClick={() => setConnectionManagerOpen(true)}
                aria-label="Manage connections"
              >
                <Settings size={13} className="text-muted-foreground" />
              </Button>
            </div>
            <SidebarGroupContent>
              {profiles.length === 0 ? (
                <div className="flex flex-col items-center gap-1 px-2 py-4 group-data-[collapsible=icon]:hidden">
                  <span className="text-[11px] text-muted-foreground/60">
                    No connections
                  </span>
                </div>
              ) : (
                <SidebarMenu>
                  {profiles.map((profile) => (
                    <SidebarMenuItem key={profile.id}>
                      <SidebarMenuButton
                        tooltip={profile.name}
                        onClick={() => handleConnectionClick(profile.id)}
                        className={cn(
                          activeConnectionId === profile.id &&
                            'bg-[radial-gradient(ellipse_at_left,oklch(0.62_0.25_280/0.06),transparent_70%)]'
                        )}
                      >
                        <ConnectionStatusDot profileId={profile.id} />
                        {profile.type === 's3' ? (
                          <Cloud size={14} className="text-primary/60" />
                        ) : (
                          <Server size={14} className="text-emerald-400/60" />
                        )}
                        <span className="truncate text-[13px]">{profile.name}</span>
                        {activeConnectionId === profile.id && (
                          <button
                            onClick={handleDisconnect}
                            className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground"
                            aria-label="Disconnect"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarTrigger className="w-full" />
        </SidebarFooter>
      </Sidebar>

      <ConnectionManager
        open={connectionManagerOpen}
        onOpenChange={setConnectionManagerOpen}
      />
    </>
  );
}

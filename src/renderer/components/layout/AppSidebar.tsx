import { useEffect, useState } from 'react';
import { House, Monitor, Download, Cloud, Server, Settings } from 'lucide-react';
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

export function AppSidebar() {
  const { navigateTo } = useLocalPanelStore();
  const { profiles, loadProfiles } = useConnectionStore();
  const [connectionManagerOpen, setConnectionManagerOpen] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  async function handleQuickAccess(pathKey: string) {
    const home = await window.api.invoke('fs:get-home');
    const target = getQuickAccessPath(pathKey, home);
    navigateTo(target);
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
                      <SidebarMenuButton tooltip={profile.name}>
                        <span
                          className={`inline-block size-[6px] shrink-0 rounded-full ${
                            profile.type === 's3'
                              ? 'bg-primary/40'
                              : 'bg-emerald-500/40'
                          }`}
                        />
                        {profile.type === 's3' ? (
                          <Cloud size={14} className="text-primary/60" />
                        ) : (
                          <Server size={14} className="text-emerald-400/60" />
                        )}
                        <span className="truncate text-[13px]">{profile.name}</span>
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

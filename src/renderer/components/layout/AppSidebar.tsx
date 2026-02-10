import { House, Monitor, Download, CloudOff } from 'lucide-react';
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
import { useLocalPanelStore } from '@/stores/localPanelStore';

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
  const { currentPath, navigateTo } = useLocalPanelStore();

  async function handleQuickAccess(pathKey: string) {
    const home = await window.api.invoke('fs:get-home');
    const target = getQuickAccessPath(pathKey, home);
    navigateTo(target);
  }

  return (
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
          <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.05em]">
            Connections
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="flex flex-col items-center gap-1 px-2 py-4 group-data-[collapsible=icon]:hidden">
              <CloudOff size={20} className="text-muted-foreground/30" />
              <span className="text-[11px] text-muted-foreground/60">
                No connections yet
              </span>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarTrigger className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
}

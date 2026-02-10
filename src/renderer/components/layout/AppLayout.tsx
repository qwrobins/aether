import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { TitleBar } from './TitleBar';
import { AppSidebar } from './AppSidebar';
import { LocalPanel } from '@/components/panels/LocalPanel';
import { RemotePanel } from '@/components/panels/RemotePanel';
import { TransferQueue } from '@/components/transfer/TransferQueue';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function AppLayout() {
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <TitleBar />
      <SidebarProvider defaultOpen={true}>
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex flex-1 flex-col overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              <ResizablePanel defaultSize={50} minSize={25}>
                <LocalPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={25}>
                <RemotePanel />
              </ResizablePanel>
            </ResizablePanelGroup>
            <TransferQueue />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

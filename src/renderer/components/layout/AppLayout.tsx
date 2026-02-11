import { useRef, useCallback, useEffect, useState } from 'react';
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
import { GripHorizontal } from 'lucide-react';

const STORAGE_KEY = 'aether-transfer-height';
const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 60;

export function AppLayout() {
  useKeyboardShortcuts();

  const [transferHeight, setTransferHeight] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Math.max(MIN_HEIGHT, parseInt(saved, 10)) : DEFAULT_HEIGHT;
    } catch {
      return DEFAULT_HEIGHT;
    }
  });

  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const maxHeight = containerRect.height * 0.6;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, containerRect.bottom - e.clientY));
      setTransferHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist
      try {
        localStorage.setItem(STORAGE_KEY, String(Math.round(transferHeight)));
      } catch { /* ignore */ }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [transferHeight]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <TitleBar />
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* File panels */}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ResizablePanelGroup orientation="horizontal">
                  <ResizablePanel defaultSize={50} minSize={25} className="!overflow-hidden">
                    <LocalPanel />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} minSize={25} className="!overflow-hidden">
                    <RemotePanel />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>

              {/* Drag handle */}
              <div
                onMouseDown={handleMouseDown}
                className="group flex h-3 shrink-0 cursor-ns-resize items-center justify-center border-y border-border/50 bg-card/80 transition-colors hover:bg-primary/[0.06] active:bg-primary/[0.1]"
              >
                <GripHorizontal className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground/70" />
              </div>

              {/* Transfer queue */}
              <div
                className="shrink-0 overflow-hidden"
                style={{ height: transferHeight }}
              >
                <TransferQueue />
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

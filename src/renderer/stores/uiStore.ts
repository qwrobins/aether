import { create } from 'zustand';

interface UiState {
  sidebarExpanded: boolean;
  transferQueueExpanded: boolean;
  theme: 'dark' | 'light' | 'system';
  toggleSidebar: () => void;
  toggleTransferQueue: () => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarExpanded: true,
  transferQueueExpanded: false,
  theme: 'dark',
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  toggleTransferQueue: () => set((s) => ({ transferQueueExpanded: !s.transferQueueExpanded })),
  setTheme: (theme) => set({ theme }),
}));
